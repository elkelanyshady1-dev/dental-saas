const Patient = require("../models/Patient");
const Branch = require("../models/Branch");
const softDelete = require("../utils/softDelete");
const storageService = require("../services/storageService");
const patientService = require("../services/domain/patientService");

// ─── GET all patients (org-level, search + pagination) ────
exports.getPatients = async (req, res) => {
    try {
        const { search, page, limit } = req.query;
        const result = await patientService.getPatients(req, search, page, limit);

        res.json({
            success: true,
            data: result.patients,
            pagination: result.pagination,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── GET single patient ──────────────────────────────────
exports.getPatient = async (req, res) => {
    try {
        const patient = await Patient.findOne({
            _id: req.params.id,
            organizationId: req.organizationId,
        }).populate("firstVisitBranchId", "name");

        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }

        res.json({ data: patient });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── CREATE patient ──────────────────────────────────────
exports.createPatient = async (req, res) => {
    try {
        const {
            firstName, middleName, lastName,
            phone, secondaryPhone, email,
            gender, dateOfBirth, address, nationality,
            nationalId, maritalStatus, job,
            firstVisitBranchId,
        } = req.body;

        if (!firstName || !lastName || !phone || !firstVisitBranchId) {
            return res.status(400).json({
                message: "firstName, lastName, phone, and firstVisitBranchId are required",
            });
        }

        // Validate branch exists + belongs to org
        const branch = await Branch.findOne({
            _id: firstVisitBranchId,
            organizationId: req.organizationId,
        });

        if (!branch) {
            return res.status(404).json({ message: "Branch not found" });
        }

        const patient = new Patient({
            firstName,
            middleName: middleName || "",
            lastName,
            phone,
            secondaryPhone: secondaryPhone || undefined,
            email: email || undefined,
            gender: gender || undefined,
            dateOfBirth: dateOfBirth || undefined,
            address: address || undefined,
            nationality: nationality || undefined,
            nationalId: nationalId || undefined,
            maritalStatus: maritalStatus || undefined,
            job: job || undefined,
            firstVisitBranchId,
            organizationId: req.organizationId,
        });

        // Photo from multer upload
        if (req.file) {
            patient.photo = storageService.getRelativePath("patients", req.file.filename);
        }

        await patient.save();

        res.status(201).json({
            success: true,
            message: "Patient created",
            data: patient,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── UPDATE patient ──────────────────────────────────────
exports.updatePatient = async (req, res) => {
    try {
        const patient = await Patient.findOne({
            _id: req.params.id,
            organizationId: req.organizationId,
        });

        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }

        // Strip organizationId — never trust client
        delete req.body.organizationId;

        // If changing firstVisitBranchId, validate it
        if (req.body.firstVisitBranchId) {
            const branch = await Branch.findOne({
                _id: req.body.firstVisitBranchId,
                organizationId: req.organizationId,
            });

            if (!branch) {
                return res.status(404).json({ message: "Branch not found" });
            }
        }

        // Photo from multer upload
        if (req.file) {
            // Delete old photo if exists
            if (patient.photo) {
                await storageService.delete(patient.photo);
            }
            req.body.photo = storageService.getRelativePath("patients", req.file.filename);
        }

        Object.assign(patient, req.body);
        await patient.save();

        res.json({
            success: true,
            message: "Patient updated",
            data: patient,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── DELETE patient ──────────────────────────────────────
exports.deletePatient = async (req, res) => {
    try {
        await softDelete(Patient, req.params.id, req.organizationId);
        res.json({ success: true, message: "Patient deleted (soft)" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── UPLOAD photo for existing patient ───────────────────
exports.uploadPhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const patient = await Patient.findOne({
            _id: req.params.id,
            organizationId: req.organizationId,
        });

        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }

        patient.photo = storageService.getRelativePath("patients", req.file.filename);
        await patient.save();

        res.json({
            success: true,
            message: "Photo uploaded",
            data: { photo: patient.photo },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
