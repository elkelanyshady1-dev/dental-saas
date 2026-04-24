/**
 * assertSchemaIntegrity.js
 * ────────────────────────
 * Recursive boot-time integrity check for Zod schemas.
 *
 * Catches malformed schemas BEFORE they reach a request. The motivating bug
 * was Zod v4's signature change for `z.record`: passing a single argument
 * silently produces a schema with `valueType === undefined`, which crashes
 * at `.parse()` time with `TypeError: ... reading '_zod'`.
 *
 * Internal field names target Zod v4 (`_zod.def.type`, `def.shape`,
 * `def.element`, `def.innerType`, …). v3 fallbacks included where cheap.
 */

"use strict";

function getDef(schema) {
    return schema?._zod?.def || schema?._def || null;
}

function getTypeId(def) {
    // Zod v4: lowercase string ("object", "array", "record", …)
    // Zod v3: PascalCase ("ZodObject", "ZodArray", …)
    return def?.type || def?.typeName || null;
}

function isZodSchema(value) {
    return Boolean(value) && typeof value === "object" && getDef(value) !== null;
}

function assertSchemaIntegrity(schema, path = "root", visited = new WeakSet()) {
    if (!isZodSchema(schema)) {
        throw new Error(`[SchemaIntegrity] Not a Zod schema at ${path} (got ${typeof schema})`);
    }

    if (visited.has(schema)) return; // cycle break (z.lazy can loop)
    visited.add(schema);

    const def = getDef(schema);
    const typeId = getTypeId(def);

    switch (typeId) {
        case "object":
        case "ZodObject": {
            const rawShape = typeof def.shape === "function" ? def.shape() : def.shape;
            if (!rawShape || typeof rawShape !== "object") {
                throw new Error(`[SchemaIntegrity] Object schema missing shape at ${path}`);
            }
            for (const [key, value] of Object.entries(rawShape)) {
                if (!value) {
                    throw new Error(`[SchemaIntegrity] Undefined field schema at ${path}.${key}`);
                }
                assertSchemaIntegrity(value, `${path}.${key}`, visited);
            }
            break;
        }

        case "array":
        case "ZodArray": {
            // v4: def.element  |  v3: def.type
            const inner = def.element || def.type;
            if (!inner || !isZodSchema(inner)) {
                throw new Error(`[SchemaIntegrity] Array schema missing inner element at ${path}`);
            }
            assertSchemaIntegrity(inner, `${path}[]`, visited);
            break;
        }

        case "union":
        case "ZodUnion":
        case "discriminatedUnion":
        case "ZodDiscriminatedUnion": {
            const options = def.options;
            if (!Array.isArray(options) || options.length === 0) {
                throw new Error(`[SchemaIntegrity] Union schema has no options at ${path}`);
            }
            options.forEach((opt, i) => {
                if (!opt) {
                    throw new Error(`[SchemaIntegrity] Undefined union option at ${path}.union[${i}]`);
                }
                assertSchemaIntegrity(opt, `${path}.union[${i}]`, visited);
            });
            break;
        }

        case "intersection":
        case "ZodIntersection": {
            if (!def.left || !def.right) {
                throw new Error(`[SchemaIntegrity] Intersection missing left/right at ${path}`);
            }
            assertSchemaIntegrity(def.left, `${path}.left`, visited);
            assertSchemaIntegrity(def.right, `${path}.right`, visited);
            break;
        }

        case "tuple":
        case "ZodTuple": {
            const items = def.items || [];
            items.forEach((item, i) => {
                if (!item) {
                    throw new Error(`[SchemaIntegrity] Undefined tuple item at ${path}[${i}]`);
                }
                assertSchemaIntegrity(item, `${path}[${i}]`, visited);
            });
            break;
        }

        case "record":
        case "ZodRecord": {
            // The flagship check — single-arg z.record() leaves valueType undefined
            // in Zod v4. This is the bug that motivated the whole module.
            if (!def.valueType) {
                throw new Error(
                    `[SchemaIntegrity] Malformed record schema at ${path} — missing valueType. ` +
                    `Likely v3-style z.record(value) — use z.record(z.string(), value).`
                );
            }
            // keyType is also required in v4
            if (!def.keyType) {
                throw new Error(`[SchemaIntegrity] Record schema missing keyType at ${path}`);
            }
            assertSchemaIntegrity(def.keyType, `${path}.key`, visited);
            assertSchemaIntegrity(def.valueType, `${path}.value`, visited);
            break;
        }

        case "map":
        case "ZodMap": {
            if (!def.keyType || !def.valueType) {
                throw new Error(`[SchemaIntegrity] Map schema missing keyType/valueType at ${path}`);
            }
            assertSchemaIntegrity(def.keyType, `${path}.key`, visited);
            assertSchemaIntegrity(def.valueType, `${path}.value`, visited);
            break;
        }

        case "set":
        case "ZodSet": {
            const inner = def.valueType || def.element;
            if (!inner) {
                throw new Error(`[SchemaIntegrity] Set schema missing inner type at ${path}`);
            }
            assertSchemaIntegrity(inner, `${path}.value`, visited);
            break;
        }

        case "optional":
        case "ZodOptional":
        case "nullable":
        case "ZodNullable":
        case "default":
        case "ZodDefault":
        case "catch":
        case "ZodCatch":
        case "readonly":
        case "ZodReadonly":
        case "branded":
        case "ZodBranded":
        case "promise":
        case "ZodPromise": {
            const inner = def.innerType;
            if (!inner) {
                throw new Error(`[SchemaIntegrity] Wrapper schema (${typeId}) missing innerType at ${path}`);
            }
            assertSchemaIntegrity(inner, `${path}.inner`, visited);
            break;
        }

        case "pipe":
        case "ZodPipe":
        case "pipeline":
        case "ZodPipeline": {
            // v4 pipe: in/out
            const inSchema = def.in || def.left;
            const outSchema = def.out || def.right;
            if (inSchema) assertSchemaIntegrity(inSchema, `${path}.in`, visited);
            if (outSchema) assertSchemaIntegrity(outSchema, `${path}.out`, visited);
            break;
        }

        case "lazy":
        case "ZodLazy": {
            if (typeof def.getter !== "function") {
                throw new Error(`[SchemaIntegrity] Lazy schema missing getter at ${path}`);
            }
            const resolved = def.getter();
            if (!resolved) {
                throw new Error(`[SchemaIntegrity] Lazy schema resolved to undefined at ${path}`);
            }
            assertSchemaIntegrity(resolved, `${path}.lazy`, visited);
            break;
        }

        // Effects / refinements / transforms wrap an inner schema differently
        // in v3 vs v4. In v4, refine() leaves the type identifier as the
        // inner type and adds `def.checks`; the recursion above already
        // covers those. Older v3 ZodEffects has `def.schema`.
        case "effects":
        case "ZodEffects":
        case "transform":
        case "ZodTransform": {
            const inner = def.schema || def.innerType;
            if (inner) assertSchemaIntegrity(inner, `${path}.effects`, visited);
            break;
        }

        // Primitives & terminals (string, number, boolean, enum, literal,
        // date, bigint, symbol, undefined, null, void, any, unknown, never,
        // nan, …): nothing to recurse into. The schema being well-formed
        // is enough.
        default:
            break;
    }
}

/**
 * Walk every named export of a CommonJS schema module and run the integrity
 * check on each value that looks like a Zod schema.
 *
 * Non-schema exports (constants, helpers, plain functions) are skipped.
 */
function assertModuleSchemas(mod, moduleLabel = "<module>") {
    if (!mod || typeof mod !== "object") {
        throw new Error(`[SchemaIntegrity] Module ${moduleLabel} did not export an object`);
    }
    for (const [name, value] of Object.entries(mod)) {
        if (isZodSchema(value)) {
            try {
                assertSchemaIntegrity(value, `${moduleLabel}::${name}`);
            } catch (err) {
                err.message = `[${moduleLabel}::${name}] ${err.message}`;
                throw err;
            }
        }
    }
}

module.exports = {
    assertSchemaIntegrity,
    assertModuleSchemas,
    isZodSchema,
};
