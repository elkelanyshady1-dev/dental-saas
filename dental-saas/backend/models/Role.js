const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        permissions: {
            patients: {
                read: Boolean,
                create: Boolean,
                update: Boolean,
                delete: Boolean,
            },
            appointments: {
                read: Boolean,
                create: Boolean,
                update: Boolean,
                delete: Boolean,
            },
            recalls: {
                read: Boolean,
                create: Boolean,
                update: Boolean,
                delete: Boolean,
            },
            families: {
                read: Boolean,
                create: Boolean,
                update: Boolean,
                delete: Boolean,
            },
            accounting: {
                read: Boolean,
                create: Boolean,
                update: Boolean,
                delete: Boolean,
            },
            orthodontics: {
                read: Boolean,
                create: Boolean,
                update: Boolean,
                delete: Boolean,
            },
            calendar: {
                read: Boolean,
                multiBranchView: Boolean,
            },
        },

        isSystemRole: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Role", roleSchema);