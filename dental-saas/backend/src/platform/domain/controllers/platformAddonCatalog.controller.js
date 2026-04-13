/**
 * Add-On Catalog Controller
 * Phase 10: Platform Add-On Catalog API.
 */

"use strict";

const { buildAddOnCatalog } = require("../../../projections/platform/addonCatalog.projection");

/**
 * getAddOnCatalog
 * GET /api/v1/platform/addons
 */
exports.getAddOnCatalog = async (req, res) => {
    try {
        const catalog = await buildAddOnCatalog();

        return res.json({
            success: true,
            data: catalog
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: { code: "SERVER_ERROR", message: "Error fetching add-on catalog", details: error.message }
        });
    }
};
