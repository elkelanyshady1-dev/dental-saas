const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        patientCode: {
            type: String,
        },

        firstName: { type: String, required: true, trim: true },
        middleName: { type: String, default: "", trim: true },
        lastName: { type: String, required: true, trim: true },

        fullName: { type: String },

        phone: { type: String, required: true },
        secondaryPhone: String,
        email: String,

        gender: { type: String, enum: ["male", "female"] },
        dateOfBirth: Date,

        address: String,
        nationality: String,
        nationalId: String,
        maritalStatus: String,
        job: String,

        firstVisitBranchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },

        photo: String,

        portalEnabled: {
            type: Boolean,
            default: false,
        },

        portalPassword: String,

        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// ─── Pre-save: build fullName + auto patientCode ──────────
patientSchema.pre("save", async function (next) {
    // Build fullName — strip double spaces, trim, lowercase
    this.fullName = `${this.firstName} ${this.middleName || ""} ${this.lastName}`
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    // Auto-generate patientCode if new
    if (this.isNew && !this.patientCode) {
        const count = await mongoose.model("Patient").countDocuments({
            organizationId: this.organizationId,
        });
        this.patientCode = `P-${String(count + 1).padStart(5, "0")}`;
    }

    next();
});

// ─── Indexes ──────────────────────────────────────────────
patientSchema.index({ organizationId: 1, phone: 1 });
patientSchema.index({ organizationId: 1, fullName: 1 });
patientSchema.index({ organizationId: 1, isActive: 1 });
patientSchema.index({ organizationId: 1, patientCode: 1 }, { unique: true });
patientSchema.index({ organizationId: 1, isActive: 1 }); // Hardening Index

module.exports = mongoose.model("Patient", patientSchema);