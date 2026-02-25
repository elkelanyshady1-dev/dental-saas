const Family = require("../models/Family");
const FamilyMember = require("../models/FamilyMember");
const Patient = require("../models/Patient");
const softDelete = require("../utils/softDelete");

// ─── ASSIGN patient to family (with auto-creation + suggestion) ──
exports.assignFamily = async (req, res) => {
    try {
        const patientId = req.params.id;
        const { familyName, familyId, relation, isHead, confirm, type } = req.body;

        if (!relation) {
            return res.status(400).json({ message: "relation is required" });
        }

        // Validate patient belongs to org
        const patient = await Patient.findOne({
            _id: patientId,
            organizationId: req.organizationId,
        });

        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }

        // ── CASE 1: Confirm linking to existing family ──
        if (familyId && confirm) {
            const family = await Family.findOne({
                _id: familyId,
                organizationId: req.organizationId,
            });

            if (!family) {
                return res.status(404).json({ message: "Family not found" });
            }

            // Head uniqueness — clear existing head atomically
            if (isHead) {
                await FamilyMember.updateMany(
                    { organizationId: req.organizationId, familyId: family._id },
                    { isHead: false }
                );
            }

            // Check if already a member
            const existing = await FamilyMember.findOne({
                organizationId: req.organizationId,
                familyId: family._id,
                patientId,
            });

            if (existing) {
                return res.status(400).json({
                    message: "Patient is already a member of this family",
                });
            }

            const member = await FamilyMember.create({
                organizationId: req.organizationId,
                familyId: family._id,
                patientId,
                relation,
                isHead: isHead || false,
            });

            return res.status(201).json({
                message: "Patient added to family",
                data: member,
            });
        }

        // ── CASE 2: Search by familyName ──
        if (!familyName) {
            return res.status(400).json({
                message: "familyName or (familyId + confirm) is required",
            });
        }

        const normalized = familyName.toLowerCase();

        // Check if family exists
        const existingFamily = await Family.findOne({
            organizationId: req.organizationId,
            normalizedFamilyName: normalized,
        });

        if (existingFamily && !confirm) {
            // Return suggestion with preview of members
            const members = await FamilyMember.find({
                organizationId: req.organizationId,
                familyId: existingFamily._id,
            }).populate("patientId", "firstName middleName lastName");

            return res.json({
                suggestion: true,
                familyId: existingFamily._id,
                familyName: existingFamily.familyName,
                members: members.map((m) => ({
                    name: [m.patientId?.firstName, m.patientId?.middleName, m.patientId?.lastName]
                        .filter(Boolean)
                        .join(" "),
                    relation: m.relation,
                    isHead: m.isHead,
                })),
            });
        }

        // ── CASE 3: Auto-create new family ──
        let family = existingFamily;
        if (!family) {
            family = await Family.create({
                organizationId: req.organizationId,
                familyName,
                type: type || "household",
            });
        }

        // Head uniqueness — clear existing head atomically
        if (isHead) {
            await FamilyMember.updateMany(
                { organizationId: req.organizationId, familyId: family._id },
                { isHead: false }
            );
        }

        // Check if already a member
        const alreadyMember = await FamilyMember.findOne({
            organizationId: req.organizationId,
            familyId: family._id,
            patientId,
        });

        if (alreadyMember) {
            return res.status(400).json({
                message: "Patient is already a member of this family",
            });
        }

        const member = await FamilyMember.create({
            organizationId: req.organizationId,
            familyId: family._id,
            patientId,
            relation,
            isHead: isHead || false,
        });

        res.status(201).json({
            message: family === existingFamily
                ? "Patient added to existing family"
                : "Family created and patient added",
            data: {
                family: {
                    _id: family._id,
                    familyName: family.familyName,
                    type: family.type,
                },
                member,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── GET family members ──────────────────────────────────
exports.getFamilyMembers = async (req, res) => {
    try {
        const family = await Family.findOne({
            _id: req.params.id,
            organizationId: req.organizationId,
        });

        if (!family) {
            return res.status(404).json({ message: "Family not found" });
        }

        const members = await FamilyMember.find({
            organizationId: req.organizationId,
            familyId: family._id,
        }).populate("patientId", "firstName middleName lastName phone");

        res.json({
            data: {
                family: {
                    _id: family._id,
                    familyName: family.familyName,
                    type: family.type,
                },
                members: members.map((m) => ({
                    _id: m._id,
                    patientId: m.patientId?._id,
                    firstName: m.patientId?.firstName,
                    middleName: m.patientId?.middleName,
                    lastName: m.patientId?.lastName,
                    phone: m.patientId?.phone,
                    relation: m.relation,
                    isHead: m.isHead,
                })),
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── GET patient families ────────────────────────────────
exports.getPatientFamilies = async (req, res) => {
    try {
        const patient = await Patient.findOne({
            _id: req.params.id,
            organizationId: req.organizationId,
        });

        if (!patient) {
            return res.status(404).json({ message: "Patient not found" });
        }

        const memberships = await FamilyMember.find({
            organizationId: req.organizationId,
            patientId: patient._id,
        }).populate("familyId", "familyName type");

        res.json({
            data: memberships.map((m) => ({
                familyId: m.familyId?._id,
                familyName: m.familyId?.familyName,
                type: m.familyId?.type,
                relation: m.relation,
                isHead: m.isHead,
            })),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── REMOVE family member ────────────────────────────────
exports.removeFamilyMember = async (req, res) => {
    try {
        await softDelete(FamilyMember, req.params.memberId, req.organizationId);
        res.json({ success: true, message: "Family member removed (soft)" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
