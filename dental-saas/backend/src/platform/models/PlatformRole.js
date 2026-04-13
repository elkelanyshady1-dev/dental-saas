/**
 * PlatformRole.js
 * Platform Plane — Sovereign Role Model
 *
 * Stores platform-level roles with capability mappings.
 * Capabilities are stored as string keys (not ObjectId refs)
 * for simplicity and alignment with the platform contract.
 *
 * Collection: platformroles (plane-isolated)
 */

const mongoose = require("mongoose");

const PlatformRoleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        capabilities: [
            {
                type: String,
            },
        ],
        plane: {
            type: String,
            default: "platform",
            enum: ["platform"],
        },
    },
    { collection: "platformroles", timestamps: true }
);

const modelName = "PlatformRole";

module.exports = {
    modelName,
    schema: PlatformRoleSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, PlatformRoleSchema),
};
