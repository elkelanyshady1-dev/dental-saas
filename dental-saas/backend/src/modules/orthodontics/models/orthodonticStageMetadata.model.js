const mongoose = require("mongoose");

const orthodonticStageMetadataSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true
        },
        stageExecutionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StageExecution",
            required: true
        },
        wireType:           { type: String },
        iprPerformed:       { type: String },
        attachmentsPlaced:  { type: Boolean, default: false },
        notes:              { type: String }
    },
    { timestamps: true }
);

orthodonticStageMetadataSchema.index({ organizationId: 1 });
orthodonticStageMetadataSchema.index({ stageExecutionId: 1 }, { unique: true });

const modelName = "OrthodonticStageMetadata";

module.exports = {
    modelName,
    schema: orthodonticStageMetadataSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, orthodonticStageMetadataSchema),
};
