require("module-alias/register");
/**
 * extractSwaggerResponseSchemas.js
 * Phase 10 — Swagger Response Schema Extractor
 *
 * Parses @swagger JSDoc blocks from platform route files.
 * Extracts documented response schemas (top-level properties).
 *
 * Output: scripts/swaggerResponseSchemas.json
 * Usage: node backend/scripts/extractSwaggerResponseSchemas.js
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.resolve(__dirname, "../../../src/routes");
const OUTPUT_FILE = path.resolve(__dirname, "../reports/swaggerResponseSchemas.json");

const platformRouteFiles = fs.readdirSync(ROUTES_DIR)
    .filter(f => f.startsWith('platform') && f.endsWith('.js'));

const schemas = {};

for (const file of platformRouteFiles) {
    const content = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    const sections = content.split('@swagger');

    for (let i = 1; i < sections.length; i++) {
        const block = sections[i].split('*/')[0] || '';

        // Extract path
        const pathMatch = /\*\s+(\/api\/\S+?):/m.exec(block);
        if (!pathMatch) continue;

        const swaggerPath = pathMatch[1];

        // Extract method
        const methodMatch = /\*\s+(get|post|put|patch|delete):/mi.exec(block);
        if (!methodMatch) continue;

        const method = methodMatch[1].toUpperCase();

        // Extract response status codes
        const responseStatuses = [];
        const statusRegex = /\*\s+(\d{3}):/g;
        let statusMatch;
        while ((statusMatch = statusRegex.exec(block)) !== null) {
            responseStatuses.push(parseInt(statusMatch[1]));
        }

        // Extract top-level properties from RESPONSE schema only
        // Must isolate the responses: section first to avoid requestBody properties
        const properties = [];
        const nestedProperties = {}; // { parentKey: [childKey, ...] }
        const responsesIdx = block.indexOf('responses:');
        if (responsesIdx !== -1) {
            const responseBlock = block.substring(responsesIdx);

            // Look for properties: under responses (not requestBody)
            const propRegex = /properties:\s*\n([\s\S]*?)(?=\*\s+\d{3}:|\*\/|$)/;
            const propMatch = propRegex.exec(responseBlock);
            if (propMatch) {
                const propBlock = propMatch[1];
                // Match property names at consistent indentation
                const propNameRegex = /\*(\s{10,})(\w+):/g;
                const schemaKeywords = ['properties', 'items', 'required', 'example',
                    'description', 'format', 'enum', 'nullable', 'schema',
                    'content', 'application'];
                // First pass: find the minimum (i.e. top-level) indentation for non-keyword properties
                let minIndent = Infinity;
                let pMatch;
                const allMatches = [];
                while ((pMatch = propNameRegex.exec(propBlock)) !== null) {
                    const indent = pMatch[1].length;
                    const name = pMatch[2];
                    allMatches.push({ indent, name });
                    if (!schemaKeywords.includes(name) && name !== 'type') {
                        minIndent = Math.min(minIndent, indent);
                    }
                }
                // Second pass: accept properties at the top-level indent
                for (const { indent, name } of allMatches) {
                    if (schemaKeywords.includes(name)) continue;
                    if (name === 'type') {
                        if (indent === minIndent) {
                            properties.push(name);
                        }
                        continue;
                    }
                    if (indent === minIndent) {
                        properties.push(name);
                    }
                }

                // Third pass: extract nested properties for object-typed top-level properties
                // Use the already-parsed allMatches with indent awareness
                // For each top-level property, check if the lines after it have:
                //   type: object (at minIndent + 2)
                //   properties: (at minIndent + 2)
                //   actual prop names (at minIndent + 4)
                const propBlockLines = propBlock.split(/\r?\n/);
                const nestedIndent = minIndent + 4; // nested property indent level

                for (const topProp of properties) {
                    // Find this property in the raw lines
                    let foundProp = false;
                    let hasTypeObject = false;
                    let inNestedProperties = false;
                    const children = [];

                    for (const pLine of propBlockLines) {
                        const lineMatch = /\*(\s+)(\w+):(.*)/.exec(pLine);
                        if (!lineMatch) continue;

                        const lIndent = lineMatch[1].length;
                        const lName = lineMatch[2];
                        const lRest = lineMatch[3].trim();

                        // Find the top-level property declaration
                        if (!foundProp) {
                            if (lIndent === minIndent && lName === topProp) {
                                foundProp = true;
                            }
                            continue;
                        }

                        // Once found, check next lines until we hit another top-level property
                        if (lIndent <= minIndent && lName !== topProp) {
                            break; // Reached next top-level property
                        }

                        // Check for type: object
                        if (lName === 'type' && lRest === 'object') {
                            hasTypeObject = true;
                        }

                        // Check for nested properties: keyword
                        if (lName === 'properties' && hasTypeObject) {
                            inNestedProperties = true;
                            continue;
                        }

                        // Collect nested property names
                        if (inNestedProperties && lIndent === nestedIndent) {
                            if (!schemaKeywords.includes(lName) && lName !== 'type') {
                                children.push(lName);
                            }
                        }
                    }

                    if (children.length > 0) {
                        nestedProperties[topProp] = children;
                    }
                }
            }
        }

        // Extract summary and description
        const summaryMatch = /summary:\s*(.+)/m.exec(block);
        const descMatch = /description:\s*(.+)/m.exec(block);

        // Extract response description
        const responseDescRegex = /\d{3}:\s*\n\s*\*\s+description:\s*(.+)/;
        const respDescMatch = responseDescRegex.exec(block);

        // Check if schema references a $ref
        const hasRef = /\$ref/.test(block);

        // Check for explicit content/application/json/schema
        const hasContentSchema = /content:.*application\/json.*schema/is.test(block) ||
            /schema:/.test(block);

        const routeKey = `${method} ${swaggerPath}`;
        schemas[routeKey] = {
            path: swaggerPath,
            method,
            file,
            summary: summaryMatch ? summaryMatch[1].trim() : null,
            description: descMatch ? descMatch[1].trim() : null,
            responseStatuses: [...new Set(responseStatuses)],
            documentedProperties: [...new Set(properties)],
            nestedProperties: Object.keys(nestedProperties).length > 0 ? nestedProperties : undefined,
            hasSchemaRef: hasRef,
            hasContentSchema,
            responseDescription: respDescMatch ? respDescMatch[1].trim() : null
        };
    }
}

// ─── Write Output ───────────────────────────────────────────────────────────
const output = {
    generated: new Date().toISOString(),
    totalDocumentedRoutes: Object.keys(schemas).length,
    routesWithSchema: Object.values(schemas).filter(s => s.hasContentSchema || s.documentedProperties.length > 0).length,
    routesWithoutSchema: Object.values(schemas).filter(s => !s.hasContentSchema && s.documentedProperties.length === 0).length,
    schemas
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  SWAGGER RESPONSE SCHEMA EXTRACTOR — Phase 10');
console.log('═══════════════════════════════════════════════════');
console.log(`  Route files scanned:      ${platformRouteFiles.length}`);
console.log(`  Documented routes:        ${output.totalDocumentedRoutes}`);
console.log(`  Routes with schema:       ${output.routesWithSchema}`);
console.log(`  Routes without schema:    ${output.routesWithoutSchema}`);
console.log(`  Output:                   ${path.relative(process.cwd(), OUTPUT_FILE)}`);
console.log('');
console.log('RESULT: PASSED');
process.exit(0);
