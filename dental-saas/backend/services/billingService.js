/**
 * Billing Service — Stub
 *
 * Triggered when appointment status transitions to "completed".
 * Replace this stub with actual billing logic when ready.
 */

const logger = require("../utils/logger");

const createDiagnosticInvoice = async (appointmentId) => {
    // TODO: Implement billing invoice creation
    // This function is called automatically when an appointment is completed.
    // It should:
    //   1. Look up appointment details (patient, dentist, procedures)
    //   2. Generate an invoice record
    //   3. Associate it with the patient's account
    logger.info({ service: "BillingService", action: "invoice_stub_triggered", appointmentId }, "Invoice stub triggered for appointment");
    return { invoiceId: null, status: "stub" };
};

module.exports = {
    createDiagnosticInvoice,
};
