/**
 * no-controller-direct-model.js — ESLint Rule v2.0
 *
 * RULE 1 — Write Contract Enforcement System
 *
 * ENFORCEMENT: Controllers AND route files must NOT call Mongoose write methods directly.
 * ALL DB writes MUST go through the service layer.
 *
 * UPGRADED: Now also catches doc.save() via chained call patterns and
 * explicit instance `.save()` on any variable. Also applies to route files.
 *
 * Catches:
 *   Model.create(...)           ❌
 *   Model.updateOne(...)        ❌
 *   Model.updateMany(...)       ❌
 *   Model.findOneAndUpdate(...) ❌
 *   Model.findOneAndReplace(...) ❌
 *   Model.findOneAndDelete(...) ❌
 *   Model.deleteOne(...)        ❌
 *   Model.deleteMany(...)       ❌
 *   Model.insertMany(...)       ❌
 *   Model.replaceOne(...)       ❌
 *   doc.save(...)               ❌
 *   Model.bulkWrite(...)        ❌
 *   Model.findByIdAndUpdate(...) ❌
 *   Model.findByIdAndDelete(...) ❌
 *
 * Allows:
 *   Model.findOne(...)           ✅ (read-only)
 *   Model.find(...)              ✅ (read-only)
 *   Model.findById(...)          ✅ (read-only)
 *   Model.countDocuments(...)    ✅ (read-only)
 *   Model.exists(...)            ✅ (read-only)
 *   Model.aggregate(...)         ✅ (read-only)
 *   Model.lean(...)              ✅ (read-only)
 */

"use strict";

const FORBIDDEN_WRITE_METHODS = new Set([
    "create",
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findOneAndReplace",
    "findOneAndDelete",
    "findByIdAndUpdate",
    "findByIdAndDelete",
    "findByIdAndRemove",
    "findOneAndRemove",
    "deleteOne",
    "deleteMany",
    "insertMany",
    "replaceOne",
    "bulkWrite",
    "save",
]);

/** Returns true if this file is a controller or route file */
function isEnforcedFile(filename) {
    return (
        filename.includes("controller") ||
        filename.includes("Controller") ||
        filename.includes("/routes/") ||
        filename.includes(".route.js") ||
        filename.includes(".routes.js") ||
        filename.includes("/route.js")
    );
}

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Controllers and routes must not perform direct DB writes — use service layer. " +
                "Rule 1 of Write Contract Enforcement System v1.0.",
            category: "Architecture",
            url: "https://github.com/elkelanyshady1-dev/dental-saas/blob/main/docs/write-contract.md",
        },
        messages: {
            noDirectWrite:
                "[WriteContract R1] Direct DB write '{{method}}()' is forbidden in controllers/routes. " +
                "Use the service layer instead. " +
                "See write-contract-enforcement.md Rule 1.",
        },
        schema: [],
    },

    create(context) {
        const filename = context.getFilename?.() || context.filename || "";

        // Only enforce in controller and route files
        if (!isEnforcedFile(filename)) return {};

        return {
            CallExpression(node) {
                if (
                    node.callee.type === "MemberExpression" &&
                    node.callee.property.type === "Identifier" &&
                    FORBIDDEN_WRITE_METHODS.has(node.callee.property.name)
                ) {
                    context.report({
                        node,
                        messageId: "noDirectWrite",
                        data: { method: node.callee.property.name },
                    });
                }
            },
        };
    },
};
