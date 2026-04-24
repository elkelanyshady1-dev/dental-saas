/**
 * booking.policy.js — Online Booking PBAC Policies
 *
 * Covers the "booking" module (feature-registry key: booking) — patient-portal
 * slot viewing and staff-facing booking-request approval. Separate from the
 * internal `appointments` module.
 *
 * Role assignments mirror ORG_ROLE_PERMISSIONS in orgPermissions.js:
 *   org_admin  → BOOKING_READ + BOOKING_MANAGE
 *   receptionist → BOOKING_READ + BOOKING_MANAGE
 */

"use strict";

const { P } = require("../orgPermissions");
const {
    isOrgAdmin, isReceptionist,
    listOrSameBranch,
    allOf, anyOf,
} = require("../policyConditions");

module.exports = {
    [P.BOOKING_READ]: [
        { effect: "allow", description: "Org admins can read all booking slots and requests", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Receptionists can read booking data in their branch", condition: allOf(isReceptionist, listOrSameBranch), priority: 80 },
    ],

    [P.BOOKING_MANAGE]: [
        { effect: "allow", description: "Org admins can approve/reject/modify booking requests", condition: isOrgAdmin, priority: 100 },
        { effect: "allow", description: "Receptionists can manage booking requests in their branch", condition: allOf(isReceptionist, listOrSameBranch), priority: 80 },
    ],
};
