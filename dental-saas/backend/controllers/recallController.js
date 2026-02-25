const Recall = require("../models/Recall");
const Branch = require("../models/Branch");
const buildScopedQuery = require("../utils/buildScopedQuery");

// Valid status transitions
const VALID_TRANSITIONS = {
    pending: ["sent", "booked", "cancelled"],
    sent: ["booked"],
};

// ─── Controllers ──────────────────────────────────────────

// 🟢 CREATE recall
exports.createRecall = async (req, res) => {
    try {
        const { branchId, patientId, dueDate, reason } = req.body;

        if (!branchId || !patientId || !dueDate) {
            return res.status(400).json({
                message: "branchId, patientId, and dueDate are required",
            });
        }

        // Validate branch exists + belongs to org
        const branch = await Branch.findOne({
            _id: branchId,
            organizationId: req.organizationId,
        });

        if (!branch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        // Validate branch access for restricted users
        if (req.allowedBranches) {
            const allowed = req.allowedBranches.some(
                (id) => id.toString() === branchId.toString()
            );
            if (!allowed) {
                return res.status(403).json({ message: "Branch access denied" });
            }
        }

        const recall = await Recall.create({
            organizationId: req.organizationId,
            branchId,
            patientId,
            dueDate,
            reason: reason || "",
        });

        res.status(201).json({
            message: "Recall created",
            recall,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 GET recalls (branch-scoped, with date + status filtering)
exports.getRecalls = async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;
        const query = buildScopedQuery(req);

        if (status) {
            query.status = status;
        }

        if (startDate) {
            query.dueDate = { ...query.dueDate, $gte: new Date(startDate) };
        }
        if (endDate) {
            query.dueDate = { ...query.dueDate, $lte: new Date(endDate) };
        }

        const recalls = await Recall.find(query)
            .populate("patientId", "name phone")
            .populate("branchId", "name")
            .sort({ dueDate: 1 });

        res.json({ recalls });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 GET single recall (scoped)
exports.getRecall = async (req, res) => {
    try {
        const query = buildScopedQuery(req, { _id: req.params.id });
        const recall = await Recall.findOne(query)
            .populate("patientId", "name phone")
            .populate("branchId", "name");

        if (!recall) {
            return res.status(404).json({ message: "Recall not found" });
        }

        res.json({ recall });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 UPDATE recall status (with valid transition enforcement)
exports.updateRecallStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ message: "status is required" });
        }

        const query = buildScopedQuery(req, { _id: req.params.id });
        const recall = await Recall.findOne(query);

        if (!recall) {
            return res.status(404).json({ message: "Recall not found" });
        }

        // Validate transition
        const allowed = VALID_TRANSITIONS[recall.status];

        if (!allowed || !allowed.includes(status)) {
            return res.status(400).json({
                message: `Cannot transition from '${recall.status}' to '${status}'`,
            });
        }

        recall.status = status;
        await recall.save();

        res.json({
            message: "Recall status updated",
            recall,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Automation-Ready ─────────────────────────────────────

/**
 * Find all pending recalls that are due today or earlier.
 * Automation-ready: call from a cron job or scheduled task.
 * Does NOT send notifications — just returns the data.
 *
 * @param {string} organizationId - Organization to process
 * @returns {Array} Array of due recall documents
 */
exports.processDueRecalls = async (organizationId) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const dueRecalls = await Recall.find({
        organizationId,
        status: "pending",
        dueDate: { $lte: today },
    })
        .populate("patientId", "name phone email")
        .populate("branchId", "name")
        .sort({ dueDate: 1 });

    return dueRecalls;
};
