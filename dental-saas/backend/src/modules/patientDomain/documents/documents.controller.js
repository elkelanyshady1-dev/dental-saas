const { successResponse, errorResponse } = require("@utils/responseFormatter");

class DocumentsController {
    /**
     * Generate Signed URL for S3 Object
     * Requirements: Never expose raw paths, Enforce organization isolation
     */
    async getSignedUrl(req, res) {
        try {
            const { key } = req.query;
            const organizationId = req.context.organizationId;
            const patientId = req.context.patientId || req.params.patientId;

            if (!key) throw new Error("Object key is required");

            // Security: Ensure key belongs to this org/patient context
            // In a real S3 implementation, we would check the key prefix: `org/${organizationId}/patients/${patientId}/...`
            if (!key.includes(`org/${organizationId}`)) {
                throw new Error("Access denied: Document does not belong to your organization");
            }

            // Mocking AWS S3 Signed URL generation
            const signedUrl = `https://s3.dental-saas.com/${key}?signature=v1.6.0_mock&expiry=3600`;

            return successResponse(res, { signedUrl });
        } catch (error) {
            return errorResponse(res, error.message, "DOCUMENT_ERROR", 403);
        }
    }
}

module.exports = new DocumentsController();
