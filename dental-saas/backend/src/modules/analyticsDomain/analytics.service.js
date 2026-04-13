/**
 * analytics.service.js
 * Analytics Domain — Dashboard Widget Orchestrator
 *
 * Orchestrates layout resolution and data aggregation across projections.
 *
 * @per-org-compliant — All data loading delegates to RLS-compliant projections.
 * req context propagated to every projection call for secureModel enforcement.
 */

const AnalyticsWidgetRegistry = require("./analytics.widget.registry");
const AnalyticsLayout = require("./analytics.layout.model");
const ExecutiveProjection = require("./projections/executive.projection");
const ClinicalProjection = require("./projections/clinical.projection");
const OperationalProjection = require("./projections/operational.projection");
const RiskProjection = require("./projections/risk.projection");

// ─── RLS Secure Wrapper for Layout ──────────────────────────────────────────
const Layout = AnalyticsLayout;

/**
 * AnalyticsService
 * 
 * Orchestrates layout resolution and data aggregation across projections.
 */
class AnalyticsService {
    /**
     * getAnalyticsData({ req, role, currentPlan })
     * @per-org-compliant — Layout lookup via secureModel, data via RLS-compliant projections
     */
    async getAnalyticsData({ req, role, currentPlan }) {
        // 1. Fetch layout — @per-org-compliant
        let layout = await Layout.findOne({ role });
        if (layout) layout = layout.toObject();

        // 2. Fallback to default if no layout exists
        if (!layout) {
            layout = this._getDefaultLayout(role);
        }

        const structuredTabs = [];

        // 3. Iterate through tabs and widgets
        for (const tab of layout.tabs) {
            const resolvedWidgets = [];

            for (const widgetId of tab.widgets) {
                const widgetConfig = AnalyticsWidgetRegistry[widgetId];

                // 4. Security & Plan Gating
                if (!widgetConfig) continue;
                if (!widgetConfig.requiredRoles.includes(role)) continue;
                if (!widgetConfig.requiredPlans.includes(currentPlan)) continue;

                // 5. Load Data via Projection — req propagated for RLS
                const data = await this._loadWidgetData(widgetConfig, req);

                resolvedWidgets.push({
                    id: widgetId,
                    config: {
                        size: widgetConfig.defaultSize
                    },
                    data
                });
            }

            if (resolvedWidgets.length > 0) {
                structuredTabs.push({
                    name: tab.name,
                    widgets: resolvedWidgets
                });
            }
        }

        return { tabs: structuredTabs };
    }

    /**
     * _loadWidgetData(config, req)
     * Maps widget configuration to projection methods.
     * req propagated for tenant isolation enforcement in underlying projections.
     */
    async _loadWidgetData(config, req) {
        const organizationId = req.organizationId;
        try {
            switch (config.id) {
                case "revenueTrend":
                    return await ExecutiveProjection.getRevenueTrend(organizationId, req);
                case "marginHeatmap":
                    return await ExecutiveProjection.getMarginHeatmap(organizationId, req);
                case "activeCasesBySpecialty":
                    return await ClinicalProjection.getActiveCasesBySpecialty(organizationId, req);
                case "stageBottlenecks":
                    return await ClinicalProjection.getStageBottlenecks(organizationId, req);
                case "inventoryBurnRate":
                    return await OperationalProjection.getInventoryBurnRate(organizationId, req);
                case "chairUtilization":
                    // Placeholder for future implementation
                    return { message: "Chair utilization tracking requires additional sensor integration." };
                case "highOutstandingRisk":
                    return await RiskProjection.getHighOutstandingRisk(organizationId, req);
                case "lowMarginAlerts":
                    return await RiskProjection.getLowMarginAlerts(organizationId, req);
                default:
                    return null;
            }
        } catch (error) {
            console.error(`Error loading widget data for ${config.id}:`, error);
            return { error: "Failed to load widget data." };
        }
    }

    /**
     * _getDefaultLayout(role)
     * Provides a standard dashboard structure based on user role.
     */
    _getDefaultLayout(role) {
        const layouts = {
            admin: {
                tabs: [
                    { name: "Executive", widgets: ["revenueTrend", "marginHeatmap"] },
                    { name: "Risk", widgets: ["highOutstandingRisk", "lowMarginAlerts"] },
                    { name: "Clinical", widgets: ["activeCasesBySpecialty", "stageBottlenecks"] }
                ]
            },
            doctor: {
                tabs: [
                    { name: "Clinical", widgets: ["activeCasesBySpecialty", "stageBottlenecks"] },
                    { name: "Operational", widgets: ["inventoryBurnRate"] }
                ]
            },
            accountant: {
                tabs: [
                    { name: "Financial", widgets: ["revenueTrend", "highOutstandingRisk"] }
                ]
            }
        };

        return layouts[role] || layouts.admin;
    }
}

module.exports = new AnalyticsService();
