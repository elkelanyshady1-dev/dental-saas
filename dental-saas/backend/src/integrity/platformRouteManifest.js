/**
 * platformRouteManifest.js
 * v19.2 — Required Platform Plane Route Definitions
 *
 * These routes MUST exist at startup. Removing any of them will cause
 * the server to refuse to start (in STRICT mode) or log a critical warning.
 *
 * Add a route here when it becomes load-bearing for frontend governance.
 * Do NOT add every route — only those whose absence would be a security regression.
 */
module.exports = [
    { method: "GET", path: "/capabilities" },
    { method: "GET", path: "/feature-flags" },
    { method: "POST", path: "/audit/frontend-event" },
    { method: "POST", path: "/performance-metric" },
    { method: "GET", path: "/me" },
    { method: "GET", path: "/audit-logs" },
    // v21.0 — Audit Trail Explorer
    { method: "GET", path: "/audit/logs" },
    { method: "GET", path: "/audit/export" },
    { method: "GET", path: "/audit/verify-chain" },
    // v21.0 — Contract Detail (Financial Navigation)
    { method: "GET", path: "/contracts/:id" },
    // v21.0 — Full SaaS Financial Lifecycle
    { method: "POST", path: "/contracts/:id/suspend" },
    { method: "POST", path: "/contracts/:id/void" },
    { method: "POST", path: "/billing/invoices/:invoiceId/pay" },
    { method: "POST", path: "/billing/payments/:paymentId/refund" },
];

