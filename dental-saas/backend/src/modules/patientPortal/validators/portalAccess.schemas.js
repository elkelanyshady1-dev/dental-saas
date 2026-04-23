/**
 * portalAccess.schemas.js — Zod Validation Schemas for Portal Access
 *
 * CLAUDE.md Section 6.1: ALL write inputs MUST use Zod.
 *
 * @module patientPortal/validators/portalAccess.schemas
 */

"use strict";

const { z } = require("zod");

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

const sendAccessLinkSchema = z.object({
    patientId: objectId,
    type: z.enum(["magic_link", "setup_link"]),
    deliveryChannel: z.enum(["whatsapp", "sms", "email"]).optional(),
});

const verifyAccessTokenSchema = z.object({
    token: z.string().min(1, "Token is required"),
});

const completeSetupSchema = z.object({
    setupToken: z.string().min(1, "Setup token is required"),
    password: z.string().min(8, "Password must be at least 8 characters").optional(),
    medicalHistory: z.object({
        chronicConditions: z.array(z.string()).optional(),
        allergies: z.array(z.string()).optional(),
        medications: z.array(z.string()).optional(),
        smoking: z.boolean().optional(),
        pregnancy: z.boolean().optional(),
    }).optional(),
});

module.exports = {
    sendAccessLinkSchema,
    verifyAccessTokenSchema,
    completeSetupSchema,
};
