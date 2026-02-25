const fs = require("fs");
const path = require("path");

/**
 * Storage Service Abstraction
 * Currently uses local disk storage via Multer.
 * Prepared for future S3 interface alignment.
 */
class StorageService {
    /**
     * Get the public URL for a stored file
     */
    getPublicUrl(filePath) {
        if (!filePath) return null;
        // Assuming /uploads is served statically
        return filePath;
    }

    /**
     * Delete a file from storage
     */
    async delete(filePath) {
        if (!filePath) return;

        // Convert public path to absolute path
        // filePath example: /uploads/patients/photo.jpg
        const absolutePath = path.join(process.cwd(), filePath);

        try {
            if (fs.existsSync(absolutePath)) {
                await fs.promises.unlink(absolutePath);
            }
        } catch (error) {
            console.error(`[StorageService] Failed to delete file: ${filePath}`, error.message);
        }
    }

    /**
     * In the current local implementation, Multer handles the writes.
     * This method acts as a mapper for the filename to public path.
     */
    getRelativePath(category, filename) {
        return `/uploads/${category}/${filename}`;
    }
}

module.exports = new StorageService();
