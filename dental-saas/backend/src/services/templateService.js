/**
 * templateService.js
 * Platform Service — Email Template Resolution
 * v1.0
 *
 * Implements the DB-first, filesystem-fallback template lookup chain:
 *
 *   1. DB template (EmailTemplate, isActive: true, matching name)
 *   2. Filesystem .hbs template in src/email/templates/
 *   3. Error
 *
 * This enables live template editing in the Template Manager UI
 * without breaking existing filesystem-based templates.
 *
 * PLANE: Platform / Shared
 */
"use strict";

const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

// Lazy-load EmailTemplate to avoid circular requires at boot
function _getEmailTemplate() {
    return require("../platform/models/EmailTemplate.model");
}

const TEMPLATE_DIR = path.resolve(__dirname, "../email/templates");

/**
 * getTemplate
 *
 * Returns the resolved template definition: { name, subject, body, source }
 * where source is "db" | "filesystem".
 *
 * @param {string} templateName  — template slug (e.g. "magicLink")
 * @returns {Promise<{ name: string, subject: string, body: string|null, source: string }>}
 */
async function getTemplate(templateName) {
    // ── 1. Try DB ─────────────────────────────────────────────────────────────
    try {
        const EmailTemplate = _getEmailTemplate();
        // @rls-platform-service — global email template management, no org-scoped req
        const dbTemplate = await EmailTemplate.findOne({ name: templateName, isActive: true })
            .sort({ version: -1 })
            .lean();

        if (dbTemplate) {
            logger.debug({ templateName, version: dbTemplate.version }, "[TemplateService] Resolved from DB");
            return {
                name: dbTemplate.name,
                subject: dbTemplate.subject || "",
                body: dbTemplate.body || null,
                source: "db",
                version: dbTemplate.version,
            };
        }
    } catch (dbErr) {
        logger.warn({ templateName, err: dbErr.message }, "[TemplateService] DB lookup failed — falling back to filesystem");
    }

    // ── 2. Try filesystem ─────────────────────────────────────────────────────
    const hbsPath = path.join(TEMPLATE_DIR, `${templateName}.hbs`);
    if (fs.existsSync(hbsPath)) {
        logger.debug({ templateName, path: hbsPath }, "[TemplateService] Resolved from filesystem");
        return {
            name: templateName,
            subject: null, // subject comes from EmailService DEFAULT_SUBJECTS mapping
            body: null, // filesystem templates are rendered by renderTemplate() directly
            source: "filesystem",
            version: 0,
        };
    }

    // ── 3. Not found ──────────────────────────────────────────────────────────
    throw new Error(`[TemplateService] Template "${templateName}" not found in DB or filesystem`);
}

/**
 * listTemplates
 *
 * Returns a list of all available templates (DB active + filesystem-only).
 * Used by the Template Manager UI.
 *
 * @returns {Promise<Array<{ name, subject, source, version, label }>>}
 */
async function listTemplates() {
    const results = {};

    // DB templates
    try {
        const EmailTemplate = _getEmailTemplate();
        // @rls-platform-service — global email template management, no org-scoped req
        const dbTemplates = await EmailTemplate.find({ isActive: true }).sort({ name: 1 }).lean();
        for (const t of dbTemplates) {
            results[t.name] = {
                name: t.name,
                label: t.label || t.name,
                subject: t.subject,
                source: "db",
                version: t.version,
            };
        }
    } catch (dbErr) {
        logger.warn({ err: dbErr.message }, "[TemplateService] DB list failed — showing filesystem only");
    }

    // Filesystem templates (only add if NOT already in DB results)
    try {
        const files = fs.readdirSync(TEMPLATE_DIR).filter(f => f.endsWith(".hbs") && f !== "layout.hbs");
        for (const file of files) {
            const name = path.basename(file, ".hbs");
            if (!results[name]) {
                results[name] = {
                    name,
                    label: name,
                    subject: null,
                    source: "filesystem",
                    version: 0,
                };
            }
        }
    } catch (fsErr) {
        logger.warn({ err: fsErr.message }, "[TemplateService] Filesystem scan failed");
    }

    return Object.values(results).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * upsertTemplate
 *
 * Creates or increments the version of a template in the DB.
 * Deactivates previous active version before inserting new one.
 *
 * @param {{ name, label, channel, subject, body, variables, lastModifiedBy }} templateData
 * @returns {Promise<EmailTemplate>}
 */
async function upsertTemplate(templateData) {
    const EmailTemplate = _getEmailTemplate();
    const { name } = templateData;

    // Deactivate existing active version
    // @rls-platform-service — global email template management, no org-scoped req
    await EmailTemplate.updateMany({ name, isActive: true }, { isActive: false });

    // Determine next version number
    // @rls-platform-service — global email template management, no org-scoped req
    const latest = await EmailTemplate.findOne({ name }).sort({ version: -1 }).lean();
    const nextVersion = (latest?.version ?? 0) + 1;

    const created = await EmailTemplate.create({
        ...templateData,
        version: nextVersion,
        isActive: true,
    });

    logger.info({ name, version: nextVersion }, "[TemplateService] Template upserted");
    return created;
}

module.exports = { getTemplate, listTemplates, upsertTemplate };
