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

module.exports = mongoose.model("SiteContent", siteContentSchema);
