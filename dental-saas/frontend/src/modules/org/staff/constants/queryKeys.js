/**
 * queryKeys.js — Staff module React Query key factory
 * Centralized key namespace to avoid cross-module cache collisions.
 *
 * RULE: All query keys for the staff module MUST come from here.
 * Never create inline query key arrays inside hooks.
 */

export const STAFF_KEYS = {
    // User/staff list
    all: ["org", "staff"],
    list: (filters = {}) => ["org", "staff", "list", filters],
    detail: (id) => ["org", "staff", id],

    // Roles
    roles: ["org", "roles"],
    roleDetail: (id) => ["org", "roles", id],
};
