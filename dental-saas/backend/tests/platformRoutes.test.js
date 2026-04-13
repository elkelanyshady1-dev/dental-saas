/**
 * platformRoutes.test.js
 * v19.2 — CI Route Registration Enforcement
 *
 * Fails the build if any load-bearing platform route is removed or renamed.
 * Run with: npm test (or jest directly)
 */

const request = require("supertest");

// Load app lazily to avoid full DB connection in CI
// The route check only requires the router layer, not a live connection.
let app;

beforeAll(() => {
    // Suppress boot logs in test output
    jest.spyOn(console, "log").mockImplementation(() => { });
    jest.spyOn(console, "error").mockImplementation(() => { });
    app = require("../../app");
});

afterAll(() => {
    jest.restoreAllMocks();
});

/**
 * Walk the Express router stack and flatten all routes on the app.
 * Handles nested routers (e.g., mounted at /api/platform).
 */
function flattenRoutes(stack, prefix = "") {
    const routes = [];
    if (!stack) return routes;

    stack.forEach((layer) => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods);
            methods.forEach((method) => {
                routes.push({ method, path: `${prefix}${layer.route.path}` });
            });
        } else if (layer.name === "router" && layer.handle?.stack) {
            const nestedPrefix = layer.regexp?.source
                ? prefix + (layer.regexp.source.match(/\^\\\/([^\\]+)/) || [, ""])[1].replace(/\\\//g, "/")
                : prefix;
            routes.push(...flattenRoutes(layer.handle.stack, nestedPrefix));
        }
    });

    return routes;
}

describe("Platform Route Contract (v19.2)", () => {
    const REQUIRED_ROUTES = [
        { method: "get", path: "capabilities" },
        { method: "get", path: "feature-flags" },
        { method: "post", path: "audit/frontend-event" },
        { method: "post", path: "performance-metric" },
        { method: "get", path: "me" },
        { method: "get", path: "audit-logs" },
    ];

    it("has all required platform governance routes registered", () => {
        const allRoutes = flattenRoutes(app._router?.stack || []);
        const routeStrings = allRoutes.map(r => `${r.method}:${r.path}`);

        REQUIRED_ROUTES.forEach(({ method, path }) => {
            // Match any route that ends with the required path segment
            const matched = routeStrings.some(
                r => r === `${method}:${path}` ||
                    r.includes(`${method}:`) && r.endsWith(`/${path}`)
            );
            expect(matched).toBe(true);
        });
    });

    it("generates a deterministic route checksum", () => {
        const { generateRouteChecksum } = require("../../src/integrity/routeChecksum");
        const sampleRoutes = [
            { method: "GET", path: "/capabilities" },
            { method: "GET", path: "/feature-flags" },
        ];

        const checksum1 = generateRouteChecksum(sampleRoutes);
        // Order independence: reversed order should produce the same checksum
        const checksum2 = generateRouteChecksum([...sampleRoutes].reverse());

        expect(checksum1).toBe(checksum2);
        expect(checksum1).toHaveLength(64); // SHA-256 hex = 64 chars
    });
});
