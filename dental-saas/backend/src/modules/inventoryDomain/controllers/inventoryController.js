/**
 * inventoryController.js — Inventory HTTP Controller
 *
 * THIN LAYER: delegates all logic to write/read services.
 * Enforces response envelope standard.
 *
 * PLANE: Org only.
 * Guard chain: orgProtect → requireEntitlement("inventory") → requireOrgPermission(P.INVENTORY_*)
 */

"use strict";

const writeService = require("../services/inventoryWrite.service");
const readService  = require("../read/inventoryRead.service");
const logger       = require("@utils/logger");

function _conn(req) {
    return req.dbConnection;
}

// ── ITEMS ─────────────────────────────────────────────────────────────────────

exports.listItems = async (req, res) => {
    try {
        const result = await readService.listItems(req);
        return res.json({ success: true, ...result });
    } catch (err) {
        logger.error({ event: "INVENTORY_LIST_ERROR", error: err.message });
        return res.status(err.statusCode || 500).json({ success: false, error: { message: err.message } });
    }
};

exports.getItem = async (req, res) => {
    try {
        const item = await readService.getItem(req, req.params.id);
        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { message: err.message } });
    }
};

exports.createItem = async (req, res) => {
    try {
        const item = await writeService.createItem(_conn(req), req.body, req.user._id);
        return res.status(201).json({ success: true, data: item });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

exports.updateItem = async (req, res) => {
    try {
        const item = await writeService.updateItem(_conn(req), req.params.id, req.body, req.user._id);
        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

exports.deleteItem = async (req, res) => {
    try {
        await writeService.deleteItem(_conn(req), req.params.id, req.user._id);
        return res.json({ success: true, message: "Item deactivated." });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

// ── STOCK MUTATIONS ───────────────────────────────────────────────────────────

exports.addStock = async (req, res) => {
    try {
        const { quantity, reference, cost } = req.body;
        const item = await writeService.addStock(
            _conn(req), req.params.id, Number(quantity),
            { reference, cost, performedBy: req.user._id.toString(), orgId: req.organizationId }
        );
        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

exports.useStock = async (req, res) => {
    try {
        const { quantity, patientId, procedure, reference } = req.body;
        const item = await writeService.useStock(
            _conn(req), req.params.id, Number(quantity),
            { patientId, procedure, reference, performedBy: req.user._id.toString(), orgId: req.organizationId }
        );
        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

exports.adjustStock = async (req, res) => {
    try {
        const { newQuantity, reason } = req.body;
        const item = await writeService.adjustStock(
            _conn(req), req.params.id, Number(newQuantity),
            reason, req.user._id.toString(), req.organizationId
        );
        return res.json({ success: true, data: item });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

// ── MOVEMENTS (AUDIT) ────────────────────────────────────────────────────────

exports.getMovements = async (req, res) => {
    try {
        const result = await readService.getMovements(req, req.params.id);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { message: err.message } });
    }
};

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────────

exports.listPurchaseOrders = async (req, res) => {
    try {
        const result = await readService.listPurchaseOrders(req);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { message: err.message } });
    }
};

exports.createPurchaseOrder = async (req, res) => {
    try {
        const po = await writeService.createPurchaseOrder(
            _conn(req), req.body, req.user._id.toString(), req.organizationId
        );
        return res.status(201).json({ success: true, data: po });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

exports.receivePurchaseOrder = async (req, res) => {
    try {
        const po = await writeService.receivePurchaseOrder(
            _conn(req), req.params.id, req.user._id.toString(), req.organizationId
        );
        return res.json({ success: true, data: po });
    } catch (err) {
        return res.status(err.statusCode || 400).json({ success: false, error: { message: err.message } });
    }
};

// ── DASHBOARD (READ FROM PROJECTION) ─────────────────────────────────────────

exports.getDashboard = async (req, res) => {
    try {
        const data = await readService.getDashboard(req);
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { message: err.message } });
    }
};

// ── ALERTS ───────────────────────────────────────────────────────────────────

exports.getAlerts = async (req, res) => {
    try {
        const data = await readService.getAlerts(req);
        return res.json({ success: true, data });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { message: err.message } });
    }
};
