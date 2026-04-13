/**
 * inventory.read.service.js
 * Phase F.2 — RLS Migration
 *
 * Read-Only Facade for Inventory Domain.
 * Uses secureModel for RLS-enforced reads.
 *
 * @per-org-compliant — All read operations use secureModel
 */

"use strict";

const InventoryItemDef = require("../models/inventoryItem.model");
const InventoryTransactionDef = require("../models/inventoryTransaction.model");
const getModel = require("../../../core/db/getModel");

function _getModels(req) {
    const conn = req.dbConnection;
    return {
        Item: getModel(conn, InventoryItemDef),
        Transaction: getModel(conn, InventoryTransactionDef),
    };
}

class InventoryReadService {
    /**
     * getInventoryItem() — RLS-scoped single item read
     */
    async getInventoryItem(req, itemId) {
        const { Item } = _getModels(req);
        return await Item.findById(itemId).lean();
    }

    /**
     * existsInventoryItem() — RLS-scoped existence check
     */
    async existsInventoryItem(req, itemId) {
        const { Item } = _getModels(req);
        const result = await Item.exists({ _id: itemId });
        return !!result;
    }

    /**
     * getInventoryItems() — RLS-scoped list query
     */
    async getInventoryItems(req, filter = {}) {
        const { Item } = _getModels(req);
        return await Item.find(filter).lean();
    }

    /**
     * aggregateTransactions() — RLS-scoped aggregation
     * @per-org-compliant — per-org connection scopes $match { organizationId }
     */
    async aggregateTransactions(req, pipeline) {
        const { Transaction } = _getModels(req);
        return await Transaction.aggregate(pipeline);
    }

    /**
     * findItems() — RLS-scoped complex find
     */
    async findItems(req, query, select = "") {
        const { Item } = _getModels(req);
        return await Item.find(query).select(select).lean();
    }
}

module.exports = new InventoryReadService();
