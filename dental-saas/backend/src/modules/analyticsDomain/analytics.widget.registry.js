/**
 * AnalyticsWidgetRegistry
 * 
 * Centralized configuration for all analytics tiles.
 * Defines roles, plan tiers, and projection mappings.
 */
const AnalyticsWidgetRegistry = {
    // EXECUTIVE DATA
    revenueTrend: {
        id: "revenueTrend",
        projection: "ExecutiveProjection",
        requiredRoles: ["admin", "owner"],
        requiredPlans: ["growth", "enterprise"],
        defaultTab: "Executive",
        defaultSize: "lg"
    },
    marginHeatmap: {
        id: "marginHeatmap",
        projection: "ExecutiveProjection",
        requiredRoles: ["admin", "owner"],
        requiredPlans: ["enterprise"],
        defaultTab: "Executive",
        defaultSize: "md"
    },

    // CLINICAL DATA
    activeCasesBySpecialty: {
        id: "activeCasesBySpecialty",
        projection: "ClinicalProjection",
        requiredRoles: ["admin", "doctor"],
        requiredPlans: ["basic", "growth", "enterprise"],
        defaultTab: "Clinical",
        defaultSize: "md"
    },
    stageBottlenecks: {
        id: "stageBottlenecks",
        projection: "ClinicalProjection",
        requiredRoles: ["admin", "doctor"],
        requiredPlans: ["growth", "enterprise"],
        defaultTab: "Clinical",
        defaultSize: "sm"
    },

    // OPERATIONAL DATA
    inventoryBurnRate: {
        id: "inventoryBurnRate",
        projection: "OperationalProjection",
        requiredRoles: ["admin", "inventory_manager"],
        requiredPlans: ["growth", "enterprise"],
        defaultTab: "Operational",
        defaultSize: "md"
    },
    chairUtilization: {
        id: "chairUtilization",
        projection: "OperationalProjection",
        requiredRoles: ["admin", "doctor"],
        requiredPlans: ["enterprise"],
        defaultTab: "Operational",
        defaultSize: "md"
    },

    // RISK DATA
    highOutstandingRisk: {
        id: "highOutstandingRisk",
        projection: "RiskProjection",
        requiredRoles: ["admin", "accountant"],
        requiredPlans: ["growth", "enterprise"],
        defaultTab: "Risk",
        defaultSize: "sm"
    },
    lowMarginAlerts: {
        id: "lowMarginAlerts",
        projection: "RiskProjection",
        requiredRoles: ["admin", "owner"],
        requiredPlans: ["enterprise"],
        defaultTab: "Risk",
        defaultSize: "sm"
    }
};

module.exports = AnalyticsWidgetRegistry;
