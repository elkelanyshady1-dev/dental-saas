/**
 * user.write.js — Write Access Guard for User / Staff resources
 *
 * Defines which fields each role is allowed to write when creating
 * or updating a User (org-plane staff member).
 *
 * Rules:
 *  - org_admin can write all staff fields
 *  - doctor / assistant / receptionist can only update their own profile fields
 *  - "*" = unrestricted (all fields allowed for that role)
 */
"use strict";

const USER_CREATE_FIELDS = [
    "firstName",
    "lastName",
    // email is intentionally ABSENT — system-generated on backend (v3.0 identity system)
    "password",
    "roleId",
    "phone",
    "jobTitle",
    "department",
    "speciality",         // legacy root field (kept for form compat)
    "specialty",          // v32.0 canonical field (sent as specialty from form)
    "isPractitioner",     // v32.0 practitioner flag — admin can set/clear this
    "profile",            // allows profile.specialty (deep field flattener: "profile" covers "profile.*")
    "branchIds",          // new preferred field (branchAccess still accepted in service)
    "branchAccess",       // legacy alias — accepted by service layer
    "hasFullBranchAccess",
    "isActive",
    "profileImage",       // avatar URL or uploaded photo path
    "avatarIndex",        // numeric index if using predefined avatars
];

const USER_SELF_FIELDS = [
    "firstName",
    "lastName",
    "phone",
    "jobTitle",
    "speciality",
    "profileImage",
];

module.exports = {
    /**
     * "user" resource — used by fieldWriteGuardMiddleware("user")
     * on POST /org/users and PATCH /org/users/:id
     */
    user: {
        // Platform-designated org admin → full control over staff
        // Both "org_admin" and "admin" are supported:
        //   "org_admin" — ORG_ROLES canonical name (orgPermissions.js)
        //   "admin"     — actual DB role.name that flows into JWT roleName
        org_admin:         USER_CREATE_FIELDS,
        admin:             USER_CREATE_FIELDS,

        // Doctors can create/update within limit; admin gate enforces they can't create users
        doctor:            USER_SELF_FIELDS,
        assistant:         USER_SELF_FIELDS,
        receptionist:      USER_SELF_FIELDS,
        lab_technician:    USER_SELF_FIELDS,

        // Super/platform admin using org context → unrestricted
        superAdmin:        ["*"],
        platform_admin:    ["*"],
    },
};
