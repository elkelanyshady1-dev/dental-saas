require("module-alias/register");
"use strict";
require("dotenv").config();
const mongoose = require("mongoose");
const Patient = require("../src/modules/patientDomain/core/patient.model");
const PatientAggregateService = require("../src/modules/patientDomain/core/patient.aggregate.service");
const VersionConflictError = require("../src/errors/VersionConflictError");

async function runSimulation() {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/dental-saas");
    console.log("[Simulation] Connected to DB");

    console.log("[Simulation] 1. Fetching an existing patient...");
    let dbPatient = await Patient.findOne({});
    if (!dbPatient) {
        console.error("❌ No active patients found in DB. Please seed the DB first.");
        process.exit(1);
    }

    // Ensure version exists properly in MongoDB, since legacy docs might 
    // lack the field. Mongoose hydrates default 0 in memory but querying misses it.
    console.log("[Simulation] Forcing version to 0 in raw DB for legacy records...");
    await mongoose.connection.collection("patients").updateOne(
        { _id: new mongoose.Types.ObjectId(dbPatient._id) },
        { $set: { version: 0 } }
    );
    let currentVer = 0;

    const patientId = dbPatient._id;
    const organizationId = dbPatient.organizationId;
    console.log(`[Simulation] Patient found: ${patientId}. Current Version: ${currentVer}`);

    console.log("[Simulation] 2. User A fetches patient (v" + currentVer + ")");
    const userAView = currentVer;

    console.log("[Simulation] 3. User B fetches patient (v" + currentVer + ")");
    const userBView = currentVer;

    console.log("[Simulation] 4. User A updates status (submits expectedVersion: " + userAView + ")");

    // Debug document state right before update
    const docBefore = await Patient.findOne({ _id: patientId, organizationId });
    console.log("Doc Before: _id=", docBefore._id, "orgId=", docBefore.organizationId, "version=", docBefore.version);

    await PatientAggregateService.changeStatus({
        organizationId,
        patientId,
        actorId: dbPatient.organizationId, // dummy actor
        isActive: false, // flip
        expectedVersion: userAView
    });

    const dbPatientAfterA = await Patient.findById(patientId);
    console.log(`[Simulation] User A update complete. New Version: ${dbPatientAfterA.version}`);

    console.log("[Simulation] 5. User B attempts stale update (submits expectedVersion: " + userBView + ")");
    try {
        await PatientAggregateService.changeStatus({
            organizationId,
            patientId,
            actorId: dbPatient.organizationId,
            isActive: true,
            expectedVersion: userBView
        });
        console.error("❌ FAILURE: User B's update should have been blocked!");
        process.exit(1);
    } catch (error) {
        if (error instanceof VersionConflictError || error.name === "VersionConflictError" || error.code === "VERSION_CONFLICT") {
            console.log(`[Simulation] ✅ SUCCESS: Caught expected VERSION_CONFLICT error: "${error.message}"`);
        } else {
            console.error("❌ FAILURE: Caught unexpected error", error);
            process.exit(1);
        }
    }

    console.log("[Simulation] Simulation completed successfully.");
    process.exit(0);
}

runSimulation().catch(err => {
    console.error(err);
    process.exit(1);
});
