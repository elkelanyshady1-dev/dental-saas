/**
 * coupon.controller.js
 * Phase v6.1 — Coupon System
 */

"use strict";

const couponAggregateService = require("../services/platformCoupon.aggregate.service");
const { createAuditRecord } = require("../../../services/auditService");

/**
 * POST /api/platform/coupons
 * Create a new coupon
 */
exports.createCoupon = async (req, res) => {
    try {
        const coupon = await couponAggregateService.createCoupon(req.body);

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000", // Platform level
            actorId: req.user.userId,
            actorType: "platform_user",
            action: "COUPON_CREATED",
            entity: "coupon",
            entityId: coupon._id,
            details: { code: coupon.code, type: coupon.type, value: coupon.value },
            success: true
        });

        res.status(201).json({ message: "Coupon created", data: coupon });
    } catch (err) {
        res.status(500).json({ message: "Failed to create coupon", error: err.message });
    }
};

/**
 * PUT /api/platform/coupons/:id
 * Update an existing coupon (OAV protected)
 */
exports.updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { version, ...updateData } = req.body;

        const coupon = await couponAggregateService.updateCoupon(id, version, updateData);

        await createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.user.userId,
            actorType: "platform_user",
            action: "COUPON_UPDATED",
            entity: "coupon",
            entityId: coupon._id,
            success: true
        });

        res.json({ message: "Coupon updated", data: coupon });
    } catch (err) {
        if (err.message === "COUPON_NOT_FOUND") return res.status(404).json({ message: "Coupon not found" });
        if (err.message === "COUPON_VERSION_CONFLICT") return res.status(409).json({ message: "Conflict: Coupon was updated by another request" });
        res.status(500).json({ message: "Failed to update coupon", error: err.message });
    }
};
