const mongoose = require("mongoose");

// ─── Sub-Schemas ─────────────────────────────────────────────────────────────
// Typed sub-schemas replace Schema.Types.Mixed for validation and query safety.
// Binary files are NEVER stored here — only URL references to uploads.

// ─── Shared File Metadata Fields ─────────────────────────────────────────────
// Reusable field definitions spread into any schema that stores file references.
// All fields have defaults → backward-compatible with existing documents.
const fileMetaFields = {
    sizeBytes:       { type: Number, default: 0, min: 0 },
    mimeType:        { type: String, default: null },
    originalName:    { type: String, default: null },
    storageProvider: {
        type: String,
        enum: ["local", "s3", "gcs", "r2"],
        default: "local"
    },
    // storageKey: provider-side object key (e.g. "org/<orgId>/orthodontics/photos/<caseId>/<rsId>/<file>")
    // Required for delete to locate the blob; hidden from DTO layer.
    storageKey:      { type: String, default: null },
    // fingerprint: sha256(originalname + size + mimetype). Per-file dedup key
    // for bulk upload; controller rejects re-upload of a file already in the pool.
    fingerprint:     { type: String, default: null, index: true },
    // Uploader observability — cross-reference with request logs by traceId.
    uploadedBy:      { type: String, default: null },
    uploadTraceId:   { type: String, default: null },
};

const cephAnalysisSchema = new mongoose.Schema({
    SNA:    { type: Number },
    SNB:    { type: Number },
    ANB:    { type: Number },
    MMP:    { type: Number },
    U1_PP:  { type: Number },
    L1_MP:  { type: Number },
    CVM:    { type: String },
}, { _id: false });

const interpretationSchema = new mongoose.Schema({
    skeletal: { type: String },
    vertical: { type: String },
    dental:   { type: String },
}, { _id: false });

const photoRecordSchema = new mongoose.Schema({
    id:   { type: String, required: true },
    type: { type: String, enum: ["ceph", "intraoral", "extraoral", "panoramic", "occlusal", "xray"], default: "intraoral" },
    url:  { type: String, default: null },
    label:       { type: String },
    aspectRatio: { type: String },
    orientation: { type: String, enum: ["portrait", "landscape"], default: "portrait" },
    flipH:       { type: Boolean, default: false },
    flipV:       { type: Boolean, default: false },
    crop:        { type: mongoose.Schema.Types.Mixed, default: null },
    analysis:    { type: mongoose.Schema.Types.Mixed, default: {} },
    // Pool fields: when a photo lives in imagePool, assignedView is null.
    // When assigned to a canvas slot, assignedView = slot id (e.g. "front-rest").
    assignedView: { type: String, default: null },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
    // Soft delete for pool photos; excluded from list/assign queries.
    deletedAt:   { type: Date, default: null },
    ...fileMetaFields,
}, { _id: false });

const stlRecordSchema = new mongoose.Schema({
    id:        { type: String, required: true },
    name:      { type: String },
    url:       { type: String },
    archType:  { type: String, enum: ["upper", "lower", "both", "unknown"], default: "unknown" },
    processed: { type: Boolean, default: false },
    analysis:  { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    ...fileMetaFields,
}, { _id: false });

const recordSetSchema = new mongoose.Schema({
    id:             { type: String, required: true },
    name:           { type: String, default: "Record Set" },
    type:           { type: String, enum: ["PRE", "MID", "POST", "CUSTOM"], default: "CUSTOM" },
    date:           { type: String },
    chiefComplaint: { type: String, default: "" },
    audioUrl:       { type: String, default: null },
    photos:         { type: [photoRecordSchema], default: [] },
    records:        { type: [photoRecordSchema], default: [] },
    stlFiles:       { type: [stlRecordSchema], default: [] },
    // imagePool: bulk-uploaded photos awaiting assignment to a slot in records[].
    // Isolation is per-recordSet: a pool photo can ONLY be assigned to a slot
    // inside the same recordSet that owns it. Enforced by controller query shape.
    imagePool:      { type: [photoRecordSchema], default: [] },
    problemList:    { type: mongoose.Schema.Types.Mixed, default: null },
    treatmentPlan:  { type: mongoose.Schema.Types.Mixed, default: null },
    version:        { type: Number, default: 1 },
    createdAt:      { type: Date, default: Date.now },
}, { _id: false });

const problemSchema = new mongoose.Schema({
    id:       { type: String, required: true },
    category: { type: String, enum: ["skeletal", "dental", "soft-tissue", "functional", "esthetic"], default: "dental" },
    title:    { type: String, required: true },
    severity: { type: String, enum: ["mild", "moderate", "severe"], default: "moderate" },
    source:   { type: String, enum: ["auto", "manual", "algorithm"], default: "manual" },
    linkedData: { type: [String], default: [] },
}, { _id: false });

const goalSchema = new mongoose.Schema({
    id:          { type: String, required: true },
    description: { type: String, required: true },
    category:    { type: String, enum: ["skeletal", "dental", "soft-tissue", "functional", "esthetic"], default: "dental" },
    priority:    { type: String, enum: ["high", "medium", "low"], default: "medium" },
    linkedProblem: { type: String, default: "" },
    source:      { type: String, enum: ["auto", "manual"], default: "manual" },
}, { _id: false });

const treatmentOptionSchema = new mongoose.Schema({
    id:          { type: String, required: true },
    title:       { type: String, required: true },
    description: { type: String, default: "" },
    approach:    { type: String, enum: ["conservative", "moderate", "aggressive", "surgical", "custom"], default: "moderate" },
    pros:        { type: [String], default: [] },
    cons:        { type: [String], default: [] },
    estimatedDuration: { type: String },
    complexity:  { type: String, enum: ["low", "medium", "high"], default: "medium" },
    isRecommended: { type: Boolean, default: false },
    extraction:    { type: Boolean, default: false },
    anchorage:     { type: String },
    appliances:    { type: [String], default: [] },
    notes:         { type: String },
}, { _id: false });

const finalPlanSchema = new mongoose.Schema({
    type:         { type: String },
    prescription: { type: String },
    bracketSystem: { type: String },
    slotSize:      { type: String },
    anchorage:     { type: String },
    mechanics:     { type: [String], default: [] },
    typeOfAppliance: {
        maxilla:  { type: String },
        mandible: { type: String },
    },
    retention: {
        maxilla:  { type: String },
        mandible: { type: String },
    },
    notes: { type: String },
}, { _id: false });

// ─── Main Schema ─────────────────────────────────────────────────────────────

const orthodonticCaseSchema = new mongoose.Schema(
    {
        organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
        patientId:      { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },

        // ── Ownership & Sharing (Phase 14 — Access Control V2) ──────────────
        // ownerId: the clinician who created this case. ALWAYS set on creation.
        // sharedWith[]: additional clinicians who can edit (multi-doctor collab).
        // RULE: Ownership is checked BEFORE any engine mutation (bonding/TAD/sequence).
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,  // backward-compat: existing cases get null until backfill
        },
        sharedWith: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],

        treatmentCaseId: { type: mongoose.Schema.Types.ObjectId, ref: "TreatmentCase" },
        caseType: {
            type: String,
            enum: ["comprehensive", "limited", "interceptive", "surgical", "aligner", "retention"],
            default: "comprehensive"
        },
        status: {
            type: String,
            enum: ["draft", "diagnosis", "treatment_planning", "active", "completed", "cancelled"],
            default: "draft"
        },
        malocclusionClass: {
            type: String,
            enum: ["CLASS_I", "CLASS_II_DIV_1", "CLASS_II_DIV_2", "CLASS_III"],
            default: "CLASS_I"
        },
        extractionPlan: { type: String },
        estimatedDurationMonths: { type: Number },
        retentionPlanned: { type: String },
        scanFilePath: { type: String, default: null },
        lastToothAnalysis: {
            analysedAt:   { type: Date },
            teethStatus:  { type: Map, of: String },
            missingFdi:   [{ type: Number }],
            measurements: { type: Object },
        },
        workflowData: {
            recordSets:       { type: [recordSetSchema], default: [] },
            problemList:      { type: [problemSchema], default: [] },
            treatmentGoals:   { type: [goalSchema], default: [] },
            treatmentOptions: { type: [treatmentOptionSchema], default: [] },
            selectedOptionId: { type: String, default: null },
            finalPlan:        { type: finalPlanSchema, default: null },
            currentStep:      { type: Number, default: 0, min: 0, max: 5 },
            lastSavedAt:      { type: Date, default: null },
            lastSavedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
        },
        workflowVersion: { type: Number, default: 0 },
        currentSnapshotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WorkflowSnapshot",
            default: null,
        },
        latestVersion: { type: Number, default: 0 },

        // ── Atomic Visit Sequencing (Phase 3.1 — Concurrency Safety) ──────────
        // visitCounter is incremented via $inc in a single atomic DB operation.
        // NEVER derive visitNumber from count() — not safe under concurrency.
        // Incremented by orthodonticCase.repository.incrementVisitCounter().
        visitCounter: { type: Number, default: 0, min: 0 },

        // ── Phase System (Phase 3 — Clinical Case Engine) ─────────────────
        // phases[]: ordered list of CasePhase ObjectIds for this case.
        // Populated by phase.service.createDefaultPhases() on case creation.
        // Backward-compatible: defaults to [] for existing cases.
        phases: {
            type:    [mongoose.Schema.Types.ObjectId],
            ref:     "CasePhase",
            default: [],
        },

        // activePhaseId: the currently active CasePhase.
        // Updated by phase.service.advancePhase().
        activePhaseId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "CasePhase",
            default: null,
        },

        // ── Phase 3.X: Pretreatment Snapshot Flag ─────────────────────────
        // Denormalized boolean — true once the first pretreatment snapshot is saved.
        // Set atomically by orthodonticCase.repository.setHasPretreatmentSnapshot().
        // Avoids per-request COUNT queries when checking case readiness.
        hasPretreatmentSnapshot: {
            type:    Boolean,
            default: false,
        },

        // ── Diagnostic Snapshot Flag ────────────────────────────────────────
        // Denormalized boolean — true once the singleton diagnostic snapshot is saved.
        // Set atomically by orthodonticCase.repository.setHasDiagnosticSnapshot().
        // ENFORCEMENT: Only ONE diagnostic snapshot is allowed per case (singleton).
        // UI: "Start Diagnosis" → creates; "View Diagnosis" → reads.
        // Treatment lock: case cannot proceed to treatment until this is true.
        hasDiagnosticSnapshot: {
            type:    Boolean,
            default: false,
        },

        // ── Soft Delete (Phase 14 — Safe Case Removal) ─────────────────────
        // Soft delete prevents data corruption while allowing recovery.
        // Deleted cases are filtered from all queries via isDeleted: { $ne: true }
        isDeleted: {
            type:    Boolean,
            default: false,
            index:   true,
        },
        deletedAt: {
            type:    Date,
            default: null,
        },
        deletedBy: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "User",
            default: null,
        },
    },
    { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Compound index covers the three core query patterns:
//   1. findAllForOrg({ organizationId })              → list all for org
//   2. findAllForOrg({ organizationId, patientId })   → list by patient
//   3. findActiveByPatient({ organizationId, patientId, status: $in }) → active check
// Replaces the two separate single-field indexes (less efficient for compound queries).
orthodonticCaseSchema.index({ organizationId: 1, patientId: 1, status: 1 });
orthodonticCaseSchema.index(
    { treatmentCaseId: 1 },
    { unique: true, partialFilterExpression: { treatmentCaseId: { $type: "objectId" } } }
);
// Active phase lookup
orthodonticCaseSchema.index(
    { activePhaseId: 1 },
    { partialFilterExpression: { activePhaseId: { $type: "objectId" } } }
);
// Soft delete filter (compound with organizationId for efficient queries)
orthodonticCaseSchema.index(
    { organizationId: 1, isDeleted: 1 }
);

// ── Situation Room dashboard index coverage ────────────────────────────────
// Supports:
//   - Doctor workload aggregation: group by ownerId filtered by status
//   - PBAC scoping: $or: [{ ownerId }, { sharedWith }] on every dashboard query
//   - Stage distribution group by status
orthodonticCaseSchema.index({ organizationId: 1, ownerId: 1, status: 1 });
// Supports sharedWith leg of the PBAC $or (multikey on array)
orthodonticCaseSchema.index({ organizationId: 1, sharedWith: 1 });
// Supports overdue scan: status='active' sorted by updatedAt ascending
orthodonticCaseSchema.index({ organizationId: 1, status: 1, updatedAt: 1 });

// ── Invariant: ONE active case per patient per org (Phase 5.1 hardening) ────
// Replaces the BullMQ-backed serialization that previously prevented duplicate
// case creation. Now enforced at the DB level via a partial unique index.
// Partial filter matches findActiveByPatient()'s definition of "active":
//   status ∈ [draft, diagnosis, treatment_planning, active]
// Completed / cancelled cases are EXCLUDED from the uniqueness constraint, so
// a patient can start a new treatment cycle after a case closes.
// Concurrent case.service.findOrCreateOrthoCase() calls that both race past the
// findActiveByPatient() check will now surface as E11000 duplicate key errors,
// which the service catches and resolves by returning the winner.
orthodonticCaseSchema.index(
    { organizationId: 1, patientId: 1 },
    {
        unique: true,
        name: "uniq_active_case_per_patient_per_org",
        partialFilterExpression: {
            status: { $in: ["draft", "diagnosis", "treatment_planning", "active"] },
        },
    }
);

const modelName = "OrthodonticCase";

module.exports = {
    modelName,
    schema: orthodonticCaseSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, orthodonticCaseSchema),
};
