/**
 * OpenAPI Response Validator Service — Phase 12
 * 
 * Loads the compiled Swagger/OpenAPI spec, extracts response schemas
 * for /api/platform/* paths, and compiles AJV validators per route+method.
 * 
 * Validators are compiled once at startup and cached in memory.
 * This service does NOT modify any business logic, controllers, or RBAC.
 */

const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const logger = require("@utils/logger");

class OpenApiValidatorService {
    constructor() {
        this._validators = new Map(); // key: "METHOD /path" → compiled AJV validate fn
        this._initialized = false;
        this._schemaCount = 0;
    }

    /**
     * Initialize the validator by loading the OpenAPI spec and compiling schemas.
     * Called once at application startup.
     */
    initialize() {
        if (this._initialized) return;

        try {
            // Load the swagger spec from the config module (already compiled by swagger-jsdoc)
            const swaggerSpec = require("@config/swagger");

            const ajv = new Ajv({
                allErrors: true,
                strict: false,          // OpenAPI schemas have extra keywords AJV doesn't know
                validateFormats: false,  // Don't fail on unknown formats
                coerceTypes: false,      // Don't coerce — validate actual types
            });
            addFormats(ajv);

            const paths = swaggerSpec.paths || {};
            let compiled = 0;

            for (const [pathKey, methods] of Object.entries(paths)) {
                // Only compile platform paths
                if (!pathKey.startsWith("/api/platform")) continue;

                for (const [method, operation] of Object.entries(methods)) {
                    if (!operation.responses) continue;

                    // Find the primary success response (200, 201, etc.)
                    const successStatus = Object.keys(operation.responses)
                        .find(code => code.startsWith("2"));

                    if (!successStatus) continue;

                    const response = operation.responses[successStatus];
                    const schema = response?.content?.["application/json"]?.schema;

                    if (!schema) continue;

                    try {
                        // Resolve $ref if present (inline refs within the same spec)
                        const resolvedSchema = this._resolveRefs(schema, swaggerSpec);

                        // Compile with additionalProperties: true (allow extra keys)
                        // We only validate documented properties exist with correct types
                        const compiledValidator = ajv.compile({
                            ...resolvedSchema,
                            additionalProperties: true, // Don't fail on extra keys
                        });

                        const routeKey = `${method.toUpperCase()} ${pathKey}`;
                        this._validators.set(routeKey, {
                            validate: compiledValidator,
                            summary: operation.summary || "",
                        });
                        compiled++;
                    } catch (compileErr) {
                        logger.warn(`[OpenAPI Validator] Failed to compile schema for ${method.toUpperCase()} ${pathKey}: ${compileErr.message}`);
                    }
                }
            }

            this._schemaCount = compiled;
            this._initialized = true;

            logger.info(`[OpenAPI Validator] Initialized — ${compiled} response schemas compiled`);

        } catch (err) {
            logger.error(`[OpenAPI Validator] Initialization failed: ${err.message}`);
            this._initialized = false;
        }
    }

    /**
     * Resolve $ref pointers inline (single-level only).
     * Handles #/components/schemas/SchemaName references.
     */
    _resolveRefs(schema, spec) {
        if (!schema) return schema;

        if (schema.$ref) {
            const refPath = schema.$ref.replace("#/", "").split("/");
            let resolved = spec;
            for (const segment of refPath) {
                resolved = resolved?.[segment];
            }
            return resolved ? { ...resolved } : schema;
        }

        // Recursively resolve nested $ref in properties
        if (schema.properties) {
            const resolved = { ...schema };
            resolved.properties = {};
            for (const [key, value] of Object.entries(schema.properties)) {
                resolved.properties[key] = this._resolveRefs(value, spec);
            }
            return resolved;
        }

        if (schema.items) {
            return { ...schema, items: this._resolveRefs(schema.items, spec) };
        }

        return schema;
    }

    /**
     * Validate a response body against the compiled schema.
     * 
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} path - The OpenAPI path template (e.g., /api/platform/organizations/{id})
     * @param {*} body - The response body to validate
     * @returns {{ valid: boolean, errors: Array|null, routeKey: string }}
     */
    validate(method, path, body) {
        const routeKey = `${method.toUpperCase()} ${path}`;
        const entry = this._validators.get(routeKey);

        if (!entry) {
            return { valid: true, errors: null, routeKey, skipped: true };
        }

        const valid = entry.validate(body);

        return {
            valid,
            errors: valid ? null : entry.validate.errors,
            routeKey,
            skipped: false,
        };
    }

    /**
     * Convert an Express route path (with :param) to OpenAPI template ({param}).
     * Also handles the reverse for lookup.
     * 
     * @param {string} expressPath - e.g., /api/platform/organizations/:id/users/:userId
     * @returns {string} - e.g., /api/platform/organizations/{id}/users/{userId}
     */
    expressToOpenApiPath(expressPath) {
        return expressPath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
    }

    /**
     * Find the matching OpenAPI path template for a concrete request path.
     * e.g., /api/platform/organizations/abc123 → /api/platform/organizations/{id}
     * 
     * @param {string} method - HTTP method
     * @param {string} concretePath - The actual request URL path
     * @returns {string|null} - The matching OpenAPI template path, or null
     */
    findMatchingRoute(method, concretePath) {
        const upperMethod = method.toUpperCase();

        // First: try exact match
        const exactKey = `${upperMethod} ${concretePath}`;
        if (this._validators.has(exactKey)) return concretePath;

        // Second: match against OpenAPI path templates
        for (const routeKey of this._validators.keys()) {
            const [routeMethod, routePath] = routeKey.split(" ", 2);
            if (routeMethod !== upperMethod) continue;

            // Convert OpenAPI template to regex
            const regexStr = "^" + routePath
                .replace(/\{[a-zA-Z0-9_]+\}/g, "[^/]+")
                .replace(/\//g, "\\/") + "$";

            if (new RegExp(regexStr).test(concretePath)) {
                return routePath;
            }
        }

        return null;
    }

    /** @returns {boolean} */
    get isInitialized() { return this._initialized; }

    /** @returns {number} */
    get schemaCount() { return this._schemaCount; }
}

// Singleton instance
const openApiValidatorService = new OpenApiValidatorService();

module.exports = openApiValidatorService;
