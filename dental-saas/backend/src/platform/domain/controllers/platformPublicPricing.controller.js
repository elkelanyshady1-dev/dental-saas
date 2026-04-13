/**
 * publicPricing.controller.js
 * Phase v6.2 — Public Dynamic Pricing API (Migrated to PlanVersion)
 *
 * VISIBILITY ENFORCEMENT (Zero-Trust):
 *   All public endpoints query PlanVersion with { status: "active", visibility: "public" }.
 *   Runtime leak assertions catch any DB-level bypass.
 *   NO frontend filtering — all filtering is server-side.
 */

"use strict";

// MIGRATED v6.2: Replaced retired Plan shim with canonical models
const PlanVersion = require("@billing/models/PlanVersion.model").default;
const PlanTemplate = require("@billing/models/PlanTemplate.model").default;
const addOnService = require("../services/platformAddOn.service");
const { resolveCountry } = require("@core/geo/countryResolver");
const { resolveRegionalPrice } = require("@core/subscription/planResolver");

/**
 * transformPlanForMarketing
 * Pure transformation helper for public exposure.
 * @param {Object} plan - Plan document
 * @param {string} detectedCountry - Detected ISO code
 */
function transformPlanForMarketing(plan, detectedCountry = "US") {
    const p = plan.toObject ? plan.toObject() : plan;

    // Safety check: remove sensitive/internal fields
    const { version, isActive, ...safePlan } = p;

    // Resolve regional price
    const region = resolveRegionalPrice(p, detectedCountry);

    const price = region ? {
        regionCode: region.regionCode,
        monthly: region.monthly,
        yearly: region.yearly,
        currency: region.currency
    } : null;

    // Enhance modules with readable labels
    const moduleLabels = {
        patients: "Patient Management",
        appointments: "Appointment Scheduling",
        finance: "Financial Accounting",
        inventory: "Inventory Management",
        lab: "Laboratory Case Tracking",
        orthodonticsAdv: "Advanced Orthodontics Module",   // matches PlanVersion schema
        communication: "Patient Communications (SMS/Email)",
        analytics: "Analytics & Reporting",
        booking: "Online Booking"
    };

    const marketingModules = {};
    Object.keys(safePlan.modules || {}).forEach(key => {
        const val = safePlan.modules[key];
        const isIncluded = typeof val === 'boolean' ? val : val?.enabled;

        marketingModules[key] = {
            included: isIncluded,
            label: moduleLabels[key] || key,
            marketingLabel: isIncluded ? `${moduleLabels[key]} Included` : `${moduleLabels[key]} Not Included`
        };

        // Add quota details for communication if enabled
        if (key === 'communication' && isIncluded && typeof val === 'object') {
            marketingModules[key].quotas = {
                sms: val.smsQuota,
                whatsapp: val.whatsappQuota,
                email: val.emailQuota
            };
        }
    });

    return {
        ...safePlan,
        pricing: price,
        modules: marketingModules
    };
}

/**
 * 1️⃣ GET /api/public/pricing
 *
 * MIGRATED v6.2: Now uses PlanVersion (active + public only) instead of
 * the retired Plan shim. Enriches with PlanTemplate metadata.
 *
 * Visibility enforcement:
 *   - DB query: { status: "active", visibility: "public" }
 *   - Runtime assertion: rejects any non-public version that leaks through
 */
exports.getPublicPricing = async (req, res) => {
    try {
        const detectedCountry = resolveCountry(req);

        // ── Query PlanVersion (source of truth) with visibility gate ──────
        const activeVersions = await PlanVersion.find({
            status: "active",
            visibility: "public"
        }).sort({ activatedAt: -1 }).lean();

        // Runtime leak assertion (defense-in-depth)
        const leaked = activeVersions.filter(v => v.visibility !== "public");
        if (leaked.length > 0) {
            const logger = require("@utils/logger");
            logger.error(
                { leakedIds: leaked.map(v => v._id), service: "PublicPricing" },
                "[SECURITY] Non-public PlanVersion leaked through DB query in /public/pricing"
            );
            // Remove leaked entries before processing
            activeVersions.splice(0, activeVersions.length,
                ...activeVersions.filter(v => v.visibility === "public")
            );
        }

        // Enrich with PlanTemplate metadata (name, description)
        const templateIds = [...new Set(activeVersions.map(v => v.templateId?.toString()).filter(Boolean))];
        const templates = await PlanTemplate.find(
            { _id: { $in: templateIds } },
            { name: 1, code: 1, description: 1, modules: 1, limits: 1 }
        ).lean();
        const templateMap = Object.fromEntries(templates.map(t => [t._id.toString(), t]));

        // Transform to marketing shape using template + version data
        const marketingPlans = activeVersions.map(v => {
            const tmpl = templateMap[v.templateId?.toString()] || {};
            // Build a merged "plan-like" object for transformPlanForMarketing
            const merged = {
                ...tmpl,
                ...v,
                name: tmpl.name || v.label,
                code: v.templateCode || tmpl.code,
            };
            return transformPlanForMarketing(merged, detectedCountry);
        });

        res.json({
            detectedCountry,
            plans: marketingPlans
        });
    } catch (err) {
        res.status(500).json({ message: "Unable to fetch pricing plans at this time." });
    }
};

/**
 * 2️⃣ GET /api/public/pricing/matrix
 *
 * MIGRATED v6.2: Now uses PlanVersion (active + public only) instead of
 * the retired Plan shim. Feature matrix computed from version data.
 */
exports.getPricingMatrix = async (req, res) => {
    try {
        const activeVersions = await PlanVersion.find({
            status: "active",
            visibility: "public"
        }).sort({ activatedAt: -1 }).lean();

        // Enrich with template names
        const templateIds = [...new Set(activeVersions.map(v => v.templateId?.toString()).filter(Boolean))];
        const templates = await PlanTemplate.find(
            { _id: { $in: templateIds } },
            { name: 1, code: 1 }
        ).lean();
        const templateMap = Object.fromEntries(templates.map(t => [t._id.toString(), t]));

        // Generate matrix dynamically
        const featureKeys = [
            { key: "maxUsers", label: "Maximum Doctors", path: "limits.maxUsers" },
            { key: "maxBranches", label: "Maximum Branches", path: "limits.maxBranches" },
            { key: "inventory", label: "Inventory Module", path: "modules.inventory" },
            { key: "lab", label: "Lab Tracking", path: "modules.lab" },
            { key: "orthodonticsAdv", label: "Advanced Orthodontics", path: "modules.orthodonticsAdv" },
            { key: "communication", label: "Patient Communications", path: "modules.communication" }
        ];

        const matrix = featureKeys.map(f => {
            const values = {};
            activeVersions.forEach(v => {
                const code = v.templateCode || templateMap[v.templateId?.toString()]?.code || "unknown";
                let val;
                if (f.path.startsWith("limits.")) {
                    const limitVal = v.limits?.[f.key];
                    val = limitVal === -1 || limitVal > 999 ? "Unlimited" : limitVal;
                } else if (f.path.startsWith("modules.")) {
                    const moduleVal = v.modules?.[f.key];
                    val = (typeof moduleVal === "boolean" ? moduleVal : moduleVal?.enabled) ? "Included" : "—";
                }
                values[code] = val;
            });
            return {
                key: f.key,
                label: f.label,
                plans: values
            };
        });

        res.json({
            detectedCountry: resolveCountry(req),
            plans: activeVersions.map(v => {
                const tmpl = templateMap[v.templateId?.toString()] || {};
                return { name: tmpl.name || v.label, code: v.templateCode || tmpl.code };
            }),
            features: matrix
        });
    } catch (err) {
        res.status(500).json({ message: "Unable to generate pricing matrix." });
    }
};

/**
 * 3️⃣ GET /api/public/addons
 */
exports.getPublicAddOns = async (req, res) => {
    try {
        const detectedCountry = resolveCountry(req);
        const addOns = await addOnService.getAllActiveAddOns();

        const marketingAddOns = addOns.map(addOn => {
            const region = resolveRegionalPrice(addOn, detectedCountry);
            return {
                name: addOn.name,
                code: addOn.code,
                description: addOn.description,
                type: addOn.type,
                benefits: addOn.benefits,
                pricing: region ? {
                    monthly: region.monthly,
                    yearly: region.yearly,
                    currency: region.currency
                } : null
            };
        });

        res.json({
            detectedCountry,
            addOns: marketingAddOns
        });
    } catch (err) {
        res.status(500).json({ message: "Unable to fetch add-ons at this time." });
    }
};

module.exports = {
    transformPlanForMarketing,
    getPublicPricing: exports.getPublicPricing,
    getPricingMatrix: exports.getPricingMatrix,
    getPublicAddOns: exports.getPublicAddOns
};
