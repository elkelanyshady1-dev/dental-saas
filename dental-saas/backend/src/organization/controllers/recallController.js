/**
 * recallController.js — Recall Management Controller
 *
 * PER-ORG MODE: Models resolved via getModel(req.dbConnection, ModelDef).
 * RLS-ENFORCED via secureModel applied to connection-bound models.
 *
 * processDueRecalls() uses createSystemContext for automation/cron context.
 *
 * INVARIANTS:
 * INV-2: organizationId is ALWAYS injected by secureModel
 * INV-5: All write operations are org-scoped
 * INV-DB: All models are bound to req.dbConnection (per-org isolation)
 */
"use strict";

const getModel = require("../../core/db/getModel");

// ── Model Definitions (schema + modelName only — NO .default) ──────────────
const RecallDef = require("../models/Recall");

// Valid status transitions
const VALID_TRANSITIONS = {
    pending: ["sent", "booked", "cancelled"],
    sent: ["booked"],
};

// ─── Controllers ──────────────────────────────────────────

// 🟢 CREATE recall
exports.createRecall = async (req, res) => {
    try {
        const branchId = req.activeBranchId;
        const { patientId, dueDate, reason } = req.body;

        if (!patientId || !dueDate) {
            return res.status(400).json({
                message: "patientId and dueDate are required",
            });
        }

        // Resolve model on org connection
        const Recall = getModel(req.dbConnection, RecallDef);

        const recall = await Recall.create({
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

        // Resolve model on org connection
        const Recall = getModel(req.dbConnection, RecallDef);

        // RLS-enforced: organizationId auto-injected, branch scope via RLS
        const query = {};

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
        // Resolve model on org connection
        const Recall = getModel(req.dbConnection, RecallDef);

        const recall = await Recall.findOne(
            { _id: req.params.id }
        )
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

        // Resolve model on org connection
        const Recall = getModel(req.dbConnection, RecallDef);

        const recall = await Recall.findOne(
            { _id: req.params.id }
        );

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
 * @param {mongoose.Connection} dbConnection - The org's DB connection (from dbResolver)
 * @returns {Array} Array of due recall documents
 */
exports.processDueRecalls = async (organizationId, dbConnection) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Resolve model on the provided org connection
    const Recall = getModel(dbConnection, RecallDef);

    const dueRecalls = await Recall.find({
        status: "pending",
        dueDate: { $lte: today },
    })
        .populate("patientId", "name phone email")
        .populate("branchId", "name")
        .sort({ dueDate: 1 });

    return dueRecalls;
};
