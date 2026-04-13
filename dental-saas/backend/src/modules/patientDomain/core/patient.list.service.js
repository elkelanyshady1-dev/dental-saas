/**
 * patient.list.service.js — Intelligent Patient List Service v3.0
 * Phase 3 — Connection-Aware Model Migration
 *
 * Enhancements:
 *   - Command-based search parser (balance>X, insurance:X, tag:X, lastvisit>Xm, phone:X, name:X)
 *   - Priority score sort (today's appts > balance > recent > others)
 *   - Enriched select — returns tags, alerts, lastVisit, assignedDoctorId
 *   - Backward compatible with v1.7.0 freetext search
 *
 * Phase 3 Changes:
 *   - Module-level global model import replaced with per-request getModel()
 *   - secureModel now wraps connection-bound model instead of global model
 *
 * All queries RLS-scoped via secureModel.
 */
"use strict";
const PatientDef = require("../../../organization/patient/models/patient.model");
const getModel = require("../../../core/db/getModel");
const { buildPatientListDTO } = require("../../../dto/patient.dto");

// ── Connection-Bound Helper ────────────────────────────────────────────────
function _getPatient(req) {
    return getModel(req.dbConnection, PatientDef);
}

// ─── Command Search Parser ─────────────────────────────────────────────────

/**
 * Parses a command string into MongoDB query modifiers.
 * Examples:
 *   balance>1000         → { balance: { $gt: 1000 } }   (frontend-enriched, not native)
 *   insurance:mednet     → { "insurance.provider": /mednet/i }
 *   tag:orthodontics     → { tags: "orthodontics" }
 *   lastvisit>6 months   → { lastVisit: { $lt: sixMonthsAgo } }
 *   phone:010            → phoneDigits prefix search
 *   name:ahmed           → nameTokens search
 */
function parseCommandQuery(q) {
    if (!q || !q.trim()) return { modifiers: {}, remainder: "" };

    const modifiers = {};
    let remainder = q.trim();

    // insurance:X
    const insuranceMatch = remainder.match(/\binsurance:(\S+)/i);
    if (insuranceMatch) {
        modifiers["insurance.provider"] = new RegExp(insuranceMatch[1], "i");
        remainder = remainder.replace(insuranceMatch[0], "").trim();
    }

    // tag:X
    const tagMatch = remainder.match(/\btag:(\S+)/i);
    if (tagMatch) {
        modifiers.tags = tagMatch[1].toLowerCase();
        remainder = remainder.replace(tagMatch[0], "").trim();
    }

    // lastvisit>Xm or lastvisit>X months
    const lastVisitMatch = remainder.match(/\blastvisit[>](\d+)/i);
    if (lastVisitMatch) {
        const months = parseInt(lastVisitMatch[1]);
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        modifiers.lastVisit = { $lt: cutoff };
        remainder = remainder.replace(lastVisitMatch[0], "").trim();
    }

    // phone:X (extract, handle in main tokenizer below)
    const phoneMatch = remainder.match(/\bphone:(\S+)/i);
    if (phoneMatch) {
        modifiers._phone = phoneMatch[1].replace(/\D/g, "");
        remainder = remainder.replace(phoneMatch[0], "").trim();
    }

    // name:X (extract remainder to nameTokens)
    const nameMatch = remainder.match(/\bname:(\S+)/i);
    if (nameMatch) {
        modifiers._name = nameMatch[1];
        remainder = remainder.replace(nameMatch[0], "").trim();
    }

    return { modifiers, remainder };
}

// ─── Priority Score Sort ───────────────────────────────────────────────────

/**
 * Compute and sort by inline priority when backend score is not pre-computed.
 * Used as fallback if `priorityScore` field is 0 for all records.
 */
function applyInlineSort(patients, todayStart) {
    return patients.sort((a, b) => {
        // Has appointment today?
        const aToday = a.nextAppointment && new Date(a.nextAppointment) >= todayStart ? 50 : 0;
        const bToday = b.nextAppointment && new Date(b.nextAppointment) >= todayStart ? 50 : 0;
        const aScore = aToday + (a.priorityScore || 0);
        const bScore = bToday + (b.priorityScore || 0);
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

class PatientListService {
    /**
     * List patients with command search, intelligent sorting, and enriched projection.
     *
     * @param {object} params
     * @param {object} params.req          — Express Request (REQUIRED — provides req.dbConnection)
     * @param {object} params.scopedQuery  — Extra query filters (branch etc.)
     * @param {string} params.search       — Optional search term
     * @param {string} params.mode         — List mode: "all" | "today"
     * @param {string} params.sort         — Sort: "smart" | "name" | "recent" | "lastvisit"
     * @param {number} params.page         — Page number (1-based)
     * @param {number} params.limit        — Page size
     */
    async listPatients({
        req,             // ← REQUIRED for per-org DB connection
        scopedQuery,
        search,
        mode = "all",
        sort = "smart",
        page = 1,
        limit = 25,
        careType,        // v32.0: "PRIVATE" | "ACADEMIC" | undefined
    }) {
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
        const skip = (pageNum - 1) * limitNum;

        // FIXED: use req from params — previously used undefined req in outer scope
        if (!req?.dbConnection) throw new Error("ORG_CONNECTION_REQUIRED");
        const Patient = _getPatient(req);

        // 1. Base query — organizationId injected by secureModel via RLS
        // scopedQuery contains branch/visibility filters from buildScopedQuery
        const query = {
            ...scopedQuery,
            isActive: true,
        };
        // Remove organizationId from scopedQuery — secureModel will inject it
        delete query.organizationId;

        // 2. Mode filter
        if (mode === "today") {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            query.createdAt = { $gte: startOfDay };
        }

        // 2.5. careType filter (v32.0)
        if (careType && ["PRIVATE", "ACADEMIC"].includes(careType)) {
            query.careType = careType;
        }

        // 3. Command-based search parse
        const { modifiers, remainder } = parseCommandQuery(search);

        // Apply modifiers directly to query
        if (modifiers["insurance.provider"]) query["insurance.provider"] = modifiers["insurance.provider"];
        if (modifiers.tags) query.tags = modifiers.tags;
        if (modifiers.lastVisit) query.lastVisit = modifiers.lastVisit;

        // 4. Token + phone search from remainder + command phone/name
        const searchTerm = remainder.trim();
        const phoneDigits = modifiers._phone || "";
        const nameTerm = modifiers._name || "";

        if (searchTerm || phoneDigits || nameTerm) {
            const searchConds = [];

            // Name token search
            const nameSource = nameTerm || searchTerm;
            if (nameSource) {
                const tokens = nameSource.toLowerCase().replace(/\s+/g, " ").split(" ").filter(Boolean);
                if (tokens.length > 0) searchConds.push({ nameTokens: { $all: tokens } });
            }

            // Phone digit search
            const phoneSource = phoneDigits || searchTerm.replace(/\D/g, "");
            if (phoneSource.length >= 3) {
                searchConds.push({ phoneDigits: { $regex: `${phoneSource}` } });
            }

            // Patient code search (e.g. M12, N1, PT-2024)
            if (searchTerm && /^[A-Za-z]/i.test(searchTerm)) {
                searchConds.push({ patientCode: { $regex: `^${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: "i" } });
            }

            if (searchConds.length === 1) {
                Object.assign(query, searchConds[0]);
            } else if (searchConds.length > 1) {
                query.$or = searchConds;
            }
        }

        // 5. Sort strategy
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        let sortSpec;
        switch (sort) {
            case "name":
                sortSpec = { nameEnglish: 1 };
                break;
            case "recent":
                sortSpec = { createdAt: -1 };
                break;
            case "lastvisit":
                sortSpec = { lastVisit: -1 };
                break;
            case "smart":
            default:
                // Use stored priorityScore desc, then createdAt desc
                sortSpec = { priorityScore: -1, createdAt: -1 };
        }

        // 6. Enriched projection — includes v6.0 fields
        const SELECT_FIELDS = "_id nameArabic nameEnglish fullNameNormalized phone patientCode phoneDigits " +
            "createdAt primaryBranchId status gender dateOfBirth " +
            "tags alerts lastVisit assignedDoctorId priorityScore " +
            "insurance.provider insurance.policyNumber " +
            "nextAppointment isActive careType"; // careType added v32.0

        const [data, total] = await Promise.all([
            Patient.find(query)
                .sort(sortSpec)
                .skip(skip)
                .limit(limitNum)
                .select(SELECT_FIELDS)
                .lean(),
            Patient.countDocuments(query),
        ]);

        // Inline priority-sort for smart mode if all scores are 0
        const sorted = sort === "smart" ? applyInlineSort(data, todayStart) : data;

        // Phase 9: DTO-driven response — displayName computed by SSOT
        const augmented = sorted.map(buildPatientListDTO);

        return {
            data: augmented,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        };
    }
}

module.exports = new PatientListService();
