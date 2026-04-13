const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

// Load backend env
dotenv.config({ path: path.join(__dirname, "backend", ".env") });

const Organization = require("./backend/src/models/Organization");
const Branch = require("./backend/src/models/Branch");
const User = require("./backend/src/models/User");

async function investigate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const primeCare = await Organization.findOne({ name: "PrimeCare" });
        if (!primeCare) {
            console.log("ORGANIZATION 'PrimeCare' NOT FOUND");
            return;
        }

        console.log("PRIMECARE ORG:");
        console.log("  organizationId:", primeCare._id);
        console.log("  createdAt:", primeCare.createdAt);

        const branches = await Branch.find({ organizationId: primeCare._id });
        console.log("\nPRIMECARE BRANCHES:");
        console.log("  Count:", branches.length);
        branches.forEach((b, i) => {
            console.log(`  Branch ${i + 1}:`);
            console.log("    _id:", b._id);
            console.log("    name:", b.name);
            console.log("    isActive:", b.isActive);
        });

        const users = await User.find({ organizationId: primeCare._id });
        console.log("\nPRIMECARE USERS:");
        users.forEach((u, i) => {
            console.log(`  User ${i + 1}:`);
            console.log("    _id:", u._id);
            console.log("    name:", u.name);
            console.log("    email:", u.email);
            console.log("    branchAccess:", u.branchAccess);
            console.log("    hasFullBranchAccess:", u.hasFullBranchAccess);
        });

    } catch (err) {
        console.error("Investigation failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

investigate();
