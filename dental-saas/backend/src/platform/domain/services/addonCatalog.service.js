/**
 * addonCatalog.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD operations for the platform AddOn catalog.
 *
 * Rules:
 *   - code and type are IMMUTABLE after creation (change = new record).
 *   - PATCH is OAV-guarded (optimistic version) — 409 on mismatch.
 *   - DELETE is soft-only (isActive=false); blocked if any active OrgAddOn references the add-on.
 *   - All writes use session.withTransaction() on the platform connection.
 *   - QUOTA benefits must contain at least one positive numeric quota key.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose                  = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const getModel                  = require("@core/db/getModel");
const AddOnDef                  = require("../models/addOn.model");
const OrgAddOnDef               = require("../../billing/models/orgAddOn.model");
const logger                    = require("@utils/logger");

function _getModels() {
    const conn   = getPlatformConnection();
    const AddOn  = getModel(conn, AddOnDef);
    const OrgAddOn = getModel(conn, OrgAddOnDef);
    return { conn, AddOn, OrgAddOn };
}

// ─── _validateQuotaBenefits ────────────────────────────────────────────────────

function _validateQuotaBenefits(type, benefits) {
    if (type !== "QUOTA") return;
    const hasPositiveQuota = Object.values(benefits || {}).some(
        (v) => typeof v === "number" && v > 0
    );
    if (!hasPositiveQuota) {
        const err = new Error("QUOTA add-on benefits must contain at least one positive numeric quota key");
        err.statusCode = 400;
        err.code = "ADDON_BENEFITS_INVALID";
        throw err;
    }
}

// ─── _validateRegionUniqueness ─────────────────────────────────────────────────

function _validateRegionUniqueness(regions) {
    if (!regions) return;
    const codes = regions.map((r) => r.regionCode);
    const unique = new Set(codes);
    if (unique.size !== codes.length) {
        const err = new Error("Duplicate regionCode entries are not allowed");
        err.statusCode = 400;
        err.code = "ADDON_REGION_DUPLICATE";
        throw err;
    }

    // Check disjoint countries within regions
    const seenCountries = new Map(); // country → regionCode
    for (const region of regions) {
        for (const country of region.countries || []) {
            if (seenCountries.has(country)) {
                const err = new Error(
                    `Country "${country}" appears in more than one region (${seenCountries.get(country)} and ${region.regionCode}). ` +
                    `Countries must be disjoint across regions.`
                );
                err.statusCode = 400;
                err.code = "ADDON_COUNTRY_OVERLAP";
                throw err;
            }
            seenCountries.set(country, region.regionCode);
        }
    }
}

// ─── createAddOn ──────────────────────────────────────────────────────────────

/**
 * @param {import('express').Request} req
 * @param {Object} payload — validated by createAddOnSchema
 * @returns {Promise<Object>} Created AddOn doc (lean)
 */
async function createAddOn(req, payload) {
    const { conn, AddOn } = _getModels();

    _validateQuotaBenefits(payload.type, payload.benefits);
    _validateRegionUniqueness(payload.pricing?.regions);

    const session = await conn.startSession();
    let created;

    try {
        await session.withTransaction(async () => {
            const docs = await AddOn.create([{
                name:        payload.name,
                code:        payload.code,
                description: payload.description,
                type:        payload.type,
                benefits:    payload.benefits,
                pricing:     payload.pricing,
                isActive:    payload.isActive ?? true,
                version:     1,
            }], { session });
            created = docs[0];
        });
    } finally {
        await session.endSession();
    }

    logger.info(
        { event: "ADDON_CREATED", addOnId: String(created._id), code: created.code },
        "[AddonCatalog] Add-on created"
    );

    return created.toObject();
}

// ─── updateAddOn ──────────────────────────────────────────────────────────────

/**
 * OAV-guarded patch.
 *
 * @param {import('express').Request} req
 * @param {string}  addOnId
 * @param {number}  expectedVersion
 * @param {Object}  patch
 * @returns {Promise<Object>} Updated AddOn doc (lean)
 */
async function updateAddOn(req, addOnId, { expectedVersion, patch }) {
    const { conn, AddOn } = _getModels();

    if (patch.benefits !== undefined) {
        // Fetch current type to validate benefits
        const current = await AddOn.findById(addOnId).select("type version").lean();
        if (!current) {
            const err = new Error("Add-on not found");
            err.statusCode = 404;
            err.code = "ADDON_NOT_FOUND";
            throw err;
        }
        _validateQuotaBenefits(current.type, patch.benefits);
    }

    if (patch.pricing?.regions) {
        _validateRegionUniqueness(patch.pricing.regions);
    }

    // Build $set from allowed patch fields only
    const $set = {};
    if (patch.name        !== undefined) $set.name        = patch.name;
    if (patch.description !== undefined) $set.description = patch.description;
    if (patch.benefits    !== undefined) $set.benefits    = patch.benefits;
    if (patch.isActive    !== undefined) $set.isActive    = patch.isActive;
    if (patch.pricing) {
        if (patch.pricing.baseCurrency !== undefined) $set["pricing.baseCurrency"] = patch.pricing.baseCurrency;
        if (patch.pricing.regions      !== undefined) $set["pricing.regions"]      = patch.pricing.regions;
        // v4: Global USD pricing (single source of truth for new add-ons)
        if (patch.pricing.global       !== undefined) $set["pricing.global"]       = patch.pricing.global;
    }

    const session = await conn.startSession();
    let updated;

    try {
        await session.withTransaction(async () => {
            updated = await AddOn.findOneAndUpdate(
                { _id: new mongoose.Types.ObjectId(addOnId), version: expectedVersion },
                { $set, $inc: { version: 1 } },
                { returnDocument: "after", session }
            );

            if (!updated) {
                // Distinguish not-found from version conflict
                const exists = await AddOn.exists({ _id: new mongoose.Types.ObjectId(addOnId) });
                const err = new Error(
                    exists
                        ? "Version conflict — another admin updated this add-on. Reload and retry."
                        : "Add-on not found"
                );
                err.statusCode = exists ? 409 : 404;
                err.code       = exists ? "ADDON_VERSION_CONFLICT" : "ADDON_NOT_FOUND";
                throw err;
            }
        });
    } finally {
        await session.endSession();
    }

    logger.info(
        { event: "ADDON_UPDATED", addOnId, newVersion: updated.version },
        "[AddonCatalog] Add-on updated"
    );

    return updated.toObject();
}

// ─── deleteAddOn (soft) ────────────────────────────────────────────────────────

/**
 * Soft-delete: set isActive=false. Blocked if active OrgAddOn records exist.
 *
 * @param {import('express').Request} req
 * @param {string} addOnId
 * @returns {Promise<void>}
 */
async function deleteAddOn(req, addOnId) {
    const { conn, AddOn, OrgAddOn } = _getModels();

    // Block if referenced by active OrgAddOn
    const activeCount = await OrgAddOn.countDocuments({
        addOnId: new mongoose.Types.ObjectId(addOnId),
        status:  "active",
    });

    if (activeCount > 0) {
        const err = new Error(
            `Cannot deactivate — ${activeCount} organization(s) have this add-on active. ` +
            `Cancel their subscriptions first.`
        );
        err.statusCode = 409;
        err.code       = "ADDON_IN_USE";
        err.details    = { activeOrgCount: activeCount };
        throw err;
    }

    const session = await conn.startSession();

    try {
        await session.withTransaction(async () => {
            const result = await AddOn.updateOne(
                { _id: new mongoose.Types.ObjectId(addOnId) },
                { $set: { isActive: false } },
                { session }
            );
            if (result.matchedCount === 0) {
                const err = new Error("Add-on not found");
                err.statusCode = 404;
                err.code = "ADDON_NOT_FOUND";
                throw err;
            }
        });
    } finally {
        await session.endSession();
    }

    logger.info(
        { event: "ADDON_DEACTIVATED", addOnId },
        "[AddonCatalog] Add-on soft-deleted"
    );
}

module.exports = { createAddOn, updateAddOn, deleteAddOn };
