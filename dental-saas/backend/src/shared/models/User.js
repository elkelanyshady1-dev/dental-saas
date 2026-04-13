const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        // ── Name fields ──────────────────────────────────────────────────────────
        firstName: { type: String, default: null },
        lastName: { type: String, default: null },
        name: {
            type: String,
            required: true,
        },

        // ── Identity ─────────────────────────────────────────────────────────────
        // email     = orgSlug email for staff (e.g. aya.ahmed@smilecare.clinic)
        //           = real email for org_admin (e.g. dr.ahmed@gmail.com)
        // realEmail = actual personal email. null for system-provisioned staff.
        // isSystemGenerated = true means login email was auto-generated (orgSlug format)
        // username  = the username segment used to build the org email
        email: {
            type: String,
            required: true,
        },
        realEmail: { type: String, default: null },
        isSystemGenerated: { type: Boolean, default: false },
        username: { type: String, default: null },

        password: {
            type: String,
            required: true,
            select: false,
            validate: {
                validator: function (v) {
                    // Ensure the password is a valid bcrypt hash
                    // Format: $2a$, $2b$, or $2y$, followed by 2-digit cost factor and 53-char salt/hash
                    return /^\$2[aby]\$\d{2}\$.{53}$/.test(v);
                },
                message: "Password must be a valid bcrypt hash"
            }
        },

        // For org-level users: references the Role document
        roleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role",
            default: null,
        },

        // Platform-assigned designation (set during provisioning, immutable by org)
        // ORG_ADMIN = platform-designated organization administrator
        // When set, authorityBridge injects ALL org permissions regardless of roleId
        platformDesignation: {
            type: String,
            enum: [null, "ORG_ADMIN"],
            default: null,
            immutable: false, // mutable by platform only — org-level guards prevent org mutation
        },


        // Per-org DB mode: organizationId is kept for reference/audit but NOT required.
        // Database isolation (dental_org_<orgId>) is the tenant boundary.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },

        dataScope: {
            level: {
                type: String,
                enum: ["organization", "branch", "personal"],
                default: "organization",
            },
            branches: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Branch",
                },
            ],
            permissions: {
                canViewFinance: { type: Boolean, default: false },
                canViewInventory: { type: Boolean, default: false },
            },
        },

        // Branch-level access control
        branchAccess: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Branch",
            },
        ],

        // If true → user can access ALL branches in the organization
        hasFullBranchAccess: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },

        tokenVersion: {
            type: Number,
            default: 0,
        },

        // v4.8 — Visibility Overrides
        visibilityOverrides: {
            patients: { type: String, enum: ["ALL", "BRANCH", "OWN"] },
            finance: { type: String, enum: ["ALL", "BRANCH", "OWN"] },
            appointments: { type: String, enum: ["ALL", "BRANCH", "OWN"] },
            inventory: { type: String, enum: ["ALL", "BRANCH"] }
        },

        // Permission to manage overrides
        canManageOverrides: {
            type: Boolean,
            default: false,
        },

        // OAV — Optimistic Aggregate Versioning (v3.2/v4.8)
        version: {
            type: Number,
            default: 1,
        },

        mustChangePassword: {
            type: Boolean,
            default: false,
        },

        // Token for password reset
        passwordResetToken: String,
        passwordResetExpires: Date,

        // v20.2 — Last successful login timestamp
        lastLogin: {
            type: Date,
            default: null,
        },

        // v30.0 — Brute-force protection
        failedLoginAttempts: {
            type: Number,
            default: 0,
        },
        accountLockedUntil: {
            type: Date,
            default: null,
        },

        // v25.0 — Visual identity & contact fields
        profileImage: { type: String, default: null },
        phone: { type: String, default: null },
        whatsapp: { type: String, default: null },
        jobTitle: { type: String, default: null },
        department: { type: String, default: null },
        speciality: { type: String, default: null }, // legacy — kept for backward compat

        // v32.0 — Practitioner flag
        // Set true for ANY user who performs clinical procedures (doctors, admins
        // acting as doctors, orthodontists, etc.).
        // Source of truth for the appointment scheduling practitioner list.
        // RULE: Do NOT filter by role.name — use this flag instead.
        isPractitioner: {
            type: Boolean,
            default: false,
        },

        // v31.0 — Profile completion tracking
        // Org-created staff must complete their profile on first login.
        // Guards on the frontend redirect to /complete-profile until true.
        profile: {
            isComplete: {
                type: Boolean,
                default: false,
            },
            completedAt: {
                type: Date,
                default: null,
            },
            // v32.0 — Clinical specialty (canonical — replaces root `speciality`)
            // Only meaningful when isPractitioner === true.
            // Values: "orthodontist" | "general" | "periodontist" | "endodontist"
            //         | "pediatric" | "surgeon" | "prosthodontist" | "other"
            specialty: {
                type: String,
                default: null,
            },
        },

        // v26.0 — Phone-based OTP verification (geo routing)
        // NOTE: No `default: null` — omission prevents duplicate key errors on sparse unique index.
        // Mongoose will not write the field at all when absent, so sparse index skips the doc.
        phoneNumber: { type: String, trim: true },   // E.164 international format
        phoneVerified: { type: Boolean, default: false },
        phoneVerifiedAt: { type: Date, default: null },

        // v27.0 — Unified Verification Engine: email confirmation
        isEmailVerified: { type: Boolean, default: false },
        emailVerifiedAt: { type: Date, default: null },

        // ── Soft-delete (Phase 1) ─────────────────────────────────────────────
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// ── Virtual: displayName ──────────────────────────────────────────────────────
userSchema.virtual("displayName").get(function () {
    if (this.firstName || this.lastName) {
        return [this.firstName, this.lastName].filter(Boolean).join(" ");
    }
    return this.name;
});

// ── Pre-save: keep `name` in sync ────────────────────────────────────
userSchema.pre("save", async function () {
    if (this.firstName || this.lastName) {
        this.name = [this.firstName, this.lastName].filter(Boolean).join(" ");
    }
});


// Per-org DB: indexes optimized for per-database queries.
// organizationId compound indexes REMOVED — DB isolation handles tenant scoping.
userSchema.index({ name: 1 });
userSchema.index({ email: 1 }, { unique: true });
// phoneNumber: sparse + unique — docs without phoneNumber are excluded from the index.
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ roleId: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ accountLockedUntil: 1 }, { sparse: true });
// v32.0 — Fast practitioner queries (sparse: only indexes isPractitioner: true docs)
userSchema.index({ isPractitioner: 1 }, { sparse: true });


const modelName = "User";

module.exports = {
    modelName,
    schema: userSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, userSchema),
};