/**
 * SiteContent.js — Platform Landing Page Content Model
 *
 * PLANE: Platform (global — no organizationId).
 * This model stores the public-facing landing page content (hero, about, SEO).
 * It is NOT org-scoped — there's a single active version across the platform.
 *
 * Moved from organization/models/ to shared/models/ to clarify plane ownership.
 */
const mongoose = require("mongoose");

const siteContentSchema = new mongoose.Schema(
    {
        heroTitle: String,
        heroSubtitle: String,
        aboutTitle: String,
        aboutDescription: String,
        whatsappNumber: String,
        supportEmail: String,
        seoTitle: String,
        seoDescription: String,
        seoKeywords: String,
        isActive: {
            type: Boolean,
            default: true,
        },
        version: {
            type: Number,
            default: 1,
        },
    },
    { timestamps: true }
);

const modelName = "SiteContent";

module.exports = {
    modelName,
    schema: siteContentSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, siteContentSchema),
};
