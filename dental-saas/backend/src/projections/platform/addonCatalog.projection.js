/**
 * Add-On Catalog Projection
 * Phase 10: Platform Add-On Catalog API.
 * 
 * Logic for read-only add-on catalog exposure.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const AddOnDef = require("../../platform/domain/models/addOn.model");
let _AddOn_cache = null;
function AddOn() {
    return _AddOn_cache || (_AddOn_cache = getPlatformModel(AddOnDef));
}
const Money = require("../../utils/money");

/**
 * buildAddOnCatalog
 * Returns a list of all add-ons with benefits and regional pricing, excluding secrets.
 * 
 * @returns {Promise<Array>} List of AddOn DTOs
 */
async function buildAddOnCatalog() {
  const addons = await AddOn().find({
    isActive: true
  }).lean();
  return addons.map(addon => ({
    id: addon._id,
    name: addon.name,
    code: addon.code,
    description: addon.description,
    type: addon.type,
    benefits: addon.benefits,
    pricing: {
      baseCurrency: addon.pricing.baseCurrency,
      regions: addon.pricing.regions.map(region => ({
        regionCode: region.regionCode,
        countries: region.countries,
        currency: region.currency,
        monthly: new Money(region.monthly).value(),
        yearly: new Money(region.yearly).value()
      }))
    },
    version: addon.version,
    createdAt: addon.createdAt
  }));
}
module.exports = {
  buildAddOnCatalog
};