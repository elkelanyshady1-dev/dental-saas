/**
 * addOn.service.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const AddOnDef = require("../models/addOn.model");
let _AddOn_cache = null;
function AddOn() {
    return _AddOn_cache || (_AddOn_cache = getPlatformModel(AddOnDef));
}
/**
 * getAddOnByCode
 * @param {string} code 
 */
async function getAddOnByCode(code) {
  return await AddOn().findOne({
    code,
    isActive: true
  });
}

/**
 * getAllActiveAddOns
 */
async function getAllActiveAddOns() {
  return await AddOn().find({
    isActive: true
  });
}
module.exports = {
  getAddOnByCode,
  getAllActiveAddOns
};