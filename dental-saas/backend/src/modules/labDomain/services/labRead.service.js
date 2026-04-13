/**
 * labRead.service.js — Lab Domain Read Service (CQRS Read Side)
 *
 * All reads use req.dbConnection (per-org isolation).
 * Dashboard reads from projection. Kanban is a grouped view of lab cases.
 *
 * DTO LAYER: All outputs are shaped through lab.dto.js builders.
 * INVARIANT: No raw model documents are returned to controllers.
 *
 * PLANE: Org only. Per-org DB.
 */

"use strict";

const getModel = require("../../../core/db/getModel");

const LabPartnerDef = require("../models/labPartner.model");
const LabCaseDef    = require("../models/labCase.model");
const LabClaimDef   = require("../models/labClaim.model");
const LabMessageDef = require("../models/labMessage.model");

const {
    buildLabPartnerListDTO,
    buildLabPartnerDetailDTO,
    buildLabCaseListDTO,
    buildLabCaseDetailDTO,
    buildLabClaimListDTO,
    buildLabMessageDTO,
    buildLabDashboardDTO,
} = require("../../../dto/lab.dto");

function _models(req) {
    const conn = req.dbConnection;
    return {
        Partner: getModel(conn, LabPartnerDef),
        Case:    getModel(conn, LabCaseDef),
        Claim:   getModel(conn, LabClaimDef),
        Message: getModel(conn, LabMessageDef),
    };
}

// ── Partners ──────────────────────────────────────────────────────────────────

async function listPartners(req) {
    const { Partner } = _models(req);
    const { specialty, status = "active", search, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status)    filter.status    = status;
    if (specialty) filter.specialties = specialty;
    if (search)    filter.name = { $regex: search, $options: "i" };

    const [rawData, total] = await Promise.all([
        Partner.find(filter).sort({ rating: -1, name: 1 }).skip(skip).limit(Number(limit)).lean(),
        Partner.countDocuments(filter),
    ]);

    return {
        data: rawData.map(buildLabPartnerListDTO),
        pagination: { page: Number(page), limit: Number(limit), total },
    };
}

async function getPartner(req, partnerId) {
    const { Partner } = _models(req);
    const raw = await Partner.findById(partnerId).lean();
    if (!raw) { const e = new Error("Lab partner not found"); e.statusCode = 404; throw e; }
    return buildLabPartnerDetailDTO(raw);
}

// ── Cases ─────────────────────────────────────────────────────────────────────

async function listCases(req) {
    const { Case } = _models(req);
    const { status, labId, search, page = 1, limit = 25 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status) filter.status = status;
    if (labId)  filter.labId  = labId;
    if (search) filter.$or = [
        { caseCode:    { $regex: search, $options: "i" } },
        { patientName: { $regex: search, $options: "i" } },
    ];

    const [rawData, total] = await Promise.all([
        Case.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        Case.countDocuments(filter),
    ]);

    return {
        data: rawData.map(buildLabCaseListDTO),
        pagination: { page: Number(page), limit: Number(limit), total },
    };
}

/** Kanban view — returns all active cases grouped by status column */
async function getCasesKanban(req) {
    const { Case } = _models(req);
    const COLUMNS = ["draft", "sent", "accepted", "in_production", "shipped", "delivered"];

    const rawCases = await Case.find({
        status: { $in: COLUMNS },
    }).sort({ createdAt: -1 }).lean();

    const board = {};
    for (const col of COLUMNS) board[col] = [];
    for (const c of rawCases) board[c.status].push(buildLabCaseListDTO(c));

    return { columns: COLUMNS, board };
}

async function getCase(req, caseId) {
    const { Case } = _models(req);
    const raw = await Case.findById(caseId).lean();
    if (!raw) { const e = new Error("Lab case not found"); e.statusCode = 404; throw e; }
    return buildLabCaseDetailDTO(raw);
}

// ── Priority monitoring — cases nearing deadline ──────────────────────────────

async function getPriorityCases(req) {
    const { Case } = _models(req);
    const cutoff = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // next 5 days

    const rawCases = await Case.find({
        status:          { $in: ["sent", "accepted", "in_production", "shipped"] },
        expectedDelivery: { $lte: cutoff },
    }).sort({ expectedDelivery: 1 }).limit(20).lean();

    return rawCases.map(buildLabCaseListDTO);
}

// ── Claims ────────────────────────────────────────────────────────────────────

async function listClaims(req) {
    const { Claim } = _models(req);
    const { status, labId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (status) filter.status = status;
    if (labId)  filter.labId  = labId;

    const [rawData, total] = await Promise.all([
        Claim.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        Claim.countDocuments(filter),
    ]);

    // Aggregate financials
    const [expenseAgg] = await Claim.aggregate([
        { $match: {} },
        { $group: {
            _id: null,
            totalExpenses:   { $sum: "$cost" },
            pendingPayments: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$cost", 0] } },
            approved:        { $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$cost", 0] } },
        }},
    ]);

    return {
        data: rawData.map(buildLabClaimListDTO),
        pagination: { page: Number(page), limit: Number(limit), total },
        summary: Object.freeze(expenseAgg || { totalExpenses: 0, pendingPayments: 0, approved: 0 }),
    };
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function getMessages(req, caseId) {
    const { Message } = _models(req);
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [rawData, total] = await Promise.all([
        Message.find({ caseId }).sort({ createdAt: 1 }).skip(skip).limit(Number(limit)).lean(),
        Message.countDocuments({ caseId }),
    ]);

    return {
        data: rawData.map(buildLabMessageDTO),
        pagination: { page: Number(page), limit: Number(limit), total },
    };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function getDashboard(req) {
    const { Case, Claim } = _models(req);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeCases, pendingSubmissions, inProduction, monthlyExpenses, activity] = await Promise.all([
        Case.countDocuments({ status: { $ne: "completed" } }),
        Case.countDocuments({ status: "draft" }),
        Case.countDocuments({ status: "in_production" }),
        Claim.aggregate([
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$cost" } } },
        ]),
        Case.find({ status: { $ne: "completed" } })
            .sort({ updatedAt: -1 })
            .limit(10)
            .select("caseCode patientName labName status updatedAt")
            .lean(),
    ]);

    return buildLabDashboardDTO({
        kpis: {
            activeCases,
            pendingSubmissions,
            inProduction,
            monthlyExpenses: monthlyExpenses[0]?.total || 0,
        },
        recentActivity: activity,
    });
}

module.exports = {
    listPartners, getPartner,
    listCases, getCasesKanban, getCase, getPriorityCases,
    listClaims,
    getMessages,
    getDashboard,
};
