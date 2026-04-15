/**
 * roles.validators.js — Zod schemas for org-plane Role management (Phase B)
 *
 * Contract:
 *   - All payloads strict (no unknown keys).
 *   - `permissions` is a flat map { "<module>.<action>": boolean }.
 *     Service layer converts flat → nested before writing to Mongoose.
 *   - Permission KEYS are validated at parse time via superRefine against the
 *     SSOT (permissionRegistry.generatePermissionKeys). Unknown keys → reject.
 *   - Role NAMES are free-form slugs (system role names are reserved & blocked
 *     at the service layer — not here — so admins can still query/update them).
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");
const mongoose = require("mongoose");
const { generatePermissionKeys } = require("@rbac/permissionRegistry");

// ─── Primitives ─────────────────────────────────────────────────────────────

const objectIdString = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
        message: "must be a valid ObjectId",
    });

// Slug-ish role name: lowercase letters, digits, underscores. 2–40 chars.
// Mirrors the shape of the system role names (org_admin, lab_technician, …)
// so custom roles stay consistent with the SSOT seeds.
const roleNameSchema = z
    .string()
    .trim()
    .min(2, "name must be at least 2 characters")
    .max(40, "name must be at most 40 characters")
    .regex(/^[a-z][a-z0-9_]*$/, "name must be lowercase letters, digits, and underscores (start with a letter)");

// Strict permission map — keys validated against registry SSOT.
// Shape: { "patients.read": true, "staff.manage": false, ... }
// NOTE: zod v4 changed `z.record` to (keySchema, valueSchema). Passing a
// single arg is interpreted as the KEY schema and silently rejects every
// string-keyed payload — keep BOTH args here.
const permissionsMapSchema = z
    .record(z.string(), z.boolean())
    .superRefine((obj, ctx) => {
        const validKeys = generatePermissionKeys();
        const validSet = new Set(validKeys);
        for (const key of Object.keys(obj)) {
            if (!validSet.has(key)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [key],
                    message: `Invalid permission key: ${key}`,
                });
            }
        }
    });

// ─── Create ─────────────────────────────────────────────────────────────────

const createRoleSchema = z
    .object({
        name: roleNameSchema,
        description: z.string().trim().max(500).optional(),
        // On create, at least one permission must be granted (empty roles are
        // a footgun — a user assigned an empty role would be locked out of
        // every org endpoint). Enforce non-empty at the schema layer.
        permissions: permissionsMapSchema.refine(
            (obj) => Object.values(obj).some((v) => v === true),
            { message: "permissions must grant at least one capability" },
        ),
    })
    .strict();

// ─── Update ─────────────────────────────────────────────────────────────────
// All fields optional; service layer merges into existing role. At least one
// field must be present so we never issue a no-op UPDATE that still bumps
// tokenVersion for every assigned user.

const updateRoleSchema = z
    .object({
        name: roleNameSchema.optional(),
        description: z.string().trim().max(500).optional(),
        permissions: permissionsMapSchema.optional(),
    })
    .strict()
    .refine(
        (obj) => obj.name !== undefined || obj.description !== undefined || obj.permissions !== undefined,
        { message: "at least one of name, description, or permissions must be provided" },
    );

// ─── Assign ─────────────────────────────────────────────────────────────────
// Assigning a role to a user. Both IDs are required. Same-org validation
// happens in the service layer (needs DB access).

const assignRoleSchema = z
    .object({
        userId: objectIdString,
        roleId: objectIdString,
    })
    .strict();

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    createRoleSchema,
    updateRoleSchema,
    assignRoleSchema,
    // exported for tests
    permissionsMapSchema,
    roleNameSchema,
};
