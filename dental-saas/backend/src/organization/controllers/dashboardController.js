/**
 * dashboardController.js — Unified Dashboard Controller
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
const { authorize } = require("../../utils/authorize");

// ── Model Definitions (schema + modelName only — NO .default) ──────────────
const AuditLogDef = require("../../shared/models/AuditLog");
const PatientDef = require("../patient/models/patient.model");
const AppointmentDef = require("../appointment/models/appointment.model");
const appointmentProjection = require("../../projections/appointment/appointment.projection");
const patientProjection = require("../../projections/patient/patient.projection");
// Sprint 6: billingInvoice.model removed — shared tombstone re-exports PlatformInvoice
// PlatformInvoice is a PLATFORM model — queries must use platform connection or skip RLS
// For dashboard preview, we query via the org connection if the schema is registered there.

/**
 * Handle unified dashboard actions from shortcuts
 */
exports.handleAction = async (req, res) => {
    try {
        authorize(req, "dashboard.manage");
        const { action, payload } = req.body;
        const branchId = req.context.branchId;
        const organizationId = req.context.organizationId;
        const userId = req.context.userId;

        if (!action) {
            return res.status(400).json({ message: "Action key is required" });
        }

        // 2. RBAC Permission Mapping
        const permissionMap = {
            add_patient: "patients.create",
            add_appointment: "appointments.create",
            add_treatment: "clinical.create",
            add_prescription: "clinical.update",
            send_sms: "patients.read",
            add_task: "calendar.read",
            add_expense: "accounting.create",
            add_income: "accounting.create",
            send_registration_link: "patients.create"
        };

        const requiredPermission = permissionMap[action];
        if (requiredPermission && !req.context.permissions.has(requiredPermission)) {
            return res.status(403).json({
                message: "Access denied. Insufficient permissions for this action.",
                required: requiredPermission
            });
        }

        // 3. Emit Audit Log
        const auditService = require("../../services/auditService");
        await auditService.createAuditRecord({
            organizationId,
            branchId: branchId || req.activeBranchId || req.user.primaryBranchId,
            userId,
            actorId: userId,
            actorType: "tenant_user",
            action: "DASHBOARD_ACTION_EXECUTED",
            entity: "dashboard",
            details: { action, branchId, ...payload },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200,
            success: true
        });

        // 4. Dispatch to logical handlers (Placeholders/Success Response)
        res.json({
            success: true,
            action,
            message: `Action ${action} initiated successfully`,
            data: {
                target: action === "add_patient" ? "/org/patients/new" : null
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Get unified dashboard overview stats and previews
 */
exports.getOverview = async (req, res) => {
    try {
        authorize(req, "dashboard.read");
        const branchId = req.context.branchId;
        const branchQuery = branchId ? { branchId } : {};

        // ── Resolve models on org connection ────────────────────────────────
        const Patient = getModel(req.dbConnection, PatientDef);
        const Appointment = getModel(req.dbConnection, AppointmentDef);

        // Parallel fetching for performance
        const [stats, appointments] = await Promise.all([
            // Stats (Count examples) — RLS-enforced
            (async () => {
                const [patientCount, appointmentCount] = await Promise.all([
                    Patient.countDocuments({}),
                    Appointment.countDocuments(
                        { isActive: true, ...branchQuery }
                    )
                ]);
                return { patientCount, appointmentCount };
            })(),

            // Appointments Preview (Next 5) via Projection
            // req REQUIRED — projection resolves Appointment via req.dbConnection (per-org isolation)
            appointmentProjection.buildCalendarView({
                organizationId: req.organizationId,
                branchId,
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                req,
            }).then(list => list.slice(0, 5)),
        ]);

        res.json({
            stats,
            appointmentsPreview: appointments,
            invoicesPreview: [], // Platform invoices — resolved via platform connection when available
            unreadSummary: {
                notifications: 0
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
