const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema({
    source: {
        type: String, // e.g., 'landing', 'pricing', 'demo'
    },
    status: {
        type: String,
        enum: ["new", "contacted", "converted"],
        default: "new",
    },
    name: {
        type: String,
    },
    phone: {
        type: String,
    },
    message: {
        type: String,
    },
    organizationInterest: {
        type: String,
    },
    ipAddress: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

leadSchema.index({ createdAt: -1 });
leadSchema.index({ phone: 1 });

module.exports = mongoose.model("Lead", leadSchema);
