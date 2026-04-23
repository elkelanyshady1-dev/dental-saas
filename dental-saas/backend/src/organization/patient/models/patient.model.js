const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
    {
        // organizationId removed (Step 5c Commit 2 of 3-Layer refactor):
        // per-org DB IS the tenant boundary — the field was redundant.

        // v1.7.0 Multi-Branch Association
        primaryBranchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        allowedBranchIds: {
            type: [mongoose.Schema.Types.ObjectId],
            ref: "Branch",
            required: true,
            validate: {
                validator: function (v) {
                    return Array.isArray(v) && v.length > 0;
                },
                message: "allowedBranchIds must contain at least one branch ID (usually the primary branch).",
            },
        },

        patientCode: {
            type: String,
            required: true,
        },

        nameArabic: {
            type: String,
            trim: true,
        },
        nameEnglish: {
            type: String,
            trim: true,
        },

        // Internal projection for v1.7 search engine
        fullNameNormalized: {
            type: String,
            trim: true,
        },
        nameTokens: {
            type: [String],
            default: [],
        },

        phone: {
            type: String,
            trim: true,
        },
        phoneRaw: {
            type: String,
            required: true,
            trim: true,
        },
        phoneE164: {
            type: String,
            required: true,
        },
        phoneDigits: {
            type: String,
            required: true,
        },
        secondaryPhone: String,
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },

        gender: { type: String, enum: ["male", "female"] },
        dateOfBirth: Date,

        address: String,
        nationality: String,
        nationalId: String,
        maritalStatus: String,
        job: String,

        photo: String,
        insurance: {
            provider: String,
            policyNumber: String,
            expiryDate: Date,
        },
        emergencyContact: {
            name: String,
            phone: String,
            relation: String,
        },

        isActive: {
            type: Boolean,
            default: true
        },
        deletedAt: {
            type: Date,
            default: null,
        },

        // v5.0 Quick-create status ("complete" | "incomplete")
        status: {
            type: String,
            enum: ["complete", "incomplete"],
            default: "complete",
        },

        // v5.0 Family Linking
        familyMembers: [{
            patientId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Patient",
                required: true,
            },
            relationship: {
                type: String,
                enum: ["father", "mother", "child", "parent", "spouse", "sibling", "other"],
                required: true,
            },
            linkedAt: {
                type: Date,
                default: Date.now,
            },
        }],

        // v4.2 Personal visibility scoping
        visibleToDoctors: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }],

        // v6.0 Tag System
        tags: {
            type: [String],
            default: [],
            index: true,
        },

        // v6.0 Patient Intelligence Alerts
        alerts: [{
            type: {
                type: String,
                enum: ["inactive", "balance_due", "missed_appointment", "recall_due", "orthodontic_review", "incomplete_profile"],
                required: true,
            },
            message: { type: String, required: true },
            severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
            generatedAt: { type: Date, default: Date.now },
        }],

        // v6.0 Visit Tracking (populated by appointment events)
        lastVisit: { type: Date, default: null },

        // v6.0 Doctor Assignment
        assignedDoctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // v6.0 Intelligent Priority Score (recalculated daily by intelligence job)
        priorityScore: {
            type: Number,
            default: 0,
        },

        version: {
            type: Number,
            default: 0
        },

        // ─── Academic vs Private Patient Classification (v32.0) ──────────────────
        // careType MUST match the clinicType of patient.primaryBranchId.
        // PRIVATE → billable patient in a standard private clinic
        // ACADEMIC → university/training case — billing is HARD BLOCKED
        // Enforcement: patientCreate.service + appointmentDomain + billingDomain
        careType: {
            type: String,
            enum: ["PRIVATE", "ACADEMIC"],
            default: "PRIVATE",
            index: true,
        },
    },
    { timestamps: true }
);

// ─── Name Normalisation Helpers ───────────────────────────
function normalizeName(name) {
    return name ? name.toLowerCase().trim().replace(/\s+/g, " ") : "";
}

function tokenizeName(name) {
    const norm = normalizeName(name);
    return norm ? norm.split(" ").filter(Boolean) : [];
}

// ─── Pre-save Logic ───────────────────────────────────────
patientSchema.pre("save", async function () {
    // 1. Sync fullNameNormalized and nameTokens
    if (this.isModified("nameArabic") || this.isModified("nameEnglish") || this.isNew) {
        const combined = `${this.nameArabic || ""} ${this.nameEnglish || ""}`;
        this.fullNameNormalized = normalizeName(combined);
        this.nameTokens = tokenizeName(combined);
    }

    // 2. Validate branch association (v1.7.0 Rule 3)
    // primaryBranchId must be in allowedBranchIds
    if (this.primaryBranchId && !this.allowedBranchIds.some(id => id.toString() === this.primaryBranchId.toString())) {
        this.allowedBranchIds.push(this.primaryBranchId);
    }
});

// ─── Indexes ──────────────────────────────────────────────
// Multi-tenant uniqueness invariant
patientSchema.index({ patientCode: 1 }, { unique: true });

// Enterprise multi-tenant list sorting
patientSchema.index({ createdAt: -1 });

// Token-based search indexing
patientSchema.index({ nameTokens: 1 });

// v1.7.0 Phone-based search index
patientSchema.index({ phoneDigits: 1 });

// v1.7.0 Branch-aware visibility index
patientSchema.index({ allowedBranchIds: 1, createdAt: -1 });

// v1.7.0 Analytics primary branch index
patientSchema.index({ primaryBranchId: 1 });

// v4.5 Ownership composite index
patientSchema.index({ visibleToDoctors: 1 });

// v5.0 Full-text search on normalized name
patientSchema.index({ fullNameNormalized: "text" });

// Standardized single-field indexes
patientSchema.index({ isActive: 1 });

// v6.0 Intelligence Engine Indexes
patientSchema.index({ tags: 1 });
patientSchema.index({ lastVisit: 1 });
patientSchema.index({ priorityScore: -1 });
patientSchema.index({ assignedDoctorId: 1 });
patientSchema.index({ "alerts.type": 1 });

const modelName = "Patient";

module.exports = {
    modelName,
    schema: patientSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, patientSchema),
};
