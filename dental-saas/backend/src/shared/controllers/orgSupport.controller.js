/**
 * orgSupport.controller.js
 * Organization-side support ticket operations.
 * 
 * Extracted from platform/support/controllers/support.controller.js
 * to maintain cross-plane isolation. Organization routes import THIS
 * controller instead of reaching into the platform plane.
 * 
 * Uses shared models only (Ticket).
 */
const Ticket = require("../models/Ticket").default;
const { authorize } = require("../../utils/authorize");

/**
 * calculateSlaDeadline — Pure SLA utility (no platform dependency)
 */
function calculateSlaDeadline(priority) {
    const hours = { "CRITICAL": 4, "HIGH": 12, "MEDIUM": 24, "LOW": 48 }[priority] || 24;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * createTicket (Org Side)
 */
exports.createTicket = async (req, res) => {
    try {
        authorize(req, "support.create");
        const { category, priority, subject, description, linkedInvoiceId, refundAmountRequestedMinor } = req.body;
        const { organizationId, userId } = req.context;

        const ticket = await Ticket.create({
            organizationId,
            createdBy: userId,
            category,
            priority,
            subject,
            description,
            linkedInvoiceId,
            financialImpactMinor: category === "billing" ? refundAmountRequestedMinor : 0,
            slaDeadline: calculateSlaDeadline(priority)
        });

        res.status(201).json(ticket);
    } catch (err) {
        res.status(500).json({ message: "Failed to create ticket", error: err.message });
    }
};

/**
 * getOrgTickets (Org Side)
 */
exports.getOrgTickets = async (req, res) => {
    try {
        authorize(req, "support.read");
        const tickets = await Ticket.find({ organizationId: req.context.organizationId }).sort({ createdAt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch tickets", error: err.message });
    }
};

/**
 * addMessage (Org Side)
 */
exports.addMessage = async (req, res) => {
    try {
        authorize(req, "support.create");
        const { id } = req.params;
        const { message } = req.body;
        const actorType = req.user.type === "platform" ? "platform_user" : "tenant_user";

        const ticket = await Ticket.findById(id);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });

        ticket.conversationThread.push({
            actorId: req.context.userId,
            actorType,
            message
        });

        await ticket.save();

        res.json(ticket);
    } catch (err) {
        res.status(500).json({ message: "Failed to add message", error: err.message });
    }
};
