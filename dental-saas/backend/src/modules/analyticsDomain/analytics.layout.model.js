const mongoose = require("mongoose");
const analyticsTabSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  widgets: [{
    type: String
  }] // IDs from AnalyticsWidgetRegistry
}, {
  _id: false
});
const analyticsLayoutSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true
  },
  tabs: [analyticsTabSchema],
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Per-org DB: unique per role per database
analyticsLayoutSchema.index({
  role: 1
}, {
  unique: true
});
const modelName = "AnalyticsLayout";
module.exports = {
  modelName,
  schema: analyticsTabSchema
};