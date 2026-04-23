/**
 * platformUserService.js
 * Hardened Service Layer for Sovereign Governance (v11.1)
 */

const mongoose = require("mongoose");
const PlatformUser = require("../platform/models/PlatformUser").default;
const auditService = require("./auditService");

/**
 * Distributed Mutex for Superadmin Mutations
 * Ensures TOCTOU safety across multiple nodes.
 */
const distributedLock = require("../utils/DistributedLock");

async function acquireSuperadminLock() {
    const lockKey = "superadmin_lock";
    const start = Date.now();
    while (true) {
        const token = await distributedLock.acquire(lockKey, 15000);
        if (token) return token;
        if (Date.now() - start > 30000) throw new Error("SUPERADMIN_LOCK_TIMEOUT");
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

async function checkReplicaSet() {
    try {
        // Step 5d: platform sibling — the replica-set check targets the control plane.
        const platformConnection = require("../core/db/platformConnection");
        const client = platformConnection.get().getClient();
        const topology = client.topology?.description;
        return topology?.type.includes('ReplicaSet') || topology?.servers?.size > 1;
    } catch (e) {
        return false;
    }
}

/**
 * runInHardenedTransaction
 * Helper to run a function inside a transaction if supported.
 * Always uses the distributed lock for superadmin mutations.
 */
async function runInHardenedTransaction(fn) {
    const isReplicaSet = await checkReplicaSet();
    const lockToken = await acquireSuperadminLock();

    try {
        if (!isReplicaSet) {
            return await fn(null);
        }

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async (s) => {
                result = await fn(s);
            });
            return result;
        } finally {
            session.endSession();
        }
    } finally {
        await distributedLock.release("superadmin_lock", lockToken);
    }
}

exports.updatePlatformUserRole = async ({ targetId, newRole, actor, req }) => {
    return await runInHardenedTransaction(async (session) => {
        // @rls-platform-service — platform admin user CRUD, no org-scoped req
        const target = await PlatformUser.findById(targetId).session(session);
        if (!target) throw new Error("Target user not found");

        const oldRole = target.role;

        // SAFEGUARD: Prevent removing LAST superadmin
        if (oldRole === "superadmin" && newRole !== "superadmin") {
            // @rls-platform-service — platform admin user CRUD, no org-scoped req
            const superadminCount = await PlatformUser.countDocuments({
                role: "superadmin",
                isActive: true
            }).session(session);
            if (superadminCount <= 1) {
                throw new Error("CANNOT_REMOVE_LAST_SUPERADMIN");
            }
        }

        target.role = newRole;
        target.tokenVersion = (target.tokenVersion || 0) + 1;
        await target.save({ session });

        await auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "PLATFORM_USER_ROLE_OVERRIDE",
            entity: "PlatformUser",
            entityId: target._id,
            success: true,
            details: { oldRole, newRole },
            signatureVersion: 1
        }, session);

        // v22.0 — Invalidate capability cache on role mutation
        const { invalidatePlatformRoleCache } = require("./platformCapabilityResolver");
        invalidatePlatformRoleCache();

        // v22.0 — Structured observability (PART 4)
        console.log(JSON.stringify({
            event: "ROLE_UPDATED",
            role: newRole,
            oldRole,
            targetUserId: String(target._id),
            actorId: String(actor._id),
            timestamp: Date.now()
        }));

        return target;
    });
};

exports.updatePlatformUserStatus = async ({ targetId, isActive, actor, req }) => {
    return await runInHardenedTransaction(async (session) => {
        // @rls-platform-service — platform admin user CRUD, no org-scoped req
        const target = await PlatformUser.findById(targetId).session(session);
        if (!target) throw new Error("Target user not found");

        const isTargetSuperadmin = target.role === "superadmin";

        // Safeguard: Protect last active superadmin from suspension
        if (isTargetSuperadmin && isActive === false) {
            // @rls-platform-service — platform admin user CRUD, no org-scoped req
            const superadminCount = await PlatformUser.countDocuments({
                role: "superadmin",
                isActive: true
            }).session(session);

            if (superadminCount <= 1) {
                throw new Error("CANNOT_REMOVE_LAST_SUPERADMIN");
            }
        }

        target.isActive = isActive;
        if (isActive === false) target.tokenVersion = (target.tokenVersion || 0) + 1;
        await target.save({ session });

        await auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "PLATFORM_USER_STATUS_CHANGE",
            entity: "PlatformUser",
            entityId: target._id,
            success: true,
            details: { isActive },
            signatureVersion: 1
        }, session);

        return target;
    });
};

exports.deletePlatformUser = async ({ targetId, actor, req }) => {
    return await runInHardenedTransaction(async (session) => {
        // @rls-platform-service — platform admin user CRUD, no org-scoped req
        const target = await PlatformUser.findById(targetId).session(session);
        if (!target) throw new Error("Target user not found");

        if (target.role === "superadmin") {
            // @rls-platform-service — platform admin user CRUD, no org-scoped req
            const superadminCount = await PlatformUser.countDocuments({
                role: "superadmin",
                isActive: true
            }).session(session);

            if (superadminCount <= 1) {
                throw new Error("CANNOT_REMOVE_LAST_SUPERADMIN");
            }
        }

        // @rls-platform-service — platform admin user CRUD, no org-scoped req
        await PlatformUser.deleteOne({ _id: targetId }).session(session);

        await auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "PLATFORM_USER_DELETE",
            entity: "PlatformUser",
            entityId: targetId,
            success: true,
            details: { email: target.email, role: target.role },
            signatureVersion: 1
        }, session);

        return true;
    });
};
