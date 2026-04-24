const mongoose = require("mongoose");
const stageDefinitionSchema = new mongoose.Schema({
  stageName: {
    type: String,
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  defaultDurationDays: {
    type: Number,
    default: 7
  },
  billingTrigger: {
    type: Boolean,
    default: false
  },
  reminderTrigger: {
    type: Boolean,
    default: false
  },
  inventoryConsumption: [{
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem"
    },
    quantity: {
      type: Number,
      required: true
    }
  }]
}, {
  _id: false
});
const stageTemplateSchema = new mongoose.Schema({
  procedureType: {
    type: String,
    required: true,
    enum: ["ORTHODONTIC", "IMPLANT", "SURGERY", "GENERAL"]
  },
  name: {
    type: String,
    required: true
  },
  stages: [stageDefinitionSchema],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});
stageTemplateSchema.index({
  procedureType: 1
});

// Standardized single-field indexes
stageTemplateSchema.index({});
const modelName = "StageTemplate";
module.exports = {
  modelName,
  schema: stageDefinitionSchema
};