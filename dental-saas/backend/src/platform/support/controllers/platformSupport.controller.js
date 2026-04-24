const getPlatformModel = require("@core/db/getPlatformModel");
const TicketDef = require("@shared/models/Ticket");
const Ticket = getPlatformModel(TicketDef);
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const refundService = require("../services/platformRefund.service");
const ticketService = require("../services/platformTicket.service");

/**
 * createTicket (Org Side)
 */
exports.createTicket = async (req, res) => {
  try {
    const {
      category,
      priority,
      subject,
      description,
      linkedInvoiceId,
      refundAmountRequestedMinor
    } = req.body;
    const {
      organizationId
    } = req.user;
    const ticket = await Ticket.create({
      organizationId,
      createdBy: req.user.userId,
      category,
      priority,
      subject,
      description,
      linkedInvoiceId,
      financialImpactMinor: category === "billing" ? refundAmountRequestedMinor : 0,
      slaDeadline: ticketService.calculateSlaDeadline(priority)
    });
    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({
      message: "Failed to create ticket",
      error: err.message
    });
  }
};

/**
 * listTickets (Org Side)
 */
exports.getOrgTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      organizationId: req.user.organizationId
    }).sort({
      createdAt: -1
    });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch tickets",
      error: err.message
    });
  }
};

/**
 * listAllTickets (Platform Side)
 */
exports.getPlatformTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find().populate("organizationId", "name").sort({
      createdAt: -1
    });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch tickets",
      error: err.message
    });
  }
};

/**
 * assignTicket (Platform Side)
 */
exports.assignTicket = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      platformUserId
    } = req.body;

    // v11.0 Hardening — Move to service and enforce transition
    const ticket = await Ticket.findById(id);
    if (!ticket) return res.status(404).json({
      message: "Ticket not found"
    });
    ticket.assignedToPlatformUserId = platformUserId;
    await ticket.save();
    await ticketService.transitionStatus(id, "IN_PROGRESS", req.user.userId, "platform_user", {
      assignedTo: platformUserId
    });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({
      message: "Failed to assign ticket",
      error: err.message
    });
  }
};

/**
 * approveRefund (Platform Side)
 */
exports.approveRefund = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const result = await refundService.approveRefund(id, req.user.userId, req.ip);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

/**
 * addMessage
 */
exports.addMessage = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      message
    } = req.body;
    const actorType = req.platformUser ? "platform_user" : "tenant_user";
    const ticket = await Ticket.findById(id);
    if (!ticket) return res.status(404).json({
      message: "Ticket not found"
    });
    ticket.conversationThread.push({
      actorId: req.user.userId,
      actorType,
      message
    });
    await ticket.save();

    // v11.0 Hardening — Automated transition if reply from staff
    if (actorType === "platform_user" && ticket.status === "OPEN") {
      await ticketService.transitionStatus(id, "IN_PROGRESS", req.user.userId, actorType);
    } else if (actorType === "tenant_user" && ticket.status === "AWAITING_REPLY") {
      await ticketService.transitionStatus(id, "IN_PROGRESS", req.user.userId, actorType);
    }
    res.json(ticket);
  } catch (err) {
    res.status(500).json({
      message: "Failed to add message",
      error: err.message
    });
  }
};

/**
 * getForensicContext
 */
exports.getForensicContext = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const context = await ticketService.getForensicContext(id);
    res.json(context);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch forensic context",
      error: err.message
    });
  }
};