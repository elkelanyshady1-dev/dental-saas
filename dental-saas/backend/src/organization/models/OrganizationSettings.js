const mongoose = require("mongoose");
const organizationSettingsSchema = new mongoose.Schema({
  primaryColor: {
    type: String
  },
  logo: {
    type: String // Used for S3 or local path ref
  },
  whatsappNumber: {
    type: String
  },
  aboutText: {
    type: String
  },
  customDomain: {
    type: String
  },
  isPublicLandingEnabled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});
organizationSettingsSchema.index({}, {
  unique: true
});
const modelName = "OrganizationSettings";
module.exports = {
  modelName,
  schema: organizationSettingsSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, organizationSettingsSchema)
};