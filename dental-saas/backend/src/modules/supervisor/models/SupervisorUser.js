/**
 * SupervisorUser.js — Supervisor Identity Model
 *
 * Separate identity from org User model.
 * Supervisors authenticate via email/password with supervisor-specific JWT.
 *
 * PLANE: Supervisor only.
 * SENTINEL: Fully isolated — no organizationId, no org Role reference.
 */

"use strict";

const mongoose = require("mongoose");

const supervisorUserSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            // unique index declared via schema.index({ email: 1 }, { unique: true }) below
            lowercase: true,
            trim: true,
            maxlength: 200,
        },
        password: {
            type: String,
            required: true,
            select: false,  // Never returned in queries by default
            validate: {
                validator: function (v) {
                    return /^\$2[aby]\$\d{2}\$.{53}$/.test(v);
                },
                message: "Password must be a valid bcrypt hash",
            },
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        title: {
            type: String,
            trim: true,
            maxlength: 100,
            default: null, // e.g., "Professor", "Associate Professor"
        },
        institution: {
            type: String,
            trim: true,
            maxlength: 200,
            default: null,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        lastLoginAt: {
            type: Date,
            default: null,
        },

        // Brute-force protection
        failedLoginAttempts: {
            type: Number,
            default: 0,
        },
        accountLockedUntil: {
            type: Date,
            default: null,
        },

        // Token version — increment to invalidate all active tokens
        tokenVersion: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: "supervisorUsers",
    }
);

// ─── Indexes ────────────────────────────────────────────────────────────────
supervisorUserSchema.index({ email: 1 }, { unique: true });
supervisorUserSchema.index({ isActive: 1 });
supervisorUserSchema.index({ accountLockedUntil: 1 }, { sparse: true });

const modelName = "SupervisorUser";

module.exports = {
    modelName,
    schema: supervisorUserSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, supervisorUserSchema),
};
