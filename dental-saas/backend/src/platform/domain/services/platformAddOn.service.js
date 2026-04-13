/**
 * addOn.service.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const AddOn = require("../models/addOn.model").default;

/**
 * getAddOnByCode
 * @param {string} code 
 */
async function getAddOnByCode(code) {
    return await AddOn.findOne({ code, isActive: true });
}

/**
 * getAllActiveAddOns
 */
async function getAllActiveAddOns() {
    return await AddOn.find({ isActive: true });
}

module.exports = {
    getAddOnByCode,
    getAllActiveAddOns
};
