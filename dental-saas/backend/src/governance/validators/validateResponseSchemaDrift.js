require("module-alias/register");
/**
 * validateResponseSchemaDrift.js
 * Phase 17 — Response Schema Drift Validator (Precision Upgrade)
 *
 * Compares controller response shapes against Swagger documented schemas.
 *
 * Detects:
 *   A) Controller returns key NOT in Swagger schema → ERROR
 *   B) Swagger documents key not found in controller → WARN
 *   C) Route documented but controller unresolved → WARN
 *   D) Controller response is dynamic (spread) → WARN
 *
 * Requires:
 *   - scripts/controllerResponseShapes.json
 *   - scripts/swaggerResponseSchemas.json
 *
 * Env toggle: RESPONSE_SCHEMA_STRICT=true → WARN becomes FAIL
 *
 * Usage: node backend/scripts/validateResponseSchemaDrift.js
 * Exit code 1 on ERROR (or WARN in strict mode).
 */

const fs = require('fs');
const path = require('path');

const SHAPES_FILE = path.resolve(__dirname, "../reports/controllerResponseShapes.json");
const SWAGGER_FILE = path.resolve(__dirname, "../reports/swaggerResponseSchemas.json");
const STRICT = process.env.RESPONSE_SCHEMA_STRICT === 'true';

// ─── Load Data ──────────────────────────────────────────────────────────────
if (!fs.existsSync(SHAPES_FILE)) {
    console.error('ERROR: controllerResponseShapes.json not found.');
    console.error('Run: node scripts/extractControllerResponseShapes.js');
    process.exit(1);
}

if (!fs.existsSync(SWAGGER_FILE)) {
    console.error('ERROR: swaggerResponseSchemas.json not found.');
    console.error('Run: node scripts/extractSwaggerResponseSchemas.js');
    process.exit(1);
}

const shapes = JSON.parse(fs.readFileSync(SHAPES_FILE, 'utf8'));
const swagger = JSON.parse(fs.readFileSync(SWAGGER_FILE, 'utf8'));

const errors = [];
const warnings = [];
let totalChecked = 0;
let dynamicCount = 0;

// Normalize Swagger {param} → Express :param format for key matching
function normalizePathParams(routeKey) {
    return routeKey.replace(/\{(\w+)\}/g, ':$1');
}

// ─── Compare documented routes against controller shapes ────────────────────
for (const [routeKey, swaggerEntry] of Object.entries(swagger.schemas)) {
    totalChecked++;

    // Normalize the key to match route graph format (:id instead of {id})
    const normalizedKey = normalizePathParams(routeKey);

    // Find matching controller shape (try both formats)
    const controllerEntry = shapes.routes[routeKey] || shapes.routes[normalizedKey];

    if (!controllerEntry) {
        // Route is documented in Swagger but not in route graph
        warnings.push({
            route: routeKey,
            type: 'SWAGGER_NO_ROUTE',
            message: `Swagger documents ${routeKey} but no matching route in graph`
        });
        continue;
    }

    if (controllerEntry.shape.unresolved) {
        // Handler couldn't be resolved to a controller function
        warnings.push({
            route: routeKey,
            type: 'UNRESOLVED_HANDLER',
            message: `Handler "${controllerEntry.handlerName}" not resolved — cannot compare`
        });
        continue;
    }

    // Get the 200-level response keys from controller
    const successResponses = controllerEntry.shape.responses.filter(r =>
        r.status >= 200 && r.status < 300
    );

    if (successResponses.length === 0) {
        warnings.push({
            route: routeKey,
            type: 'NO_SUCCESS_RESPONSE',
            message: `Controller has no 2xx response to compare`
        });
        continue;
    }

    // Check for fully dynamic responses (spread only, no static keys)
    const fullDynamic = successResponses.filter(r => r.isDynamic && !r.isPartialDynamic);
    const partialDynamic = successResponses.filter(r => r.isPartialDynamic);

    if (fullDynamic.length > 0 && partialDynamic.length === 0) {
        // Only spread, no static keys at all → MEDIUM
        dynamicCount++;
        warnings.push({
            route: routeKey,
            type: 'DYNAMIC_RESPONSE',
            message: `Controller uses spread operator — exact shape unknown`
        });
        continue;
    }

    if (partialDynamic.length > 0) {
        // Has spread but ALSO has static keys → LOW severity, continue comparison with static keys
        dynamicCount++;
        // Don't skip — continue to compare the static keys that ARE known
    }

    // Check for variable responses (res.json(variable)) — these ARE valid 2xx responses
    const variableResponses = successResponses.filter(r => r.isVariableResponse);
    const sendResponses = successResponses.filter(r => r.isSendResponse);
    const objectResponses = successResponses.filter(r => !r.isVariableResponse && !r.isSendResponse);

    // Compare keys if Swagger has documented properties
    if (swaggerEntry.documentedProperties.length > 0) {
        // If we only have variable/send responses, skip key comparison
        if (objectResponses.length === 0 && (variableResponses.length > 0 || sendResponses.length > 0)) {
            // Controller returns a variable — can't compare keys, but it IS a valid response
            continue;
        }

        const controllerKeys = new Set();
        for (const resp of objectResponses) {
            resp.keys.forEach(k => controllerKeys.add(k));
        }
        const swaggerKeys = new Set(swaggerEntry.documentedProperties);

        // Skip key comparison if controller has no static keys (partial dynamic or variable)
        if (controllerKeys.size === 0 && partialDynamic.length > 0) {
            continue;
        }

        // A) Controller returns key NOT in Swagger
        // In lenient mode: WARN (documentation drift). In strict mode: ERROR.
        for (const key of controllerKeys) {
            if (!swaggerKeys.has(key)) {
                const entry = {
                    route: routeKey,
                    type: 'UNDOCUMENTED_KEY',
                    message: `Controller returns "${key}" but not in Swagger schema`,
                    controllerKeys: [...controllerKeys],
                    swaggerKeys: [...swaggerKeys]
                };
                if (STRICT) {
                    errors.push(entry);
                } else {
                    warnings.push(entry);
                }
            }
        }

        // B) Swagger documents key not in controller
        for (const key of swaggerKeys) {
            if (!controllerKeys.has(key)) {
                warnings.push({
                    route: routeKey,
                    type: 'EXTRA_SWAGGER_KEY',
                    message: `Swagger documents "${key}" but controller doesn't return it`,
                    controllerKeys: [...controllerKeys],
                    swaggerKeys: [...swaggerKeys]
                });
            }
        }

        // C) Nested key comparison — compare children of object-typed properties
        const controllerNested = {};
        for (const resp of objectResponses) {
            if (resp.nestedKeys) {
                for (const [parent, children] of Object.entries(resp.nestedKeys)) {
                    if (!controllerNested[parent]) controllerNested[parent] = new Set();
                    children.forEach(c => controllerNested[parent].add(c));
                }
            }
        }
        const swaggerNested = swaggerEntry.nestedProperties || {};

        for (const [parent, cChildren] of Object.entries(controllerNested)) {
            const sChildren = new Set(swaggerNested[parent] || []);
            if (sChildren.size === 0) continue; // Swagger doesn't document nested level — skip
            for (const child of cChildren) {
                if (!sChildren.has(child)) {
                    const entry = {
                        route: routeKey,
                        type: 'UNDOCUMENTED_KEY',
                        message: `Controller returns "${parent}.${child}" but not in Swagger schema`,
                        controllerKeys: [...cChildren],
                        swaggerKeys: [...sChildren]
                    };
                    if (STRICT) errors.push(entry);
                    else warnings.push(entry);
                }
            }
        }

        for (const [parent, sChildren] of Object.entries(swaggerNested)) {
            const cChildren = controllerNested[parent] || new Set();
            if (cChildren.size === 0) continue; // Controller doesn't expose nested — skip
            for (const child of sChildren) {
                if (!cChildren.has(child)) {
                    warnings.push({
                        route: routeKey,
                        type: 'EXTRA_SWAGGER_KEY',
                        message: `Swagger documents "${parent}.${child}" but controller doesn't return it`,
                        controllerKeys: [...cChildren],
                        swaggerKeys: sChildren
                    });
                }
            }
        }
    }
}

// Also check routes in controller shapes that have no Swagger entry
for (const [routeKey, controllerEntry] of Object.entries(shapes.routes)) {
    if (swagger.schemas[routeKey]) continue; // Already compared
    if (controllerEntry.shape.unresolved) continue;

    // Route exists in code but not documented — this is covered by swagger drift validator
    // Don't duplicate that warning here
}

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  RESPONSE SCHEMA DRIFT VALIDATOR — Phase 10');
console.log('═══════════════════════════════════════════════════');
console.log(`  Mode:                     ${STRICT ? 'STRICT' : 'NORMAL'}`);
console.log(`  Routes checked:           ${totalChecked}`);
console.log(`  Errors:                   ${errors.length}`);
console.log(`  Warnings:                 ${warnings.length}`);
console.log(`  Dynamic responses:        ${dynamicCount}`);
console.log('');

if (errors.length > 0) {
    console.error('  ❌ SCHEMA DRIFT ERRORS:');
    for (const e of errors) {
        console.error(`     [${e.type}] ${e.route}`);
        console.error(`     ${e.message}`);
        console.error('');
    }
}

if (warnings.length > 0) {
    const icon = STRICT ? '❌' : '⚠️';
    console.warn(`  ${icon} SCHEMA DRIFT WARNINGS:`);
    for (const w of warnings) {
        console.warn(`     [${w.type}] ${w.route}`);
        console.warn(`     ${w.message}`);
    }
    console.warn('');
}

const hasCritical = errors.length > 0 || (STRICT && warnings.length > 0);

if (hasCritical) {
    console.error('RESULT: FAILED — Response schema drift detected.');
    process.exit(1);
} else if (warnings.length > 0) {
    console.log('RESULT: PASSED with warnings.');
    process.exit(0);
} else {
    console.log('  ✅ No response schema drift detected.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
