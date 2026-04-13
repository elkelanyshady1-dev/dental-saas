/**
 * index.js — Features Control Center Barrel Export
 *
 * Re-exports all services, controllers, validators, and routes
 * for the Features & Modules Control Center.
 *
 * Usage:
 *   const fcc = require("../organization/featuresControl");
 *   const { modulesService, conflictService } = fcc.services;
 *
 * PLANE: Org only.
 */

"use strict";

// ─── Services ───────────────────────────────────────────────────────────────

const modulesService     = require("./services/modules.service");
const featuresService    = require("./services/features.service");
const permissionsService = require("./services/permissions.service");
const conflictService    = require("./services/conflictEngine.service");
const inspectorService   = require("./services/inspector.service");

// ─── Controllers ────────────────────────────────────────────────────────────

const modulesController     = require("./controllers/modules.controller");
const featuresController    = require("./controllers/features.controller");
const permissionsController = require("./controllers/permissions.controller");
const conflictsController   = require("./controllers/conflicts.controller");
const inspectorController   = require("./controllers/inspector.controller");

// ─── Routes ─────────────────────────────────────────────────────────────────

const routes = require("./featuresControl.routes");

// ─── Validators ─────────────────────────────────────────────────────────────

const validators = require("./validators/featuresControl.validators");

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    routes,
    validators,
    services: {
        modulesService,
        featuresService,
        permissionsService,
        conflictService,
        inspectorService,
    },
    controllers: {
        modulesController,
        featuresController,
        permissionsController,
        conflictsController,
        inspectorController,
    },
};
