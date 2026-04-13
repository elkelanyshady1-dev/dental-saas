/**
 * purchaseOrder.model.js
 *
 * Tracks supplier restock orders.
 * Status FSM: draft → ordered → received
 * On "received", emits inventory.stock.added.v1 per line item.
 *
 * PLANE: Org only. Per-org DB.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const LineItemSchema = new Schema({
    itemId:   { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1 },
    cost:     { type: Number, required: true, min: 0 }, // unit cost agreed with supplier
}, { _id: false });

const PurchaseOrderSchema = new Schema({
    supplierId:   { type: String },
    supplierName: { type: String },
    items:        { type: [LineItemSchema], required: true },
    status: {
        type:    String,
        enum:    ["draft", "ordered", "received"],
        default: "draft",
        index:   true,
    },
    totalAmount:  { type: Number, default: 0 },
    notes:        { type: String },
    createdBy:    { type: String },
    receivedAt:   { type: Date },
    createdAt:    { type: Date, default: Date.now },
    updatedAt:    { type: Date },
}, {
    timestamps: { updatedAt: "updatedAt", createdAt: false },
    versionKey: false,
});

PurchaseOrderSchema.index({ status: 1, createdAt: -1 });

const modelName = "PurchaseOrder";

module.exports = {
    modelName,
    schema: PurchaseOrderSchema,
};
