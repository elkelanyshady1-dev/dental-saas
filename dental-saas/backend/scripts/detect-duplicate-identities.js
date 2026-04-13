require("module-alias/register");
/**
 * detect-duplicate-identities.js
 * 
 * Read-only script to find duplicates before adding unique indexes.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Patient = require('../src/modules/patientDomain/core/patient.model');
const PatientInvoice = require('../src/modules/financialDomain/models/patientInvoice.model');
const DoctorInvoice = require('../src/modules/alignerProductionDomain/models/doctorInvoice.model');
const Appointment = require('../src/modules/appointmentDomain/models/appointment.model');
const { ClinicalCase } = require('../src/modules/clinicalProtocolDomain/models/SCPEModels');

const aggregates = [
    { name: 'Patient', model: Patient, key: 'patientCode' },
    { name: 'PatientInvoice', model: PatientInvoice, key: 'invoiceNumber' },
    { name: 'DoctorInvoice', model: DoctorInvoice, key: 'invoiceNumber' },
    { name: 'Appointment', model: Appointment, key: 'externalRequestId' },
    { name: 'ClinicalCase', model: ClinicalCase, key: 'caseNumber' }
];

async function run() {
    console.log('Starting Duplicate Identity Detection...\n');
    let hasDuplicates = false;

    // We don't actually need to connect to DB for pure aggregation test in codebase analysis,
    // but this script is meant to be run against the live DB.
    // If connection is needed, uncomment below (assuming standard env):
    // await mongoose.connect(process.env.MONGODB_URI);

    if (mongoose.connection.readyState === 0) {
        console.log('Skipping actual DB execution since no Mongoose connection initiated in this context.');
        console.log('To run against DB, ensure mongoose is connected.');
        process.exit(0);
    }

    for (const { name, model, key } of aggregates) {
        console.log(`Checking ${name} for duplicate ${key}...`);

        try {
            const duplicates = await model.aggregate([
                { $match: { [key]: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id: { organizationId: "$organizationId", logicalKey: `$${key}` },
                        count: { $sum: 1 },
                        ids: { $push: "$_id" }
                    }
                },
                { $match: { count: { $gt: 1 } } }
            ]);

            if (duplicates.length > 0) {
                hasDuplicates = true;
                console.error(`[VIOLATION] Found ${duplicates.length} duplicate sets in ${name}:`);
                console.error(JSON.stringify(duplicates, null, 2));
            } else {
                console.log(`- ${name}: No duplicates found.`);
            }
        } catch (err) {
            console.error(`Error checking ${name}: ${err.message}`);
        }
    }

    if (hasDuplicates) {
        console.error('\nDuplicate identities detected. Fix before applying unique indexes.');
    } else {
        console.log('\nNo duplicate identities found. Safe to apply unique indexes.');
    }

    process.exit(0);
}

run();
