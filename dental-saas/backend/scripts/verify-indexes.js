require("module-alias/register");
"use strict";
const mongoose = require("mongoose");
const Patient = require("../src/modules/patientDomain/core/patient.model");
const PatientInvoice = require("../src/modules/financialDomain/models/patientInvoice.model");
const Appointment = require("../src/modules/appointmentDomain/models/appointment.model");
const DoctorInvoice = require("../src/modules/alignerProductionDomain/models/doctorInvoice.model");
const { ClinicalCase } = require("../src/modules/clinicalProtocolDomain/models/SCPEModels");

async function checkIndexes() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dental_saas_db");
    const models = [
        { name: "Patient", model: Patient },
        { name: "PatientInvoice", model: PatientInvoice },
        { name: "Appointment", model: Appointment },
        { name: "DoctorInvoice", model: DoctorInvoice },
        { name: "ClinicalCase", model: ClinicalCase }
    ];

    console.log("Model | Index Keys | Unique | Multi-Tenant Safe (Yes/No)");
    console.log("---|---|---|---");

    for (const { name, model } of models) {
        try {
            const indexes = await model.collection.indexes();
            // find the relevant unique index
            let targetIndex = null;
            if (name === "Patient") targetIndex = indexes.find(i => i.key.patientCode);
            if (name === "PatientInvoice") targetIndex = indexes.find(i => i.key.invoiceNumber);
            if (name === "Appointment") targetIndex = indexes.find(i => i.key.externalRequestId);
            if (name === "DoctorInvoice") targetIndex = indexes.find(i => i.key.invoiceNumber);
            if (name === "ClinicalCase") targetIndex = indexes.find(i => i.key.caseNumber);

            if (targetIndex) {
                const keys = Object.keys(targetIndex.key).join(", ");
                const isUnique = targetIndex.unique ? "Yes" : "No";
                const isMTSafe = targetIndex.key.organizationId === 1 ? "Yes" : "No";
                console.log(`${name} | { ${keys} } | ${isUnique} | ${isMTSafe}`);
            } else {
                console.log(`${name} | Not Found | - | -`);
            }
        } catch (err) {
            console.log(`${name} | Error matching mapping | - | -`);
        }
    }
    await mongoose.disconnect();
}
checkIndexes().catch(console.error);
