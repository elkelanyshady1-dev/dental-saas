const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "..", "uploads", "patients");

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Sanitize: strip path separators to prevent directory traversal
        const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, "");
        const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
        cb(null, safeName);
    },
});

const fileFilter = (req, file, cb) => {
    // Check both mimetype AND extension to prevent disguised executables
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    const allowedExts = /\.(jpg|jpeg|png|webp)$/i;

    if (allowedMimes.includes(file.mimetype) && allowedExts.test(path.extname(file.originalname))) {
        cb(null, true);
    } else {
        cb(new Error("Only image files (jpg, jpeg, png, webp) are allowed"), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;
