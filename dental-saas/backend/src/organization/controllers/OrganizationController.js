const getModel = require("@core/db/getModel");
const Organization = require("../../shared/models/Organization").default;
const OrgSettingsDef = require("../models/OrganizationSettings");

// ── Secure Model Instances ─────────────────────────────────────────────────

exports.createOrganization = async (req, res) => {
    try {
        const { name } = req.body;

        const organization = await Organization.create({
            name,
            ownerId: req.user._id,
        });

        res.status(201).json({
            message: "Organization created",
            organization,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 UPDATE appointment settings (slotDuration + workingHours)
exports.updateAppointmentSettings = async (req, res) => {
    try {
        const { slotDuration, workingHours } = req.body;

        // Per-org DB: connection-scoped isolation
        const org = await Organization.findById(req.organizationId);
        if (!org) {
            return res.status(404).json({ message: "Organization not found" });
        }

        // Validate slotDuration
        if (slotDuration !== undefined) {
            const allowed = [15, 30, 45, 60];
            if (!allowed.includes(slotDuration)) {
                return res.status(400).json({
                    message: `slotDuration must be one of: ${allowed.join(", ")}`,
                });
            }
            org.appointmentSettings.slotDuration = slotDuration;
        }

        // Validate working hours format
        if (workingHours) {
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
            if (workingHours.start && !timeRegex.test(workingHours.start)) {
                return res.status(400).json({ message: "Invalid workingHours.start format (HH:MM)" });
            }
            if (workingHours.end && !timeRegex.test(workingHours.end)) {
                return res.status(400).json({ message: "Invalid workingHours.end format (HH:MM)" });
            }
            if (workingHours.start) org.appointmentSettings.workingHours.start = workingHours.start;
            if (workingHours.end) org.appointmentSettings.workingHours.end = workingHours.end;

            // Validate start < end (compare as minutes)
            const toMins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
            const s = toMins(org.appointmentSettings.workingHours.start);
            const e = toMins(org.appointmentSettings.workingHours.end);
            if (s >= e) {
                return res.status(400).json({
                    message: "workingHours.start must be before workingHours.end",
                });
            }
        }

        await org.save();

        res.json({
            message: "Appointment settings updated",
            data: org.appointmentSettings,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 GET organization settings
exports.getOrganizationSettings = async (req, res) => {
    try {
        const OrganizationSettings = getModel(req.dbConnection, OrgSettingsDef);
        const OrgSettings = OrganizationSettings;
        // Per-org DB: no organizationId filter needed — singleton per database
        let settings = await OrgSettings.findOne({});
        if (!settings) {
            settings = await OrganizationSettings.create({});
        }
        res.status(200).json({ data: settings });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 UPDATE organization settings (Admin only)
exports.updateOrganizationSettings = async (req, res) => {
    try {
        const OrganizationSettings = getModel(req.dbConnection, OrgSettingsDef);
        const OrgSettings = OrganizationSettings;
        const { primaryColor, logo, whatsappNumber, aboutText, customDomain } = req.body;

        // Per-org DB: no organizationId filter needed — singleton per database
        let settings = await OrgSettings.findOne({});

        if (!settings) {
            settings = new OrganizationSettings({});
        }

        if (primaryColor) settings.primaryColor = primaryColor;
        if (logo) settings.logo = logo;
        if (whatsappNumber) settings.whatsappNumber = whatsappNumber;
        if (aboutText) settings.aboutText = aboutText;
        if (customDomain) settings.customDomain = customDomain;

        await settings.save();

        res.status(200).json({
            message: "Organization settings updated successfully",
            data: settings
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};