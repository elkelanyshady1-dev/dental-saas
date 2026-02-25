const mongoose = require("mongoose");
const PlatformUser = require("./models/PlatformUser");
const connectDB = require("./config/db");

require("dotenv").config();

async function migrate() {
    await connectDB();
    console.log("Migrating PlatformUser roles...");

    const adminUsers = await PlatformUser.find({ role: "admin" });
    for (const user of adminUsers) {
        user.role = "operations_admin";
        // Clear old permissions array
        user.permissions = undefined;
        await user.save({ validateModifiedOnly: true });
    }

    const supportUsers = await PlatformUser.find({ role: "support" });
    for (const user of supportUsers) {
        user.role = "analyst";
        user.permissions = undefined;
        await user.save({ validateModifiedOnly: true });
    }

    // Also clear permissions for superadmin and analyst just in case they survived
    const otherUsers = await PlatformUser.find({ role: { $in: ["superadmin", "analyst"] } });
    for (const user of otherUsers) {
        user.permissions = undefined;
        await user.save({ validateModifiedOnly: true });
    }

    console.log("Migration complete.");
    process.exit(0);
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
