const PlatformNotification = require("../platform/models/PlatformNotification").default;

exports.getNotifications = async (req, res) => {
    try {
        const notifications = await PlatformNotification.find()
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('organizationId', 'name slug')
            .lean();

        // Attach a computed 'isRead' flag based on the current user
        const mapped = notifications.map(notif => ({
            ...notif,
            isRead: notif.readBy.some(id => id.toString() === req.user.id)
        }));

        res.json(mapped);
    } catch (err) {
        console.error("Error fetching platform notifications:", err);
        res.status(500).json({ message: "Server error fetching notifications" });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await PlatformNotification.findByIdAndUpdate(id, {
            $addToSet: { readBy: req.user.id }
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Error marking notification read:", err);
        res.status(500).json({ message: "Server error marking notification read" });
    }
};

exports.markAllRead = async (req, res) => {
    try {
        await PlatformNotification.updateMany(
            { readBy: { $ne: req.user.id } },
            { $addToSet: { readBy: req.user.id } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Error marking all notifications read:", err);
        res.status(500).json({ message: "Server error marking all notifications read" });
    }
};
