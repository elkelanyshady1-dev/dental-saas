const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        email: {
            type: String,
            required: true,
        },

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

        // For platform-level users only (superadmin / platform_admin)
        platformRole: {
            type: String,
            enum: ["superadmin", "platform_admin", null],
            default: null,
        },

        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            default: null,
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

        mustChangePassword: {
            type: Boolean,
            default: false,
        },

        // Token for password reset
        passwordResetToken: String,
        passwordResetExpires: Date,
    },
    { timestamps: true }
);

userSchema.index({ organizationId: 1 });
userSchema.index({ organizationId: 1, roleId: 1 });
userSchema.index({ organizationId: 1, email: 1 });
userSchema.index({ name: 1 });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ roleId: 1 });
userSchema.index({ platformRole: 1 });

module.exports = mongoose.model("User", userSchema);