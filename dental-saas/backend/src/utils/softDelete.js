/**
 * Reusable Soft Delete Helper
 * Marks a document as inactive instead of destructive deletion.
 */
async function softDelete(model, id, organizationId) {
    const update = {
        isActive: false,
        deletedAt: new Date(),
    };

    const query = { _id: id };
    if (organizationId) {
        query.organizationId = organizationId;
    }

    const result = await model.findOneAndUpdate(query, update, { new: true });

    if (!result) {
        throw new Error("Document not found or access denied");
    }

    return result;
}

module.exports = softDelete;
