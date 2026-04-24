const mongoose = require("mongoose");
const chairSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});
chairSchema.index({
  branchId: 1
});
const modelName = "Chair";
module.exports = {
  modelName,
  schema: chairSchema
};