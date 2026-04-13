/**
 * test-idempotency.js
 * 
 * Simulates duplicate event emission to verify the Global Event Idempotency Enforcement.
 */

const mongoose = require("../backend/node_modules/mongoose");
const eventBus = require("../backend/src/core/eventBus");
const Events = require("../backend/src/core/domainEvents");
const EventProcessingLedger = require("../backend/src/core/eventProcessingLedger.model");
const FinancialSnapshot = require("../backend/src/modules/financialDomain/models/financialSnapshot.model");

// We need the subscriber initialized to listen
require("../backend/src/modules/financialDomain/subscribers/financialSnapshot.subscriber");

async function runTest() {
    console.log("🧪 Starting Idempotency Duplication Simulation Test...\n");

    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/dental_saas_test");

    const orgId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const testEventId = `evt_test_${Date.now()}`;

    console.log(`[Test] Emitting Financial Event: ${testEventId}`);

    const payload = {
        eventId: testEventId,
        organizationId: orgId,
        patientId: patientId,
        type: "INVOICE_CREATED",
        amount: 500,
        revenueCategory: "TREATMENT"
    };

    // Emit 3 times almost concurrently
    eventBus.emit("financial_event", payload);
    eventBus.emit("financial_event", payload);
    eventBus.emit("financial_event", payload);

    // Wait for async subscribers to finish processing
    console.log("[Test] Waiting for subscribers closure...");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify Ledger
    const ledgerCount = await EventProcessingLedger.countDocuments({ eventId: testEventId });
    console.log(`[Verify] Ledger entries for event: ${ledgerCount} (Expected: 1)`);

    // Verify Business Impact (Snapshot)
    const snapshot = await FinancialSnapshot.findOne({ organizationId: orgId, patientId: patientId });
    console.log(`[Verify] Patient Outstanding Balance: $${snapshot?.outstandingBalance || 0} (Expected: $500)`);

    if (ledgerCount === 1 && snapshot?.outstandingBalance === 500) {
        console.log("\n✅ IDEMPOTENCY TEST PASSED. Duplicate events safely ignored.");
    } else {
        console.error("\n❌ IDEMPOTENCY TEST FAILED. Data duplication detected.");
    }

    // Cleanup
    await EventProcessingLedger.deleteMany({ eventId: testEventId });
    await FinancialSnapshot.deleteMany({ organizationId: orgId, patientId: patientId });

    await mongoose.disconnect();
    process.exit(0);
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
