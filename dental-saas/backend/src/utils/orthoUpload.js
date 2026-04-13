/**
 * orthoUpload.js
 * ═══════════════════════════════════════════════════════════════
 * Multer configuration for orthodontic file uploads.
 * Separate from patient photo upload to enforce different:
 *   - File size limits (STL can be 50MB+)
 *   - Allowed MIME types
 *   - Storage directories (tenant-isolated)
 * 
 * Architecture: Files → Disk → URL reference in MongoDB
 * NEVER store binary data in MongoDB.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "orthodontics");

// ─── Photo Upload ────────────────────────────────────────────────────────────

const photoDir = path.join(UPLOAD_ROOT, "photos");
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Tenant-isolated subdirectory
        const orgDir = path.join(photoDir, req.organizationId?.toString() || "unknown");
        if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
        cb(null, orgDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, "");
        const hash = crypto.randomBytes(8).toString("hex");
        cb(null, `${Date.now()}-${hash}${ext}`);
    },
});

const photoFilter = (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"];
    const allowedExts = /\.(jpg|jpeg|png|webp|bmp|tiff|tif)$/i;

    if (allowedMimes.includes(file.mimetype) && allowedExts.test(path.extname(file.originalname))) {
        cb(null, true);
    } else {
        cb(new Error("Only image files (jpg, jpeg, png, webp, bmp, tiff) are allowed"), false);
    }
};

const uploadPhoto = multer({
    storage: photoStorage,
    fileFilter: photoFilter,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — dental X-rays can be large
});

// ─── STL Upload ──────────────────────────────────────────────────────────────

const stlDir = path.join(UPLOAD_ROOT, "stl");
if (!fs.existsSync(stlDir)) fs.mkdirSync(stlDir, { recursive: true });

const stlStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const orgDir = path.join(stlDir, req.organizationId?.toString() || "unknown");
        if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
        cb(null, orgDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, "");
        const hash = crypto.randomBytes(8).toString("hex");
        cb(null, `${Date.now()}-${hash}${ext}`);
    },
});

const stlFilter = (req, file, cb) => {
    const allowedExts = /\.(stl|ply|obj)$/i;
    const allowedMimes = [
        "application/octet-stream",
        "model/stl",
        "model/x.stl-binary",
        "application/sla",
        "model/x.stl-ascii",
        "model/mesh",
        "application/x-ply",
    ];

    // STL files often have generic MIME types, so rely mainly on extension
    if (allowedExts.test(path.extname(file.originalname))) {
        cb(null, true);
    } else {
        cb(new Error("Only 3D model files (stl, ply, obj) are allowed"), false);
    }
};

const uploadStl = multer({
    storage: stlStorage,
    fileFilter: stlFilter,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — 3D scans can be very large
});

module.exports = { uploadPhoto, uploadStl, UPLOAD_ROOT };
