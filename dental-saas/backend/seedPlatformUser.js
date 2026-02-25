const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const PlatformUser = require("./models/PlatformUser");

async function seed() {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await PlatformUser.findOne({
        email: "superadmin@test.com"
    });

    if (existing) {
        console.log("Superadmin already exists");
        process.exit();
    }

    const hashedPassword = await bcrypt.hash("123456", 10);

    await PlatformUser.create({
        name: "Super Admin",
        email: "superadmin@test.com",
        password: hashedPassword,
        role: "superadmin",
        permissions: [],
        isActive: true
    });

    console.log("✅ Superadmin created");
    process.exit();
}

seed();