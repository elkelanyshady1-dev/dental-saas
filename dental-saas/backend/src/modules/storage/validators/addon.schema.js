/**
 * addon.schema.js — Zod validation for storage add-on purchase endpoint.
 * PLANE: Organization
 */

"use strict";

const { z } = require("zod");

const purchaseAddonSchema = z.object({
    addOnId: z
        .string()
        .regex(/^[0-9a-f]{24}$/i, "addOnId must be a valid 24-character ObjectId"),
    interval: z.enum(["monthly", "yearly"]).default("monthly"),
}).strict();

module.exports = { purchaseAddonSchema };
