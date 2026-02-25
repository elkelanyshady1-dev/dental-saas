const Organization = require("../models/Organization");
const Branch = require("../models/Branch");
const User = require("../models/User");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");

exports.getPlatformAnalytics = async (req, res) => {
    try {
        // Today's start to calculate "growth" / new items today
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const [
            totalOrganizations,
            activeOrganizations,
            newOrganizationsToday,

            totalBranches,

            totalUsers,

            totalPatients,

            totalAppointments
        ] = await Promise.all([
            Organization.countDocuments(),
            Organization.countDocuments({ isActive: true, "subscription.status": "active" }),
            Organization.countDocuments({ createdAt: { $gte: startOfToday } }),

            Branch.countDocuments(),

            User.countDocuments({ isActive: true }), // Org users only (PlatformUsers are tracked differently)

            Patient.countDocuments(),

            Appointment.countDocuments()
        ]);

        // Build a structured response
        res.json({
            totals: {
                organizations: totalOrganizations,
                activeOrganizations: activeOrganizations,
                branches: totalBranches,
                users: totalUsers,
                patients: totalPatients,
                appointments: totalAppointments
            },
            growth: {
                newOrganizationsToday
            },
            systemHealth: {
                status: "operational",
                dbConnected: true,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getLatestEvents = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        const events = await AuditLog.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("organizationId", "name slug")
            .populate("actorId", "name email role") // Note: actorId could be platform_user (PlatformUser) or tenant_user (User). 
            // Better to keep it simple as per instructions.
            .lean();

        res.json({
            success: true,
            data: events
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
