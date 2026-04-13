/**
 * permissionMapper.js — Permission string mapping utilities
 * Bridges between flat JWT permission arrays and structured UI rendering.
 *
 * RULE: Permission truth comes from JWT only (Cursor Rules §5).
 * DO NOT duplicate permission strings — read from STAFF_KEYS or API.
 */

/**
 * groupPermissionsByModule — Groups flat permission array into domain buckets.
 *
 * @param {string[]} permissions - e.g. ["patients.read", "users.create"]
 * @returns {Object.<string, string[]>} - e.g. { patients: ["read"], users: ["create"] }
 */
export function groupPermissionsByModule(permissions = []) {
    return permissions.reduce((acc, perm) => {
        const [module, action] = perm.split(".");
        if (!module || !action) return acc;
        if (!acc[module]) acc[module] = [];
        acc[module].push(action);
        return acc;
    }, {});
}

/**
 * hasPermission — Check if a permission string is in a permission set.
 *
 * @param {string[]} permissions - User's permission array
 * @param {string} permission - e.g. "users.create"
 * @returns {boolean}
 */
export function hasPermission(permissions = [], permission = "") {
    return Array.isArray(permissions) && permissions.includes(permission);
}

/**
 * buildPermissionMatrix — Build a role→permission boolean matrix for UI rendering.
 *
 * @param {Object[]} roles - Role documents from API, each has { name, permissions: {} }
 * @param {string[]} permissionKeys - Flat list of permission strings to check
 * @returns {Object.<string, Object.<string, boolean>>}
 *   e.g. { org_admin: { "patients.read": true }, doctor: { "patients.read": true, ... } }
 */
export function buildPermissionMatrix(roles = [], permissionKeys = []) {
    return roles.reduce((matrix, role) => {
        const flatPerms = flattenRolePermissions(role.permissions || {});
        matrix[role.name] = permissionKeys.reduce((row, key) => {
            row[key] = flatPerms.has(key);
            return row;
        }, {});
        return matrix;
    }, {});
}

/**
 * flattenRolePermissions — Convert nested role.permissions object to a Set of strings.
 * Handles both { module: { action: bool } } and flat string[] shapes.
 *
 * @param {Object|string[]} permissions
 * @returns {Set<string>}
 */
export function flattenRolePermissions(permissions) {
    if (Array.isArray(permissions)) return new Set(permissions);
    const flat = new Set();
    if (typeof permissions !== "object" || !permissions) return flat;
    for (const [module, actions] of Object.entries(permissions)) {
        if (typeof actions === "object") {
            for (const [action, granted] of Object.entries(actions)) {
                if (granted === true) flat.add(`${module}.${action}`);
            }
        }
    }
    return flat;
}
