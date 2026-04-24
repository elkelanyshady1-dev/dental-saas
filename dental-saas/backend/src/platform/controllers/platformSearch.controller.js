/**
 * platformSearch.controller.js
 * Platform — Unified Entity Search
 *
 * GET /api/platform/search?q=<query>
 *
 * Searches across:
 *   - Organizations (name, slug, country)
 *   - PlatformUsers (name, email)
 *   - OrgContracts (planCode, status)
 *   - PlatformInvoices (invoiceNumber)
 *
 * RBAC: results are filtered per caller capabilities.
 *   VIEW_ORGANIZATIONS → include orgs + contracts + invoices
 *   MANAGE_PLATFORM_USERS → include platform users
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("@shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const PlatformUserDef = require("../../platform/models/PlatformUser");
let _PlatformUser_cache = null;
function PlatformUser() {
    return _PlatformUser_cache || (_PlatformUser_cache = getPlatformModel(PlatformUserDef));
}
const OrgContractDef = require("../../platform/billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlatformInvoiceDef = require("../../platform/billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const {
  platformCapabilityResolver
} = require("../../services/platformCapabilityResolver");
const logger = require("@utils/logger");
const RESULT_LIMIT = 5; // per category

/**
 * GET /api/platform/search?q=...
 */
exports.search = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        data: {
          organizations: [],
          users: [],
          contracts: [],
          invoices: []
        },
        query: q
      });
    }

    // Resolve caller capabilities for RBAC filtering
    const capabilities = platformCapabilityResolver(req.platformUser?.role);
    const canViewOrgs = capabilities.includes("VIEW_ORGANIZATIONS");
    const canViewUsers = capabilities.includes("MANAGE_PLATFORM_USERS");
    const regex = {
      $regex: q,
      $options: "i"
    };
    const [orgs, users, contracts, invoices] = await Promise.all([
    // Organizations — only if VIEW_ORGANIZATIONS
    canViewOrgs ? Organization().find({
      $or: [{
        name: regex
      }, {
        slug: regex
      }, {
        country: regex
      }],
      isArchived: {
        $ne: true
      }
    }).select("name slug country subscription.status isActive createdAt").limit(RESULT_LIMIT).lean() : [],
    // PlatformUsers — only if MANAGE_PLATFORM_USERS
    canViewUsers ? PlatformUser().find({
      $or: [{
        name: regex
      }, {
        email: regex
      }]
    }).select("name email role isActive createdAt").limit(RESULT_LIMIT).lean() : [],
    // OrgContracts — only if VIEW_ORGANIZATIONS
    canViewOrgs ? OrgContract().find({
      $or: [{
        planCode: regex
      }, {
        contractStatus: regex
      }]
    }).select("planCode contractStatus currency organizationId effectiveTo createdAt").limit(RESULT_LIMIT).lean() : [],
    // PlatformInvoices — only if VIEW_ORGANIZATIONS
    canViewOrgs ? PlatformInvoice().find({
      $or: [{
        invoiceNumber: regex
      }, {
        status: regex
      }]
    }).select("invoiceNumber status totalAmount currency organizationId createdAt").limit(RESULT_LIMIT).lean() : []]);
    logger.info({
      requestId: req.requestId,
      query: q,
      results: {
        orgs: orgs.length,
        users: users.length,
        contracts: contracts.length,
        invoices: invoices.length
      }
    }, "[platformSearch] search completed");
    return res.json({
      success: true,
      query: q,
      data: {
        organizations: orgs,
        users,
        contracts,
        invoices
      }
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformSearch] search failed");
    return res.status(500).json({
      success: false,
      error: "Search failed",
      requestId: req.requestId
    });
  }
};