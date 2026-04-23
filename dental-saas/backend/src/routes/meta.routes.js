/**
 * meta.routes.js
 * Meta endpoints — small, no-auth, idempotent helpers consumed by the frontend
 * during registration flows.
 *
 * GET /api/meta/country
 *   Returns the suggested country code for the current request, derived from
 *   the Cloudflare `cf-ipcountry` header (or the `x-country` fallback, or
 *   "EG" as the soft-launch default). The frontend pre-selects the country
 *   dropdown with this value; the user then confirms or changes it before
 *   submitting registration. The body-supplied country is authoritative;
 *   this endpoint is advisory.
 *
 * PLANE: Platform (public, no auth required)
 */

"use strict";

const express = require("express");
const router = express.Router();
const {
    getSuggestedCountry,
} = require("@platform/provisioning/clusterAssignment.service");

router.get("/country", (req, res) => {
    return res.status(200).json({
        success: true,
        suggestedCountry: getSuggestedCountry(req),
    });
});

module.exports = router;
