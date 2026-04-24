const mongoose = require("mongoose");
const financialEventLedgerSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
});
financialEventLedgerSchema.index({
  eventId: 1
}, {
  unique: true
});
const modelName = "FinancialEventLedger";
module.exports = {
  modelName,
  schema: financialEventLedgerSchema
};