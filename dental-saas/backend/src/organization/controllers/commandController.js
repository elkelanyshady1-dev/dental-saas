/**
 * commandController.js — Global Search / Command Bar
 *
 * PER-ORG MODE: Models resolved via getModel(req.dbConnection, ModelDef).
 * RLS-ENFORCED via secureModel applied to connection-bound models.
 *
 * INVARIANTS:
 * INV-2: organizationId is ALWAYS injected by secureModel
 * INV-DB: All models are bound to req.dbConnection (per-org isolation)
 */
"use strict";

const getModel = require("../../core/db/getModel");
const { resolveDisplayName } = require("../../dto/patient.dto");

// ── Model Definitions (schema + modelName only — NO .default) ──────────────
const PatientDef = require("../patient/models/patient.model");
const AppointmentDef = require("../appointment/models/appointment.model");

/**
 * Global search for command bar and shortcuts
 */
exports.globalSearch = async (req, res) => {
    try {
        const { q } = req.query;
        const branchId = req.activeBranchId;

        if (!q || q.length < 2) {
            return res.json({ patients: [], appointments: [], navigation: [], actions: [] });
        }

        // Resolve models on org connection
        const Patient = getModel(req.dbConnection, PatientDef);
        const Appointment = getModel(req.dbConnection, AppointmentDef);

        const [patients, appointments] = await Promise.all([
            // 1. Search Patients — token-indexed (mirrors patient.list.service.js logic)
            (async () => {
                const safeQ = q.trim();
                const numericPart = safeQ.replace(/\D/g, "");
                const tokens = safeQ.toLowerCase().split(/\s+/).filter(Boolean);

                const searchOr = [];
                if (tokens.length > 0) searchOr.push({ nameTokens: { $all: tokens } });
                if (numericPart.length >= 3) searchOr.push({ phoneDigits: { $regex: `^${numericPart}` } });
                const codeMatch = safeQ.match(/^PT-/i);
                if (codeMatch) searchOr.push({ patientCode: { $regex: `^${safeQ}`, $options: "i" } });

                if (searchOr.length === 0) return [];

                const baseQuery = { isActive: true, $or: searchOr };
                if (branchId) baseQuery.allowedBranchIds = { $in: [branchId] };

                // RLS-enforced: organizationId auto-injected
                const rows = await Patient.find(baseQuery)
                    .limit(5)
                    .select("nameArabic nameEnglish fullNameNormalized patientCode phone");

                // Phase 9.1: Use DTO-layer resolveDisplayName (SSOT)
                return rows.map(p => Object.freeze({
                    _id: p._id,
                    displayName: resolveDisplayName(p),
                    patientCode: p.patientCode,
                    phone: p.phone,
                }));
            })(),

            // 2. Search Appointments (recent / upcoming within org) — RLS-enforced
            Appointment.find(
                {
                    ...(branchId && { branchId }),
                    isActive: true
                }
            )
                .sort({ startTime: -1 })
                .limit(5)
                .populate("patientId", "nameEnglish nameArabic")
        ]);

        // 3. Navigation Suggestions (Static)
        const navigation = [
            { label: "Patients List", path: "/org/patients" },
            { label: "Calendar", path: "/org/calendar" },
            { label: "Analytics", path: "/org/analytics" },
            { label: "Settings", path: "/org/settings" }
        ].filter(item => item.label.toLowerCase().includes(q.toLowerCase())).slice(0, 5);

        // 4. Quick Actions (Static)
        const actions = [
            { label: "Add Patient", action: "add_patient", icon: "plus" },
            { label: "New Appointment", action: "add_appointment", icon: "calendar" },
            { label: "Send SMS", action: "send_sms", icon: "chat" }
        ].filter(item => item.label.toLowerCase().includes(q.toLowerCase())).slice(0, 5);

        res.json({
            patients,
            appointments,
            navigation,
            actions
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
