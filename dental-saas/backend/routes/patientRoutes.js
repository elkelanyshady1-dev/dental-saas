const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireFeature = require("../middleware/requireFeature");
const authorizePermission = require("../middleware/permissionMiddleware");
const upload = require("../utils/upload");

const {
    getPatients,
    getPatient,
    createPatient,
    updatePatient,
    deletePatient,
    uploadPhoto,
} = require("../controllers/patientController");

const {
    assignFamily,
    getPatientFamilies,
} = require("../controllers/familyController");

// ─── Patient CRUD (org-level, no branchScope) ────────────

router.get("/", orgProtect, organizationContext, requireFeature("patients"), authorizePermission("patients.read"), getPatients);
router.get("/:id", orgProtect, organizationContext, requireFeature("patients"), authorizePermission("patients.read"), getPatient);

router.post(
    "/",
    orgProtect,
    organizationContext,
    requireFeature("patients"),
    authorizePermission("patients.create"),
    upload.single("photo"),
    createPatient
);

router.put(
    "/:id",
    orgProtect,
    organizationContext,
    requireFeature("patients"),
    authorizePermission("patients.update"),
    upload.single("photo"),
    updatePatient
);

router.delete("/:id", orgProtect, organizationContext, requireFeature("patients"), authorizePermission("patients.delete"), deletePatient);

// ─── Photo upload ────────────────────────────────────────
router.post(
    "/:id/photo",
    orgProtect,
    organizationContext,
    requireFeature("patients"),
    authorizePermission("patients.update"),
    upload.single("photo"),
    uploadPhoto
);

// ─── Family endpoints on patient ─────────────────────────
router.post(
    "/:id/assign-family",
    orgProtect,
    organizationContext,
    requireFeature("families"),
    authorizePermission("families.create"),
    assignFamily
);

router.get(
    "/:id/families",
    orgProtect,
    organizationContext,
    requireFeature("families"),
    authorizePermission("families.read"),
    getPatientFamilies
);

module.exports = router;
