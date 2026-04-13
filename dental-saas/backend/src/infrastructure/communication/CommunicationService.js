const { addCommunicationJob } = require("../../infrastructure/queues/communication.queue");
const logger = require("../../utils/logger");
const { assertCommunicationQuota } = require("../../core/subscription/communicationQuota.service");

/**
 * Enterprise Communication Engine (v1.4.1)
 * Refactored for asynchronous processing via Redis Queue.
 * Offloads provider latency to background workers.
 */
class CommunicationService {
    /**
     * Queue SMS notification
     */
    async sendSMS({ organizationId, to, templateKey, variables }) {
        try {
            await assertCommunicationQuota(organizationId, "smsUsed");
            await addCommunicationJob("sms", {
                organizationId,
                to,
                templateKey,
                variables
            });
            return { queued: true };
        } catch (error) {
            logger.error({ error, organizationId, to }, "Failed to queue SMS: " + error.message);
            throw error;
        }
    }

    /**
     * Queue Email notification
     */
    async sendEmail({ organizationId, to, subject, html, templateKey, variables }) {
        try {
            await assertCommunicationQuota(organizationId, "emailUsed");
            await addCommunicationJob("email", {
                organizationId,
                to,
                subject,
                html,
                templateKey,
                variables
            });
            return { queued: true };
        } catch (error) {
            logger.error({ error, organizationId, to }, "Failed to queue Email: " + error.message);
            throw error;
        }
    }

    /**
     * Queue WhatsApp notification
     */
    async sendWhatsApp({ organizationId, to, templateKey, variables }) {
        try {
            await assertCommunicationQuota(organizationId, "whatsappUsed");
            await addCommunicationJob("whatsapp", {
                organizationId,
                to,
                templateKey,
                variables
            });
            return { queued: true };
        } catch (error) {
            logger.error({ error, organizationId, to }, "Failed to queue WhatsApp: " + error.message);
            throw error;
        }
    }
}

module.exports = new CommunicationService();
