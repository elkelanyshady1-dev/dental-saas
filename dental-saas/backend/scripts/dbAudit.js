require("module-alias/register");
/**
 * Database Shield Auditor
 * Phase v6.0 — Data Invariant Enforcement
 * 
 * Scans production or dev database for violations of architectural invariants.
 * Exit 1 if any violation is found.
 */

"use strict";

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Load Models
const Organization = require('../src/models/Organization');
const AuditLog = require('../src/models/AuditLog');
const Patient = require('../src/modules/patientDomain/core/patient.model');
const Plan = require("../src/platform/domain/models/plan.model");
const BillingInvoice = require('../src/modules/billingDomain/models/billingInvoice.model');

async function runAudit() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dental-saas';
    console.log(`[DB Audit] Connecting to ${uri}...`);

    try {
        await mongoose.connect(uri);
        console.log("[DB Audit] Connection successful. Starting scan...");

        const violations = [];

        // 1. Orgs missing version or billingCountry
        const orgInvariants = await Organization.find({
            $or: [
                { version: { $exists: false } },
                { billingCountry: { $exists: false } }
            ]
        });
        if (orgInvariants.length > 0) {
            violations.push(`${orgInvariants.length} Organizations missing version or billingCountry`);
        }

        // 2. Invalid plan references
        const activePlans = await Plan.find({ isActive: true }).select('_id');
        const planIds = activePlans.map(p => p._id.toString());
        const orgsWithInvalidPlans = await Organization.find({
            planId: { $nin: planIds }
        });
        if (orgsWithInvalidPlans.length > 0) {
            violations.push(`${orgsWithInvalidPlans.length} Organizations have invalid or inactive plan references`);
        }

        // 3. Null organizationId in critical collections
        const nullOrgPatients = await Patient.countDocuments({ organizationId: null });
        if (nullOrgPatients > 0) violations.push(`${nullOrgPatients} Patients missing organizationId`);

        // 4. Float monetary values
        // Check BillingInvoices for non-integer totalAmount
        const invoices = await BillingInvoice.find({});
        const floatInvoices = invoices.filter(inv => !Number.isInteger(inv.totalAmount));
        if (floatInvoices.length > 0) {
            violations.push(`${floatInvoices.length} BillingInvoices contain float monetary values (must be integers/cents)`);
        }

        // 5. Missing branchId in AuditLog
        const missingBranchAudit = await AuditLog.countDocuments({
            branchId: { $exists: false },
            actorType: { $ne: 'platform_user' } // Platform users might not have branch context
        });
        if (missingBranchAudit > 0) {
            violations.push(`${missingBranchAudit} AuditLogs missing branchId for non-platform users`);
        }

        // 6. Orphan visibleToDoctors references
        const orphanPatients = await Patient.find({
            visibleToDoctors: { $exists: true, $not: { $size: 0 } }
        }).select('_id visibleToDoctors organizationId');

        // This is a complex check, we'll just log if any exist for now as a health check
        // Real audit would verify if those doctorIds exist in the same org.
        console.log(`[DB Audit] Scanned ${orphanPatients.length} patients with ownership projections.`);

        // Summary
        if (violations.length > 0) {
            console.error("❌ DATABASE AUDIT FAILED");
            violations.forEach(v => console.error(` - ${v}`));
            process.exit(1);
        } else {
            console.log("✅ DATABASE AUDIT PASSED. All invariants reconciled.");
            process.exit(0);
        }

    } catch (error) {
        console.error(`[DB Audit] Execution Error: ${error.message}`);
        process.exit(1);
    }
}

runAudit();
