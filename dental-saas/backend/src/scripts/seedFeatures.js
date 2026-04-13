const mongoose = require("mongoose");
const FeatureDefinition = require("../shared/models/FeatureDefinition").default;

mongoose.connect("mongodb://127.0.0.1:27017/saasdental");

async function seed() {
    await FeatureDefinition.deleteMany({});

    await FeatureDefinition.insertMany([
        {
            key: "orthoModule",
            name: "Orthodontic Module",
            category: "clinical",
            defaultEnabled: false,
            isCore: false,
            allowedPlans: ["Pro", "Enterprise"],
            allowedRoles: ["admin", "dentist"],
        },
        {
            key: "inventoryModule",
            name: "Inventory Module",
            category: "admin",
            defaultEnabled: true,
            isCore: false,
            allowedPlans: ["Basic", "Pro", "Enterprise"],
            allowedRoles: ["admin"],
        },
        {
            key: "insuranceModule",
            name: "Insurance Module",
            category: "financial",
            defaultEnabled: false,
            isCore: false,
            allowedPlans: ["Pro", "Enterprise"],
            allowedRoles: ["admin", "secretary"],
        },
    ]);

    console.log("Features seeded");
    process.exit();
}

seed();