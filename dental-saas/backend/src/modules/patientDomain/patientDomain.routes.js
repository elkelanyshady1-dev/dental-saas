const express = require("express");
const router = express.Router();

// Phase 2 Gateway (pilot test — see /internal/patients/v2 below)
const gate = require("@middleware/gateways");

// Middlewares
const patientProtect = require("./access/patientProtect");
const protect = require("@middleware/authMiddleware");
const branchContext = require("@middleware/branchContext.middleware");
const { P } = require("@rbac/orgPermissions");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const policyMiddleware = require("@rbac/policyMiddleware");

// Helper for PBAC prefetch
const PatientDef = require("../../organization/patient/models/patient.model");
const getModel = require("../../core/db/getModel");
function _getSecurePatient(req) {
    return getModel(req.dbConnection, PatientDef);
}
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");
const requireEntitlement = require("@middleware/requireEntitlement");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const limitGuard = require("@middleware/limitGuard");
const { autoAudit } = require("@middleware/auditInterceptor");

// Phase F.6: Rate limiters for public intake endpoints (INV-18)
const { intakeValidateLimiter, intakeSubmitLimiter } = require("@middleware/rateLimiter");

// Specialized Controllers (v1.7.0)
const patientCreateController = require("./core/patient.create.controller");
const patientListController = require("./core/patient.list.controller");
const patientSearchController = require("./core/patient.search.controller");
const patientIntelligenceController = require("./intelligence/patientIntelligence.controller");
const intakeController = require("./intake/intake.controller");

// Legacy/Other Controllers
const patientController = require("./core/patient.controller");
const patientAuthController = require("./access/patientAuth.controller");
const clinicalController = require("./clinical/clinical.controller");
const financialController = require("./financial/financial.controller");
const documentsController = require("./documents/documents.controller");
const bookingController = require("./bookingIntegration/bookingIntegration.controller");
const policyController = require("./policies/policy.controller");

/**
 * 🔓 PUBLIC / ACTIVATION
 */
router.post("/portal/activate", patientAuthController.activate);
router.post("/portal/login", patientAuthController.login);

/**
 * 🔓 PUBLIC — Patient Intake Magic Link (token-based auth)
 * Phase F.6: Rate-limited per INV-18 (Public Token Binding)
 * @swagger
 * /patient/domain/intake/{token}:
 *   get:
 *     summary: Validate intake token and return patient info (public, rate-limited)
 *     tags: [Patient Intake]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Token valid, patient info returned
 *       404:
 *         description: Invalid or expired token
 *       429:
 *         description: Rate limit exceeded
 */
router.get("/intake/:token", intakeValidateLimiter, intakeController.validateToken);

/**
 * @swagger
 * /patient/domain/intake/{token}:
 *   post:
 *     summary: Submit patient intake form (public, one-time use, rate-limited)
 *     tags: [Patient Intake]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address: { type: string }
 *               email: { type: string }
 *               nationality: { type: string }
 *               nationalId: { type: string }
 *               maritalStatus: { type: string }
 *               job: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               insurance: { type: object, properties: { provider: { type: string }, policyNumber: { type: string } } }
 *               emergencyContact: { type: object, properties: { name: { type: string }, phone: { type: string }, relation: { type: string } } }
 *               medicalHistory: { type: object }
 *               allergies: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Intake form submitted successfully
 *       404:
 *         description: Invalid or expired token
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/intake/:token", intakeSubmitLimiter, intakeController.submitIntakeForm);

/**
 * 🔐 PATIENT PORTAL ROUTES (type: "patient")
 */
router.use("/portal", patientProtect);
router.get("/portal/profile", patientController.getProfile);
router.get("/portal/clinical", clinicalController.getRecord);
router.put("/portal/clinical", clinicalController.update);
router.get("/portal/financial/summary", financialController.getSummary);
router.get("/portal/documents/signed-url", documentsController.getSignedUrl);
router.get("/portal/booking/slots", bookingController.getSlots);
router.post("/portal/booking/request", bookingController.submitRequest);
router.get("/portal/config", policyController.getPortalConfig);

/**
 * 🏥 STAFF-SIDE INTERNAL PATIENT WORKFLOW (v1.7.0)
 * Mounted under: /api/v1/patient/domain/internal
 */
router.use("/internal", protect, branchContext, requireEntitlement("patients"), autoAudit("Patient"));

/**
 * @swagger
 * /patient/domain/internal/patients/next-code:
 *   get:
 *     summary: Preview the next auto-generated patient code for a branch
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: branchId
 *         required: true
 *         schema: { type: string }
 *         description: Branch ObjectId to preview next code for
 *     responses:
 *       200:
 *         description: "Next patient code preview (e.g. { nextCode: 'M13', branchInitial: 'M', nextSequence: 13 })"
 */
router.get("/internal/patients/next-code", fieldFilterMiddleware("patient"), patientCreateController.nextCode);

/**
 * @swagger
 * /patient/domain/internal/patients:
 *   post:
 *     summary: Create a new patient (staff-side, v1.7.0 aggregate service)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, country, primaryBranchId, allowedBranchIds]
 *             properties:
 *               name: { type: string, description: "Full name (Arabic or English — auto-detected)" }
 *               phone: { type: string, description: "Phone number in national or E.164 format" }
 *               country: { type: string, description: "ISO 3166-1 alpha-2 code for phone parsing", example: "EG" }
 *               primaryBranchId: { type: string, description: "Branch ObjectId" }
 *               allowedBranchIds: { type: array, items: { type: string }, description: "Branch ObjectIds (must include primaryBranchId)" }
 *               email: { type: string }
 *               gender: { type: string, enum: [male, female] }
 *               dateOfBirth: { type: string, format: date }
 *               address: { type: string }
 *               nationality: { type: string }
 *               nationalId: { type: string }
 *               patientCode: { type: string, description: "Optional override — if provided, must be unique in org" }
 *     responses:
 *       201:
 *         description: Patient created with auto-generated or custom patientCode
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied — only clinic staff
 */
router.post("/internal/patients", limitGuard("maxPatients"), policyMiddleware(P.PATIENTS_CREATE), fieldWriteGuardMiddleware("patient"), patientCreateController.create);

/**
 * @swagger
 * /patient/domain/internal/patients:
 *   get:
 *     summary: List patients with token-based search (staff-side)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name tokens or phone digits
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated patient list
 */
router.get("/internal/patients", fieldFilterMiddleware("patient"), patientListController.list);

// LEGACY/PILOT REMOVED

/**
 * 🏥 SOVEREIGN PATIENT MANAGEMENT (Normalized v1.7.0)
 * Mounted under: /api/v1/patient/domain/
 */
router.use("/", protect, branchContext, requireEntitlement("patients"), autoAudit("Patient"));

/**
 * @swagger
 * /patient/domain:
 *   get:
 *     summary: List patients (legacy endpoint)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [smart, name, recent, lastvisit], default: smart }
 *         description: Sort strategy — smart (priority-based), name (A→Z), recent (newest), lastvisit (recent visits)
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated patient list
 */
router.get("/", fieldFilterMiddleware("patient"), patientController.list);

/**
 * @swagger
 * /patient/domain:
 *   post:
 *     summary: Create patient (legacy endpoint)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *               primaryBranchId: { type: string }
 *               allowedBranchIds: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Patient created
 *       400:
 *         description: Validation error
 */
router.post("/", limitGuard("maxPatients"), policyMiddleware(P.PATIENTS_CREATE), fieldWriteGuardMiddleware("patient"), patientController.create);

/**
 * @swagger
 * /patient/domain/search:
 *   get:
 *     summary: Smart patient search — duplicate prevention and family detection
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: phone
 *         schema: { type: string }
 *         description: Phone number (partial or full — digit match)
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Patient name (token-based fuzzy search)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5 }
 *     responses:
 *       200:
 *         description: Array of possible duplicate patients
 */
router.get("/search", fieldFilterMiddleware("patient"), patientSearchController.search);

/**
 * @swagger
 * /patient/domain/quick:
 *   post:
 *     summary: Quick patient creation (minimal fields, 3-second registration)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phone, primaryBranchId]
 *             properties:
 *               fullName: { type: string }
 *               phone: { type: string }
 *               country: { type: string, default: "EG" }
 *               primaryBranchId: { type: string }
 *               allowedBranchIds: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Patient created with status=incomplete
 */
router.post("/quick", limitGuard("maxPatients"), policyMiddleware(P.PATIENTS_CREATE), fieldWriteGuardMiddleware("patient"), patientSearchController.quickCreate);

/**
 * @swagger
 * /patient/domain/{id}/family:
 *   post:
 *     summary: Link two patients as family members (bidirectional)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [familyMemberId, relationship]
 *             properties:
 *               familyMemberId: { type: string }
 *               relationship: { type: string, enum: [father, mother, child, parent, spouse, sibling, other] }
 *     responses:
 *       200:
 *         description: Family linked successfully
 */
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.post("/:id/family", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), patientSearchController.linkFamily);

/**
 * @swagger
 * /patient/domain/{id}/family:
 *   get:
 *     summary: Get patient family members
 *     tags: [Patients]
 */
router.get("/:id/family", fieldFilterMiddleware("patient"), patientSearchController.getFamilyMembers);

/**
 * @swagger
 * /patient/domain/{id}/family/{memberId}:
 *   delete:
 *     summary: Unlink a family member (bidirectional)
 *     tags: [Patients]
 */
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.delete("/:id/family/:memberId", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), patientSearchController.unlinkFamily);

// ── v6.0 Tag Management ─────────────────────────────────────────────────────
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.post("/:id/tags", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), patientIntelligenceController.addTag);
router.delete("/:id/tags/:tag", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), patientIntelligenceController.removeTag);

// ── v6.0 Intelligence Engine ────────────────────────────────────────────────
router.post("/intelligence/run", requireOrgPermission(P.PATIENTS_UPDATE), policyMiddleware(P.PATIENTS_UPDATE), patientIntelligenceController.runAnalysis);

// ── v6.0 Bulk Actions ───────────────────────────────────────────────────────
router.post("/bulk", requireOrgPermission(P.PATIENTS_UPDATE), policyMiddleware(P.PATIENTS_UPDATE), patientIntelligenceController.bulkAction);

/**
 * @swagger
 * /patient/domain/{id}/intake-link:
 *   post:
 *     summary: Generate a magic intake link for the patient (24h expiry)
 *     tags: [Patient Intake]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Intake link generated with token and URL
 *       404:
 *         description: Patient not found
 */
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.post("/:id/intake-link", policyMiddleware(P.PORTAL_MANAGE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), intakeController.generateIntakeLink);

/**
 * @swagger
 * /patient/domain/{id}:
 *   get:
 *     summary: Get patient profile (aggregate view)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Patient ObjectId
 *     responses:
 *       200:
 *         description: Patient aggregate (core + clinical + financial + governance)
 *       404:
 *         description: Patient not found or access denied
 */
router.get("/:id", fieldFilterMiddleware("patient"), patientController.getProfile);

/**
 * @swagger
 * /patient/domain/{id}:
 *   put:
 *     summary: Update patient profile
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nameArabic: { type: string }
 *               nameEnglish: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               gender: { type: string, enum: [male, female] }
 *               dateOfBirth: { type: string, format: date }
 *               address: { type: string }
 *               insurance: { type: object }
 *               emergencyContact: { type: object }
 *     responses:
 *       200:
 *         description: Patient updated
 *       400:
 *         description: Update error
 */
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.put("/:id", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), fieldWriteGuardMiddleware("patient"), patientController.update);

/**
 * @swagger
 * /patient/domain/{id}:
 *   patch:
 *     summary: Partial update patient profile (inline editing)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: "Any subset of patient fields to update"
 *     responses:
 *       200:
 *         description: Patient updated
 *       400:
 *         description: Update error
 */
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.patch("/:id", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), fieldWriteGuardMiddleware("patient"), patientController.update);

/**
 * @swagger
 * /patient/domain/{id}:
 *   delete:
 *     summary: Soft delete patient (sets isActive=false, invalidates portal access)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: "Deletion reason for audit trail" }
 *               expectedVersion: { type: integer, description: "Optimistic concurrency version" }
 *     responses:
 *       200:
 *         description: Patient deleted successfully
 *       404:
 *         description: Patient not found or access denied
 */
// @rls-route-pbac — Phase F.6: PBAC resolver uses Patient for tenant-isolated policy evaluation
router.delete("/:id", policyMiddleware(P.PATIENTS_DELETE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), patientController.delete);

router.get("/:id/clinical", fieldFilterMiddleware("patient"), clinicalController.getRecord);
router.put("/:id/clinical", policyMiddleware(P.PATIENTS_UPDATE, async (req) => _getSecurePatient(req).findOne({ _id: req.params.id })), fieldWriteGuardMiddleware("patient"), clinicalController.update);
router.put("/policies", policyMiddleware(P.PATIENTS_UPDATE), policyController.update);

// ─── Sovereign Boundary Certification ───────────────────────────────────────
global.__PATIENT_AGGREGATE_ACTIVE__ = true;

module.exports = router;
