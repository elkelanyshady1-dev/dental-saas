/**
 * orgBrandingController.js
 *
 * GET  /api/v1/org/settings/profile    → public org profile (name, slug, logoUrl)
 * PUT  /api/v1/org/settings/logo       → upload new org logo (admin only)
 *
 * Storage strategy:
 *   - Production: AWS S3 (requires AWS_S3_BUCKET + AWS_REGION env vars)
 *   - Development fallback: local /uploads/logos/ served statically
 */

const path = require("path");
const fs = require("fs");
const multer = require("multer");


// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/svg+xml"]);
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Upload file buffer to S3.
 * Returns { logoUrl, logoKey }.
 */
async function uploadToS3(buffer, mimetype, organizationId) {
    // Lazily require AWS SDK so missing dep doesn't crash dev servers
    const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

    const ext = mimetype === "image/svg+xml" ? "svg" : mimetype.split("/")[1];
    const key = `logos/${organizationId}/${Date.now()}.${ext}`;
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || "us-east-1";

    const client = new S3Client({ region });
    await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
        ACL: "public-read",
    }));

    const logoUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    return { logoUrl, logoKey: key };
}

/**
 * Delete an existing S3 object by key (non-fatal).
 */
async function deleteFromS3(key) {
    try {
        const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
        const client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
        await client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
    } catch (e) {
        console.warn("[Branding] S3 delete failed (non-fatal):", e.message);
    }
}

/**
 * Save file to local disk (dev fallback).
 * Returns { logoUrl, logoKey }.
 */
function saveLocally(buffer, mimetype, organizationId) {
    const ext = mimetype === "image/svg+xml" ? "svg" : mimetype.split("/")[1];
    const filename = `${organizationId}-${Date.now()}.${ext}`;
    const dir = path.join(__dirname, "../../uploads/logos");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), buffer);

    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    return {
        logoUrl: `${baseUrl}/uploads/logos/${filename}`,
        logoKey: `local:${filename}`,
    };
}

// ─── Multer (memory storage — we handle persistence ourselves) ────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "Only PNG, JPG, and SVG files are allowed."));
        }
    },
});

/** Express middleware that parses a single `logo` field */
exports.logoUploadMiddleware = upload.single("logo");

// ─── Controller functions ──────────────────────────────────────────────────────

/**
 * GET /api/v1/org/settings/profile
 * Returns public branding profile — accessible to any authenticated org user.
 */
exports.getOrgProfile = async (req, res) => {
    try {
        // Phase X.2: organizationContext middleware was removed from the /org chain.
        // req.organization is no longer pre-loaded. Query directly using req.organizationId
        // (set by authMiddleware from the verified JWT).
        const Organization = require("../../shared/models/Organization").default;
        const orgId = req.context?.organizationId || req.organizationId;

        if (!orgId) {
            return res.status(400).json({ success: false, message: "Missing organization context" });
        }

        const org = await Organization.findById(orgId)
            .select("name slug logoUrl organizationSettings defaultLanguage createdAt")
            .lean();

        if (!org) {
            // Fix 3 — Diagnostic: log exactly WHY we got null so we can identify
            // whether this is a stale JWT, a deleted/archived org, or a DB mismatch.
            const mongoose = require("mongoose");
            const logger = require("../../utils/logger");
            logger.error({
                event: "ORG_PROFILE_NOT_FOUND",
                orgId: orgId?.toString(),
                dbName: mongoose.connection.name,
                dbReadyState: mongoose.connection.readyState, // 1 = connected
                userId: req.user?._id?.toString(),
                tokenOrgId: req.context?.organizationId?.toString(),
                reqOrgId: req.organizationId?.toString(),
            }, "[OrgProfile] Organization.findById returned null — possible stale JWT or deleted org");
            return res.status(404).json({ success: false, message: "Organization not found" });
        }

        res.json({
            success: true,
            data: {
                name: org.name,
                slug: org.slug,
                logoUrl: org.logoUrl || org.organizationSettings?.branding?.logo || null,
                defaultLanguage: org.organizationSettings?.defaultLanguage || org.defaultLanguage || "en",
                timezone: org.organizationSettings?.timezone || "Africa/Cairo",
                autoDetectTimezone: org.organizationSettings?.autoDetectTimezone ?? true,
                createdAt: org.createdAt,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * PUT /api/v1/org/settings/logo
 * Accepts multipart/form-data with field `logo`.
 * Requires: canManageOrganization permission.
 */
exports.uploadOrgLogo = async (req, res) => {
    try {
        // ── RBAC ──────────────────────────────────────────────────
        const isSuperadmin = ["superadmin", "platform_admin"].includes(req.user?.platformRole);
        const canManage = isSuperadmin || req.user?.permissionSet?.has("organization.manage");
        if (!canManage) {
            return res.status(403).json({ success: false, message: "Permission denied: canManageOrganization required" });
        }

        // ── File guard ────────────────────────────────────────────
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded. Field name must be `logo`." });
        }

        const { buffer, mimetype } = req.file;
        if (!ALLOWED_MIME.has(mimetype)) {
            return res.status(422).json({ success: false, message: "Invalid file type. Allowed: PNG, JPG, SVG." });
        }

        // Phase X.2: organizationContext middleware removed — query directly.
        const Organization = require("../../shared/models/Organization").default;
        const orgId = req.context?.organizationId || req.organizationId;
        const org = await Organization.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: "Organization not found" });
        }

        // ── Delete old logo from S3 (if present and not local) ───
        if (org.logoKey && !org.logoKey.startsWith("local:") && process.env.AWS_S3_BUCKET) {
            await deleteFromS3(org.logoKey);
        }

        // ── Upload new logo ───────────────────────────────────────
        let logoUrl, logoKey;
        const useS3 = !!process.env.AWS_S3_BUCKET;

        if (useS3) {
            ({ logoUrl, logoKey } = await uploadToS3(buffer, mimetype, String(org._id)));
        } else {
            ({ logoUrl, logoKey } = saveLocally(buffer, mimetype, String(org._id)));
        }

        // ── Persist ───────────────────────────────────────────────
        org.logoUrl = logoUrl;
        org.logoKey = logoKey;
        // Mirror into legacy branding field for backward-compat
        org.organizationSettings.branding.logo = logoUrl;
        await org.save();

        // ── Audit ─────────────────────────────────────────────────
        const auditService = require("../../services/auditService");
        await auditService.createAuditRecord({
            organizationId: org._id,
            req: req,
            userId: req.user._id,
            actorId: req.user._id,
            actorType: "tenant_user",
            action: "ORG_LOGO_UPDATED",
            entity: "organization",
            entityType: "ORGANIZATION",
            entityId: org._id,
            metadata: { logoUpdated: true, logoKey },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200,
            success: true,
        });

        res.json({
            success: true,
            message: "Logo updated successfully",
            data: {
                name: org.name,
                slug: org.slug,
                logoUrl: org.logoUrl,
            },
        });
    } catch (err) {
        // Multer errors (file too large, wrong field, etc.)
        if (err instanceof multer.MulterError) {
            const msg = err.code === "LIMIT_FILE_SIZE"
                ? "File size must be under 2 MB."
                : err.message;
            return res.status(422).json({ success: false, message: msg });
        }
        console.error("[Branding] Logo upload error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
