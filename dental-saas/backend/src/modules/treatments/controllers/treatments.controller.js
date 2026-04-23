/**
 * treatments.controller.js
 * Phase 3 — Clinical Operations: Treatment Controller
 */

"use strict";

const treatmentService = require("../services/treatments.service");
const logger = require("@utils/logger");
const {
  authorize
} = require("../../../utils/authorize");

// ─── Treatment CRUD ──────────────────────────────────────────────────────────

async function createTreatment(req, res) {
  try {
    authorize(req, "treatments.create");
    const treatment = await treatmentService.createTreatment({
      branchId: req.body.branchId || req.context.branchId,
      data: req.body,
      userId: req.context.userId
    });
    return res.status(201).json({
      success: true,
      data: treatment
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "CREATE_ERROR",
        message: err.message
      }
    });
  }
}
async function listTreatments(req, res) {
  try {
    authorize(req, "treatments.read");
    const {
      patientId,
      appointmentId,
      status,
      branchId,
      treatmentPlanId,
      page = 1,
      limit = 50
    } = req.query;
    const result = await treatmentService.listTreatments({
      filters: {
        patientId,
        appointmentId,
        status,
        branchId,
        treatmentPlanId
      },
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100)
    });
    return res.json({
      success: true,
      data: result.treatments,
      pagination: result.pagination
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "LIST_ERROR",
        message: err.message
      }
    });
  }
}
async function getTreatment(req, res) {
  try {
    authorize(req, "treatments.read");
    const treatment = await treatmentService.getTreatmentById({
      treatmentId: req.params.id
    });
    return res.json({
      success: true,
      data: treatment
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "GET_ERROR",
        message: err.message
      }
    });
  }
}
async function updateTreatmentStatus(req, res) {
  try {
    authorize(req, "treatments.update");
    const {
      status,
      notes
    } = req.body;
    if (!status) return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "status is required"
      }
    });
    const treatment = await treatmentService.updateTreatmentStatus({
      treatmentId: req.params.id,
      newStatus: status,
      userId: req.context.userId,
      notes
    });
    return res.json({
      success: true,
      data: treatment
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "STATUS_ERROR",
        message: err.message
      }
    });
  }
}

// ─── Treatment Plan CRUD ─────────────────────────────────────────────────────

async function createTreatmentPlan(req, res) {
  try {
    authorize(req, "treatments.create");
    const plan = await treatmentService.createTreatmentPlan({
      branchId: req.body.branchId || req.context.branchId,
      data: req.body,
      userId: req.context.userId
    });
    return res.status(201).json({
      success: true,
      data: plan
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "CREATE_ERROR",
        message: err.message
      }
    });
  }
}
async function listTreatmentPlans(req, res) {
  try {
    authorize(req, "treatments.read");
    const {
      patientId,
      status,
      page = 1,
      limit = 20
    } = req.query;
    const result = await treatmentService.listTreatmentPlans({
      filters: {
        patientId,
        status
      },
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50)
    });
    return res.json({
      success: true,
      data: result.plans,
      pagination: result.pagination
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "LIST_ERROR",
        message: err.message
      }
    });
  }
}
async function getTreatmentPlan(req, res) {
  try {
    authorize(req, "treatments.read");
    const plan = await treatmentService.getTreatmentPlanById({
      planId: req.params.id
    });
    return res.json({
      success: true,
      data: plan
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: "GET_ERROR",
        message: err.message
      }
    });
  }
}
module.exports = {
  createTreatment,
  listTreatments,
  getTreatment,
  updateTreatmentStatus,
  createTreatmentPlan,
  listTreatmentPlans,
  getTreatmentPlan
};