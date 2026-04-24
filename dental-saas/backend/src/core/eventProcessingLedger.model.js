const mongoose = require("mongoose");
const eventProcessingLedgerSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true
  },
  subscriber: {
    type: String,
    required: true
  },
  // e.g., 'InventorySubscriber'
  eventId: {
    type: String,
    required: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound unique index guarantees absolute atomicity against duplicate processing attempts
eventProcessingLedgerSchema.index({
  organizationId: 1,
  subscriber: 1,
  eventId: 1
}, {
  unique: true
});
const modelName = "EventProcessingLedger";
module.exports = {
  modelName,
  schema: eventProcessingLedgerSchema
};