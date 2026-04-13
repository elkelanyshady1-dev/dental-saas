import { platformApiClient } from '../core/api/platformApiClient';

/**
 * PlatformEventLogger (v16.0 Singleton)
 * Enterprise-grade observability dispatcher for the Sovereign Platform Plane.
 */
class PlatformEventLogger {
    constructor() {
        this.clientVersion = "v16.0";
        this.actorContext = null;
    }

    /**
     * Set the current actor context for automatic injection.
     * Called by PlatformShell during initialization.
     */
    init(actor) {
        this.actorContext = {
            id: actor._id || actor.id,
            role: actor.platformRole || actor.role,
            region: actor.regionCode || "GLOBAL"
        };
    }

    /**
     * Logs a platform-level event with automatic context injection.
     * v18.0 Mandatory Audit Envelope: Reject events without capabilityUsed mapping.
     */
    async logPlatformEvent({ action, targetId, metadata = {}, featureKey, capabilityUsed }) {
        if (!this.actorContext) return;

        // Governance Hardening: Require capabilityUsed for privileged actions
        if (!capabilityUsed && action !== 'SYSTEM_INIT') {
            console.warn('[PlatformLogger] Governance Breach: Event rejected due to missing capabilityUsed mapping.');
            return;
        }

        const payload = {
            action,
            targetId,
            capabilityUsed,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                featureKey: featureKey || "SYSTEM",
                clientVersion: this.clientVersion,
                actorId: this.actorContext.id,
                actorRole: this.actorContext.role,
                regionCode: this.actorContext.region
            }
        };

        // Fire and forget — deterministic non-blocking behavior
        // v19.3: Uses generated client → resolves to /api/platform/audit/frontend-event
        platformApiClient.audit.auditFrontendEventCreate(payload).catch(() => { });
    }

    /**
     * Logs a route-level performance metric.
     */
    async logPerformance({ featureKey, loadDuration }) {
        if (!this.actorContext) return;

        const payload = {
            featureKey,
            loadDuration,
            actorId: this.actorContext.id,
            timestamp: new Date().toISOString()
        };

        // v19.3: Uses generated client → resolves to /api/platform/performance-metric
        platformApiClient.audit.performanceMetricCreate(payload).catch(() => { });
    }
}

export const platformLogger = new PlatformEventLogger();
export default platformLogger;
