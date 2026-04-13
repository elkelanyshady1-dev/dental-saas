/**
 * guardian.metrics.service.js
 * Platform Guardian — Metrics Aggregation Service
 *
 * Queries real Mongoose models to produce a structured health report.
 * Called by guardian.controller.js for both overview and integrity scan endpoints.
 *
 * Output shape:
 * {
 *   summary:  { totalAlerts, critical, warnings },
 *   alerts:   [ { type, severity, organizationId, organizationName, message } ],
 *   runtime:  { activeContracts, overlappingContracts, nullLockedPrice, expiredAutoRenew, orphanDrafts },
 *   system:   { pid, uptimeSeconds, memoryMB, strictMode, collectedAt }
 * }
 *
 * PLANE: Platform — NO org-plane imports.
 */

"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");

// Lazy-import broadcast to avoid circular dependency.
// guardian.socket.js is initialized after this module loads.
const getBroadcast = () => {
    try {
        return require("./guardian.socket").broadcastGuardianUpdate;
    } catch {
        return () => { }; // socket not yet initialized — no-op
    }
};

// ─── In-memory alert hash (change detection) ──────────────────────────────────
// Reset on server restart — intentional. We only detect changes within a session.
let _lastAlertHash = null;

const getOrgContract = () => getPlatformConnection().models["OrgContract"];
const getOrganization = () => getPlatformConnection().models["Organization"];

// ─── Alert Builder ────────────────────────────────────────────────────────────

function buildAlert(type, severity, organizationId, organizationName, message) {
    return { type, severity, organizationId: organizationId?.toString() || null, organizationName, message };
}

// ─── Collectors ───────────────────────────────────────────────────────────────

/**
 * Detect orgs with more than 1 active contract.
 * Requires MongoDB aggregation.
 */
async function detectOverlappingContracts(OrgContract, Organization) {
    const duplicates = await OrgContract.aggregate([
        { $match: { contractStatus: "active" } },
        { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicates.length === 0) return { count: 0, alerts: [] };

    // Fetch org names for alert labels
    const orgIds = duplicates.map(d => d._id);
    const orgs = await Organization.find({ _id: { $in: orgIds } }, { name: 1 }).lean();
    const orgMap = Object.fromEntries(orgs.map(o => [o._id.toString(), o.name]));

    const alerts = duplicates.map(d => buildAlert(
        "MULTIPLE_ACTIVE_CONTRACTS",
        "critical",
        d._id,
        orgMap[d._id.toString()] || "Unknown",
        `Organization has ${d.count} simultaneously active contracts — revenue integrity at risk`
    ));

    return { count: duplicates.length, alerts };
}

/**
 * Detect active contracts with null or negative lockedPrice.
 */
async function detectNullLockedPrice(OrgContract, Organization) {
    const corrupt = await OrgContract.find(
        {
            contractStatus: "active",
            $or: [
                { lockedPrice: null },
                { lockedPrice: { $lt: 0 } },
                { lockedPrice: { $exists: false } }
            ]
        },
        { organizationId: 1, lockedPrice: 1 }
    ).lean();

    if (corrupt.length === 0) return { count: 0, alerts: [] };

    const orgIds = [...new Set(corrupt.map(c => c.organizationId?.toString()).filter(Boolean))];
    const orgs = await Organization.find({ _id: { $in: orgIds } }, { name: 1 }).lean();
    const orgMap = Object.fromEntries(orgs.map(o => [o._id.toString(), o.name]));

    const alerts = corrupt.map(c => buildAlert(
        "NULL_LOCKED_PRICE",
        "critical",
        c.organizationId,
        orgMap[c.organizationId?.toString()] || "Unknown",
        `Active contract has null/negative lockedPrice — revenue not being captured`
    ));

    return { count: corrupt.length, alerts };
}

/**
 * detectExpiredAutoRenew
 * Detect active contracts where autoRenew=true AND effectiveTo is > 3 days past.
 * These missed the renewal cron.
 */
async function detectExpiredAutoRenew(OrgContract, Organization) {
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const stuck = await OrgContract.find(
        {
            contractStatus: "active",
            autoRenew: true,
            effectiveTo: { $lt: staleThreshold }
        },
        { organizationId: 1, effectiveTo: 1 }
    ).lean();

    if (stuck.length === 0) return { count: 0, alerts: [] };

    const orgIds = [...new Set(stuck.map(c => c.organizationId?.toString()).filter(Boolean))];
    const orgs = await Organization.find({ _id: { $in: orgIds } }, { name: 1 }).lean();
    const orgMap = Object.fromEntries(orgs.map(o => [o._id.toString(), o.name]));

    const alerts = stuck.map(c => buildAlert(
        "EXPIRED_AUTO_RENEW_STUCK",
        "warning",
        c.organizationId,
        orgMap[c.organizationId?.toString()] || "Unknown",
        `Contract expired on ${c.effectiveTo?.toISOString().slice(0, 10)} but autoRenew=true — renewal cron may be stalled`
    ));

    return { count: stuck.length, alerts };
}

/**
 * detectStuckExpiredContracts
 * Detect the STUCK_EXPIRED_CONTRACTS invariant violation:
 * contracts where autoRenew=false AND effectiveTo < 3 days ago AND status is still "active".
 * These should have been expired by the contractExpiryScheduler.
 */
async function detectStuckExpiredContracts(OrgContract, Organization) {
    const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const stuck = await OrgContract.find(
        {
            contractStatus: "active",
            autoRenew: false,
            effectiveTo: { $lt: staleThreshold },
        },
        { organizationId: 1, effectiveTo: 1 }
    ).lean();

    if (stuck.length === 0) return { count: 0, alerts: [] };

    const orgIds = [...new Set(stuck.map(c => c.organizationId?.toString()).filter(Boolean))];
    const orgs = await Organization.find({ _id: { $in: orgIds } }, { name: 1 }).lean();
    const orgMap = Object.fromEntries(orgs.map(o => [o._id.toString(), o.name]));

    const alerts = stuck.map(c => buildAlert(
        "STUCK_EXPIRED_CONTRACTS",
        "critical",
        c.organizationId,
        orgMap[c.organizationId?.toString()] || "Unknown",
        `Contract expired on ${c.effectiveTo?.toISOString().slice(0, 10)} — autoRenew=false but still "active" (invariant violation — cron self-healing in progress)`
    ));

    return { count: stuck.length, alerts };
}

/**
 * Detect draft contracts older than 24 hours that were never activated.
 */
async function detectOrphanDrafts(OrgContract, Organization) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orphans = await OrgContract.find(
        { contractStatus: "draft", createdAt: { $lt: cutoff } },
        { organizationId: 1, createdAt: 1 }
    ).lean();

    if (orphans.length === 0) return { count: 0, alerts: [] };

    const orgIds = [...new Set(orphans.map(c => c.organizationId?.toString()).filter(Boolean))];
    const orgs = await Organization.find({ _id: { $in: orgIds } }, { name: 1 }).lean();
    const orgMap = Object.fromEntries(orgs.map(o => [o._id.toString(), o.name]));

    const alerts = orphans.map(c => buildAlert(
        "ORPHAN_DRAFT_CONTRACT",
        "warning",
        c.organizationId,
        orgMap[c.organizationId?.toString()] || "Unknown",
        `Draft contract created on ${c.createdAt?.toISOString().slice(0, 10)} was never activated`
    ));

    return { count: orphans.length, alerts };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * collectGuardianMetrics
 *
 * Aggregates all platform guardian metrics into a single structured report.
 * @returns {Promise<object>}
 */
async function collectGuardianMetrics() {
    const OrgContract = getOrgContract();
    const Organization = getOrganization();

    if (!OrgContract || !Organization) {
        return {
            summary: { totalAlerts: 0, critical: 0, warnings: 0 },
            alerts: [],
            runtime: { activeContracts: 0, overlappingContracts: 0, nullLockedPrice: 0, expiredAutoRenew: 0, orphanDrafts: 0, error: "Models not loaded" },
            system: {
                pid: process.pid,
                uptimeSeconds: Math.round(process.uptime()),
                memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                strictMode: process.env.PLATFORM_GUARDIAN_MODE === "strict",
                collectedAt: new Date().toISOString()
            }
        };
    }

    // Active contract count
    const activeContracts = await OrgContract.countDocuments({ contractStatus: "active" });

    // Run all checks in parallel for performance
    const [overlapping, nullPrice, expiredAutoRenew, stuckExpired, orphanDrafts] = await Promise.all([
        detectOverlappingContracts(OrgContract, Organization),
        detectNullLockedPrice(OrgContract, Organization),
        detectExpiredAutoRenew(OrgContract, Organization),
        detectStuckExpiredContracts(OrgContract, Organization),
        detectOrphanDrafts(OrgContract, Organization)
    ]);

    // Collect all alerts
    const allAlerts = [
        ...overlapping.alerts,
        ...nullPrice.alerts,
        ...expiredAutoRenew.alerts,
        ...stuckExpired.alerts,
        ...orphanDrafts.alerts
    ];

    const critical = allAlerts.filter(a => a.severity === "critical").length;
    const warnings = allAlerts.filter(a => a.severity === "warning").length;

    return {
        summary: {
            totalAlerts: allAlerts.length,
            critical,
            warnings
        },
        alerts: allAlerts,
        runtime: {
            activeContracts,
            overlappingContracts: overlapping.count,
            nullLockedPrice: nullPrice.count,
            expiredAutoRenew: expiredAutoRenew.count,
            stuckExpiredContracts: stuckExpired.count,   // ← STUCK_EXPIRED_CONTRACTS
            orphanDrafts: orphanDrafts.count
        },
        system: {
            pid: process.pid,
            uptimeSeconds: Math.round(process.uptime()),
            memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            strictMode: process.env.PLATFORM_GUARDIAN_MODE === "strict",
            collectedAt: new Date().toISOString()
        }
    };

    // ── Alert Change Detection — broadcast if alerts changed ────────────────────
    const alertHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(metrics.alerts))
        .digest("hex");

    metrics.alertHash = alertHash;  // expose to controller for audit log storage

    if (alertHash !== _lastAlertHash) {
        _lastAlertHash = alertHash;
        const broadcast = getBroadcast();
        broadcast({
            type: "ALERT_UPDATE",
            summary: metrics.summary,
            changedAt: metrics.system.collectedAt
        });
    }

    return metrics;
}

module.exports = { collectGuardianMetrics };
