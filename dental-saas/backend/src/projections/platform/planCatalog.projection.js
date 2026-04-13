/**
 * Plan Catalog Projection
 * v2.0 — Migrated from Plan model → PlanTemplate + PlanVersion
 *
 * MIGRATION NOTE:
 *   Previously queried the legacy Plan collection directly.
 *   Now queries PlanTemplate (catalog) and enriches with the active PlanVersion
 *   per template for pricing data.
 *
 * PLANE: Platform
 */

"use strict";

const PlanTemplate = require("../../platform/billing/models/PlanTemplate.model").default;
const PlanVersion = require("../../platform/billing/models/PlanVersion.model").default;
const Money = require("../../utils/money");

/**
 * buildPlanCatalog
 * Returns a list of all published templates with regional pricing from
 * their active PlanVersion, excluding internal/secrets.
 *
 * @returns {Promise<Array>} List of Plan DTOs
 */
async function buildPlanCatalog() {
    const templates = await PlanTemplate.find({ status: "published" }).lean();

    if (templates.length === 0) return [];

    // Batch-load active versions for all templates in one query
    const templateIds = templates.map(t => t._id);
    const activeVersions = await PlanVersion.find({
        templateId: { $in: templateIds },
        status: "active"
    }).lean();

    // Build lookup map: templateId → activeVersion
    const versionMap = Object.fromEntries(
        activeVersions.map(v => [v.templateId.toString(), v])
    );

    return templates.map(template => {
        const version = versionMap[template._id.toString()];

        return {
            id: template._id,
            name: template.name,
            code: template.code,
            description: template.description,
            limits: version?.limits || template.limits,
            modules: version?.modules || template.modules,
            pricing: version ? {
                baseCurrency: version.pricing?.baseCurrency || "USD",
                regions: (version.pricing?.regions || []).map(region => ({
                    regionCode: region.regionCode,
                    countries: region.countries,
                    currency: region.currency,
                    monthly: new Money(region.monthly).value(),
                    yearly: new Money(region.yearly).value()
                }))
            } : null,
            activeVersionId: version?._id || null,
            activeVersionTag: version?.versionTag || null,
            createdAt: template.createdAt
        };
    });
}

module.exports = {
    buildPlanCatalog
};
