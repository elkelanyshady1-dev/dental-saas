require("module-alias/register");
"use strict";

const mongoose = require("mongoose");
const PatientInvoice = require("../src/modules/financialDomain/models/patientInvoice.model");
const PatientPayment = require("../src/modules/financialDomain/models/patientPayment.model");
const FinancialSnapshot = require("../src/modules/financialDomain/models/financialSnapshot.model");
// const PatientWallet = require("../src/modules/financialDomain/models/patientWallet.model"); // Assuming exists or placeholder
const Patient = require("../src/modules/patientDomain/core/patient.model");

/**
 * Rebuild Financial Snapshots
 * Usage: node scripts/rebuild-financial-snapshots.js
 */
async function rebuild() {
    console.log("Starting Financial Snapshot Rebuild...");

    // 1. Connect to DB (Assuming standard env or manual)
    // For this script, we assume mongoose is already connected if run via a wrapper, 
    // or we'd connect here.

    const patients = await Patient.find({}).lean();
    console.log(`Processing ${patients.length} patients...`);

    for (const patient of patients) {
        const { _id: patientId, organizationId } = patient;

        // Aggregate Invoices
        const invoiceStats = await PatientInvoice.aggregate([
            { $match: { patientId, organizationId, status: { $ne: "voided" } } },
            {
                $group: {
                    _id: "$branchId",
                    totalInvoiced: { $sum: "$totalAmount" },
                    totalTreatment: {
                        $sum: {
                            $reduce: {
                                input: "$treatments",
                                initialValue: 0,
                                in: { $add: ["$$value", "$$this.subtotal"] }
                            }
                        }
                    },
                    totalDiagnostic: {
                        $sum: {
                            $reduce: {
                                input: "$charges",
                                initialValue: 0,
                                in: { $add: ["$$value", { $cond: [{ $eq: ["$$this.type", "DIAGNOSTIC_FEE"] }, "$$this.amount", 0] }] }
                            }
                        }
                    }
                }
            }
        ]);

        // Aggregate Payments
        const paymentStats = await PatientPayment.aggregate([
            { $match: { patientId, organizationId, status: "active" } },
            {
                $group: {
                    _id: "$branchId",
                    totalPaid: { $sum: "$amount" }
                }
            }
        ]);

        // Merge Stats
        const branchMap = new Map();

        invoiceStats.forEach(stat => {
            const bid = stat._id.toString();
            branchMap.set(bid, {
                branchId: stat._id,
                totalInvoiced: stat.totalInvoiced,
                totalPaid: 0,
                totalTreatmentRevenue: stat.totalTreatment,
                totalDiagnosticRevenue: stat.totalDiagnostic,
                outstandingBalance: stat.totalInvoiced
            });
        });

        paymentStats.forEach(stat => {
            const bid = stat._id.toString();
            let data = branchMap.get(bid);
            if (!data) {
                data = {
                    branchId: stat._id,
                    totalInvoiced: 0,
                    totalPaid: 0,
                    totalTreatmentRevenue: 0,
                    totalDiagnosticRevenue: 0,
                    outstandingBalance: 0
                };
                branchMap.set(bid, data);
            }
            data.totalPaid = stat.totalPaid;
            data.outstandingBalance = Number((data.totalInvoiced - data.totalPaid).toFixed(2));
        });

        const branchBreakdown = Array.from(branchMap.values());
        const totalInvoiced = branchBreakdown.reduce((sum, b) => sum + b.totalInvoiced, 0);
        const totalPaid = branchBreakdown.reduce((sum, b) => sum + b.totalPaid, 0);
        const totalTreatmentRevenue = branchBreakdown.reduce((sum, b) => sum + b.totalTreatmentRevenue, 0);
        const totalDiagnosticRevenue = branchBreakdown.reduce((sum, b) => sum + b.totalDiagnosticRevenue, 0);

        // Update Snapshot
        await FinancialSnapshot.findOneAndUpdate(
            { organizationId, patientId },
            {
                $set: {
                    totalInvoiced: Number(totalInvoiced.toFixed(2)),
                    totalPaid: Number(totalPaid.toFixed(2)),
                    outstandingBalance: Number((totalInvoiced - totalPaid).toFixed(2)),
                    totalTreatmentRevenue: Number(totalTreatmentRevenue.toFixed(2)),
                    totalDiagnosticRevenue: Number(totalDiagnosticRevenue.toFixed(2)),
                    branchBreakdown,
                    walletBalance: 0, // Wallet logic would go here if implemented
                    version: 0,
                    lastProcessedEventAt: new Date()
                }
            },
            { upsert: true }
        );
    }

    console.log("Rebuild Complete.");
}

// Minimal runner (if run directly)
if (require.main === module) {
    // Note: In real scenarios, you'd load .env and connect mongoose here.
    // rebuild().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}

module.exports = rebuild;
