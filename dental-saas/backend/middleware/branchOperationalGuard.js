/**
 * branchOperationalGuard
 *
 * Blocks destructive writes when a branch is in Archive Mode (isActive: false).
 * Exception: PATCH that ONLY changes isActive is allowed — this is the reactivation path.
 *
 * Usage: apply after middleware that populates req.branch.
 * On platform routes (no req.branch), this guard is applied inline in the controller.
 */

const WRITE_METHODS = ["POST", "PATCH", "PUT", "DELETE"];

module.exports = function branchOperationalGuard(req, res, next) {
    if (!req.branch) return next(); // not a branch-scoped route — pass through

    const isWrite = WRITE_METHODS.includes(req.method);
    if (!req.branch.isActive && isWrite) {
        // Allow reactivation: PATCH where isActive is the ONLY field being changed
        const keys = Object.keys(req.body || {});
        const isReactivation = req.method === "PATCH" && keys.length === 1 && keys[0] === "isActive";

        if (!isReactivation) {
            return res.status(403).json({
                message: "Branch is inactive. Write operations are disabled.",
            });
        }
    }

    next();
};
