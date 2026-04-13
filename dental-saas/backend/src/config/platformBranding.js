/**
 * platformBranding.js
 * Platform Branding Configuration
 *
 * Controls visual identity for system-generated PDFs, emails, and reports.
 * In a future Sprint these values will be overridable via PlatformSettings
 * (stored in MongoDB) — this file provides the static fallback defaults.
 *
 * PLANE: Platform
 */

"use strict";

const path = require("path");

module.exports = {
    /** Display name used in PDF headers and email footers */
    companyName: process.env.PLATFORM_BRAND_NAME || "Dental SaaS",

    /** Short tagline shown in the PDF sub-header */
    tagline: process.env.PLATFORM_BRAND_TAGLINE || "Enterprise Dental Management Platform",

    /** Physical address line shown in invoice headers */
    address: process.env.PLATFORM_BRAND_ADDRESS || "Cairo, Egypt",

    /** Support / billing contact email shown in PDF footers */
    supportEmail: process.env.PLATFORM_SUPPORT_EMAIL || "billing@dentalsaas.com",

    /**
     * Absolute path to a PNG/JPEG logo file.
     * If the file does not exist the PDF generator will fall back to
     * a text-only header — never throws.
     */
    logoPath: process.env.PLATFORM_LOGO_PATH
        || path.resolve(__dirname, "../../assets/logo.png"),

    /**
     * Primary brand colour (hex).
     * Used for header bands, table headers, and total-due line.
     */
    primaryColor: process.env.PLATFORM_BRAND_COLOR || "#1e40af",

    /**
     * Light tint of the brand colour (hex).
     * Used for footer band and alternating row tints.
     */
    primaryColorLight: process.env.PLATFORM_BRAND_COLOR_LIGHT || "#eff6ff",
};
