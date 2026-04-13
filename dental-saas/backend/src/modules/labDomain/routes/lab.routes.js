/**
 * lab.routes.js — Lab Domain Routes
 *
 * GUARD CHAIN:
 *   orgProtect → requireEntitlement("lab") → requireOrgPermission(P.LAB_*)
 *
 * PLANE: Org only. Per-org DB via req.dbConnection.
 *
 * Route map:
 *   GET  /org/labs                          → list lab partners
 *   POST /org/labs                          → create lab partner
 *   GET  /org/labs/:id                      → get lab partner
 *   PUT  /org/labs/:id                      → update lab partner
 *
 *   GET  /org/lab-cases/dashboard           → KPI dashboard
 *   GET  /org/lab-cases/kanban              → Kanban board
 *   GET  /org/lab-cases/priority            → priority monitoring
 *   GET  /org/lab-cases                     → case list (paginated)
 *   POST /org/lab-cases                     → create case
 *   GET  /org/lab-cases/:id                 → case detail
 *   PATCH /org/lab-cases/:id/status         → FSM transition
 *   GET  /org/lab-cases/:id/messages        → chat history
 *   POST /org/lab-cases/:id/messages        → post message
 *
 *   GET  /org/lab-claims                    → claims list
 *   POST /org/lab-claims                    → create claim
 *   PATCH /org/lab-claims/:id/approve       → approve claim
 *   PATCH /org/lab-claims/:id/paid          → mark paid
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect           = require("@middleware/orgProtect");
const requireEntitlement   = require("../../../middleware/requireEntitlement");
const requireOrgPermission = require("../../../middleware/requireOrgPermission");
const { P }                = require("../../../rbac/orgPermissions");
const ctrl                 = require("../controllers/lab.controller");

// ── Guard chains ──────────────────────────────────────────────────────────────
const canRead   = [orgProtect, requireEntitlement("lab"), requireOrgPermission(P.LAB_READ)];
const canCreate = [orgProtect, requireEntitlement("lab"), requireOrgPermission(P.LAB_CREATE)];
const canUpdate = [orgProtect, requireEntitlement("lab"), requireOrgPermission(P.LAB_UPDATE)];

// ─────────────────────────────────────────────────────────────────────────────
// This file exports TWO routers — mounted separately to avoid conflict
// between /labs and /lab-cases path prefixes:
//
//   partnerRouter  → mounted at /labs
//   caseRouter     → mounted at /lab-cases
//   claimRouter    → mounted at /lab-claims
//
// The featureRegistry uses a wrapper routeFactory that mounts all three.
// ─────────────────────────────────────────────────────────────────────────────

// ── Lab Partner Router ────────────────────────────────────────────────────────
const partnerRouter = express.Router();
partnerRouter.get( "/",    ...canRead,   ctrl.listPartners);
partnerRouter.post("/",    ...canCreate, ctrl.createPartner);
partnerRouter.get( "/:id", ...canRead,   ctrl.getPartner);
partnerRouter.put( "/:id", ...canUpdate, ctrl.updatePartner);

// ── Lab Case Router ───────────────────────────────────────────────────────────
const caseRouter = express.Router();
// Static sub-routes BEFORE /:id
caseRouter.get("/dashboard",  ...canRead, ctrl.getDashboard);
caseRouter.get("/kanban",     ...canRead, ctrl.getCasesKanban);
caseRouter.get("/priority",   ...canRead, ctrl.getPriorityCases);

caseRouter.get( "/",    ...canRead,   ctrl.listCases);
caseRouter.post("/",    ...canCreate, ctrl.createCase);
caseRouter.get( "/:id", ...canRead,   ctrl.getCase);
caseRouter.patch("/:id/status", ...canUpdate, ctrl.updateCaseStatus);

// Messages sub-routes
caseRouter.get( "/:id/messages", ...canRead,   ctrl.getMessages);
caseRouter.post("/:id/messages", ...canCreate, ctrl.postMessage);

// ── Lab Claim Router ──────────────────────────────────────────────────────────
const claimRouter = express.Router();
claimRouter.get( "/",              ...canRead,   ctrl.listClaims);
claimRouter.post("/",              ...canCreate, ctrl.createClaim);
claimRouter.patch("/:id/approve",  ...canUpdate, ctrl.approveClaim);
claimRouter.patch("/:id/paid",     ...canUpdate, ctrl.markClaimPaid);

/**
 * Combined router factory — mounts all three sub-routers under a wrapper.
 * Used by featureRegistry routeFactory.
 */
function createLabRouter() {
    const root = express.Router();
    root.use("/labs",       partnerRouter);
    root.use("/lab-cases",  caseRouter);
    root.use("/lab-claims", claimRouter);
    return root;
}

module.exports = { createLabRouter, partnerRouter, caseRouter, claimRouter };
