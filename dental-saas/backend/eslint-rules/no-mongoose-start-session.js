/**
 * no-mongoose-start-session.js — ESLint Rule
 *
 * RULE 8 — Write Contract Enforcement System
 *
 * ENFORCEMENT: mongoose.startSession() MUST NOT be used in org-plane code.
 * ALL org-plane session creation MUST use req.dbConnection.startSession()
 * to ensure per-org database isolation.
 *
 * mongoose.startSession() creates a session on the DEFAULT mongoose connection,
 * which is the PLATFORM database (saasdental). Using it in org-plane code
 * would silently route all writes to the platform DB — catastrophic data loss.
 *
 * EXEMPTIONS (files where mongoose.startSession() IS correct):
 *   - Platform-plane billing services (they operate on the platform DB)
 *   - Cron jobs operating cross-org (e.g., contractRenewal, dunning)
 *   - Guardian/startup scripts
 *   - Jobs (src/jobs/*)
 *   - Services that operate exclusively on platform collections
 *
 * Pattern blocked in ORG MODULES:
 *   mongoose.startSession()             ❌
 *
 * Required pattern in ORG MODULES:
 *   req.dbConnection.startSession()     ✅
 *   conn.startSession()                 ✅  (where conn = req.dbConnection)
 *
 * This rule ONLY applies to files in:
 *   src/modules/**
 *   src/organization/**
 *   (not src/platform, src/services, src/jobs)
 */

"use strict";

/** Files/directories where mongoose.startSession() is PERMITTED */
function isExemptFile(filename) {
    // Normalize path separators
    const f = filename.replace(/\\/g, "/");
    return (
        f.includes("/platform/") ||
        f.includes("/services/") ||     // top-level services (cron, renewal)
        f.includes("/jobs/") ||
        f.includes("/guardian/") ||
        f.includes("/infrastructure/") ||
        f.includes("/core/idempotency") ||
        f.includes("contractRenewal") ||
        f.includes("dunningProcessor") ||
        f.includes("trialActivation") ||
        f.includes("revenueRecognition")
    );
}

/** Files/directories where mongoose.startSession() is PROHIBITED */
function isEnforcedFile(filename) {
    const f = filename.replace(/\\/g, "/");
    return (
        f.includes("/modules/") ||
        f.includes("/organization/")
    );
}

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Org-plane code must use req.dbConnection.startSession() not mongoose.startSession(). " +
                "Rule 8 of Write Contract Enforcement System v1.0. " +
                "mongoose.startSession() uses the platform DB — causes cross-tenant data corruption.",
            category: "Architecture",
        },
        messages: {
            useReqDbConnection:
                "[WriteContract R8] mongoose.startSession() is forbidden in org-plane code. " +
                "Use req.dbConnection.startSession() for per-org DB session isolation. " +
                "mongoose.startSession() silently routes to the platform DB. " +
                "See write-contract-enforcement.md Rule 8.",
        },
        schema: [],
    },

    create(context) {
        const filename = context.getFilename?.() || context.filename || "";

        // Only enforce in org-plane files, not platform/services
        if (!isEnforcedFile(filename) || isExemptFile(filename)) {
            return {};
        }

        return {
            CallExpression(node) {
                // mongoose.startSession()
                if (
                    node.callee.type === "MemberExpression" &&
                    node.callee.object.type === "Identifier" &&
                    node.callee.object.name === "mongoose" &&
                    node.callee.property.type === "Identifier" &&
                    node.callee.property.name === "startSession"
                ) {
                    context.report({
                        node,
                        messageId: "useReqDbConnection",
                    });
                }
            },
        };
    },
};
