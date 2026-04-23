/**
 * portalAuth.schemas.js — Zod Validation Schemas for Portal Auth
 *
 * CLAUDE.md Section 6.1: ALL write inputs MUST use Zod.
 *
 * @module patientPortal/validators/portalAuth.schemas
 */

"use strict";

const { z } = require("zod");

const loginSchema = z.object({
    email: z.string().email().trim().toLowerCase(),
    password: z.string().min(1, "Password is required"),
});

const magicLinkRequestSchema = z.object({
    email: z.string().email().trim().toLowerCase(),
});

const magicLinkVerifySchema = z.object({
    token: z.string().min(1, "Token is required"),
});

const generateMagicLinkSchema = z.object({
    patientId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid patientId"),
});

const otpRequestSchema = z.object({
    email: z.string().email().trim().toLowerCase(),
});

const otpVerifySchema = z.object({
    email: z.string().email().trim().toLowerCase(),
    otp: z.string().length(6).regex(/^\d{6}$/, "OTP must be 6 digits"),
});

module.exports = {
    loginSchema,
    magicLinkRequestSchema,
    magicLinkVerifySchema,
    generateMagicLinkSchema,
    otpRequestSchema,
    otpVerifySchema,
};
