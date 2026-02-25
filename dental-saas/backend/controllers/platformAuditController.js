const AuditLog = require("../models/AuditLog");

exports.getAuditLogs = async (req, res) => {
    try {
        const { action, success, page = 1, limit = 50 } = req.query;

        const filter = {};

        if (action) filter.action = action;
        if (success !== undefined) {
            filter.success = success === "true";
        }

        const skip = (page - 1) * limit;

        const logs = await AuditLog.find(filter)
            .populate("userId", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await AuditLog.countDocuments(filter);

        res.json({
            logs,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};