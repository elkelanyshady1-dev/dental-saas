/**
 * renderTemplate.js
 * Platform Email — Handlebars Template Rendering Engine
 *
 * Compiles and renders an HTML email from a named Handlebars template.
 * Templates are wrapped in layout.hbs for a consistent shell (header/footer).
 *
 * Features:
 *   - Template caching (prod) / no-cache (dev) via TEMPLATE_CACHE env
 *   - Layout wrapper injection via Handlebars partials
 *   - Built-in helpers: formatDate, formatCurrency, upper, lower, eq
 *   - XSS-safe: only {{{ }}} triple-stache is used for trusted layout body slot
 *   - Throws a structured EmailTemplateError on missing templates or render failures
 *
 * PLANE: Platform / Shared
 */

"use strict";

const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");
const logger = require("../../utils/logger");

// ─── Template cache (keyed by template name) ──────────────────────────────────
const _cache = new Map();
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const CACHE_ENABLED = process.env.NODE_ENV === "production" || process.env.TEMPLATE_CACHE === "true";

// ─── Register Handlebars Helpers ──────────────────────────────────────────────

Handlebars.registerHelper("formatDate", (date, locale = "en-US") => {
    if (!date) return "N/A";
    try {
        return new Date(date).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return String(date);
    }
});

Handlebars.registerHelper("formatCurrency", (amount, currency = "USD") => {
    if (amount == null) return "0.00";
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
    } catch {
        return `${amount} ${currency}`;
    }
});

Handlebars.registerHelper("upper", (str) => (str || "").toString().toUpperCase());
Handlebars.registerHelper("lower", (str) => (str || "").toString().toLowerCase());
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("or", (a, b) => a || b);
Handlebars.registerHelper("ifCond", function (v1, operator, v2, options) {
    switch (operator) {
        case "==": return v1 == v2 ? options.fn(this) : options.inverse(this);   // eslint-disable-line eqeqeq
        case "===": return v1 === v2 ? options.fn(this) : options.inverse(this);
        case ">": return v1 > v2 ? options.fn(this) : options.inverse(this);
        case ">=": return v1 >= v2 ? options.fn(this) : options.inverse(this);
        case "<": return v1 < v2 ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
    }
});

// ─── Layout partial registration ──────────────────────────────────────────────
// Registered once at startup; layout.hbs wraps every email body.
function _registerLayoutPartial() {
    const layoutPath = path.join(TEMPLATES_DIR, "layout.hbs");
    if (!fs.existsSync(layoutPath)) {
        logger.warn({ layoutPath }, "[renderTemplate] layout.hbs not found — skipping layout wrapping");
        return;
    }
    const layoutSource = fs.readFileSync(layoutPath, "utf8");
    Handlebars.registerPartial("layout", layoutSource);
}
_registerLayoutPartial();

// ─── Error class ──────────────────────────────────────────────────────────────
class EmailTemplateError extends Error {
    constructor(message, templateName, cause) {
        super(message);
        this.name = "EmailTemplateError";
        this.templateName = templateName;
        this.cause = cause;
    }
}

// ─── _loadTemplate ────────────────────────────────────────────────────────────
function _loadTemplate(templateName) {
    if (CACHE_ENABLED && _cache.has(templateName)) {
        return _cache.get(templateName);
    }

    const filePath = path.join(TEMPLATES_DIR, `${templateName}.hbs`);

    if (!fs.existsSync(filePath)) {
        throw new EmailTemplateError(
            `Email template "${templateName}" not found at ${filePath}`,
            templateName
        );
    }

    const source = fs.readFileSync(filePath, "utf8");
    const compiled = Handlebars.compile(source, { strict: false });

    if (CACHE_ENABLED) _cache.set(templateName, compiled);
    return compiled;
}

// ─── renderTemplate ───────────────────────────────────────────────────────────
/**
 * Renders a Handlebars email template with the given data context.
 *
 * @param {string} templateName - Template file name without extension (e.g. "magicLink")
 * @param {object} data         - Template variables
 * @returns {string}            - Rendered HTML string
 * @throws {EmailTemplateError} - On missing template or render failure
 */
function renderTemplate(templateName, data = {}) {
    try {
        const compiled = _loadTemplate(templateName);
        const html = compiled({
            ...data,
            year: new Date().getFullYear(),
            platformName: process.env.PLATFORM_NAME || "DentalSaaS"
        });
        return html;
    } catch (err) {
        if (err instanceof EmailTemplateError) throw err;
        throw new EmailTemplateError(
            `Failed to render email template "${templateName}": ${err.message}`,
            templateName,
            err
        );
    }
}

// ─── clearCache (test/hot-reload utility) ─────────────────────────────────────
function clearTemplateCache() {
    _cache.clear();
    logger.info("[renderTemplate] Template cache cleared");
}

module.exports = { renderTemplate, clearTemplateCache, EmailTemplateError };
