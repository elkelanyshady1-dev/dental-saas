/**
 * CommunicationService — org-plane tenant notification facade
 * v2.0 — routes through communication.dispatcher (Phase 6 cleanup)
 *
 * v1.4.1 used a BullMQ `communication.queue` which was removed when Redis
 * was eradicated. This class keeps its same public API (sendSMS / sendEmail /
 * sendWhatsApp) + quota enforcement so org-plane callers (booking,
 * patient-auth, etc.) don't need to rewire; the underlying delivery
 * now flows through `communication.dispatcher`.
 *
 * Distinction from `services/communicationService.js` (lowercase):
 *   - THIS (Big-C): org-plane API. Takes {organizationId, to, ...}, applies
 *     per-org quota via assertCommunicationQuota, then dispatches.
 *   - services/communicationService (little-c): platform-internal routing
 *     facade. Takes {channel, type, payload} with no quota / no org scope.
 *     Used for magic-link / OTP / password-reset etc.
 *
 * Future consolidation is possible — both end at dispatch() — but they
 * serve different planes today, so they remain distinct.
 */

"use strict";

const { dispatch } = require("./communication.dispatcher");
const logger = require("../../utils/logger");
const { assertCommunicationQuota } = require("../../core/subscription/communicationQuota.service");

// Fallback dispatcher `type` for callers that pass subject/html directly
// instead of a templateKey. Async handlers render these payloads as-is
// (no template lookup). The DIRECT_* convention makes the code path
// visible in logs so "why was this not templated?" is searchable.
const DIRECT_TYPES = {
    sms: "DIRECT_SMS",
    email: "DIRECT_EMAIL",
    whatsapp: "DIRECT_WHATSAPP",
};

class CommunicationService {
    async sendSMS({ organizationId, to, templateKey, variables }) {
        return this._dispatch("sms", "smsUsed", {
            organizationId,
            to,
            templateKey,
            variables,
        });
    }

    async sendEmail({ organizationId, to, subject, html, templateKey, variables }) {
        return this._dispatch("email", "emailUsed", {
            organizationId,
            to,
            subject,
            html,
            templateKey,
            variables,
        });
    }

    async sendWhatsApp({ organizationId, to, templateKey, variables }) {
        return this._dispatch("whatsapp", "whatsappUsed", {
            organizationId,
            to,
            templateKey,
            variables,
        });
    }

    /**
     * Shared dispatch path for all channels.
     *
     * Quota → dispatch. Quota runs first so a quota-exceeded tenant
     * never generates work for the dispatcher/async handler. The quota
     * throw propagates to the caller (existing v1.4.1 contract).
     */
    async _dispatch(channel, quotaKey, payload) {
        try {
            await assertCommunicationQuota(payload.organizationId, quotaKey);

            const type = payload.templateKey || DIRECT_TYPES[channel];
            const result = await dispatch({ channel, type, payload });
            return { dispatched: true, mode: result?.mode || "unknown" };
        } catch (error) {
            logger.error(
                { error: error.message, organizationId: payload.organizationId, to: payload.to, channel },
                `Failed to dispatch ${channel}: ${error.message}`
            );
            throw error;
        }
    }
}

module.exports = new CommunicationService();
