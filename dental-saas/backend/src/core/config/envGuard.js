/**
 * envGuard.js — Environment Isolation Guard
 * Phase v27 — Storage + Infra Hardening
 *
 * Fail-fast validation that prevents cross-environment data leakage:
 *   - DEV must not connect to production MongoDB or storage buckets
 *   - PROD must not connect to development databases or buckets
 *   - NODE_ENV / APP_ENV must be consistent
 *
 * Called once during server boot, BEFORE any business logic.
 * Violations crash the process immediately — no graceful fallback.
 *
 * PLANE: Core (Infrastructure)
 */

"use strict";

const logger = require("@utils/logger");

// ─── Patterns that indicate production resources ────────────────────────────

const PROD_DB_PATTERNS   = ["dental_prod", "dental-prod", "prod-cluster", "production"];
const DEV_DB_PATTERNS    = ["dental_dev", "dental-dev", "dev-cluster", "development", "saasdental"];
const PROD_BUCKET_PATTERNS = ["dental-prod", "prod-storage", "production"];
const DEV_BUCKET_PATTERNS  = ["dental-dev", "dev-storage", "development"];

/**
 * Check whether a value matches any of the given patterns (case-insensitive).
 * @param {string} value
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesAny(value, patterns) {
    if (!value) return false;
    const lower = value.toLowerCase();
    return patterns.some((p) => lower.includes(p));
}

/**
 * Run all environment isolation checks.
 * Throws (and crashes) on any misconfiguration.
 *
 * @param {Object} [options]
 * @param {string} [options.mongoUri]       — defaults to process.env.MONGO_URI_PLATFORM
 * @param {string} [options.r2Bucket]       — defaults to process.env.R2_BUCKET
 * @param {string} [options.nodeEnv]        — defaults to process.env.NODE_ENV
 * @param {string} [options.appEnv]         — defaults to process.env.APP_ENV
 */
function validateEnvironment(options = {}) {
    const mongoUri = options.mongoUri || process.env.MONGO_URI_PLATFORM || "";
    const r2Bucket = options.r2Bucket || process.env.R2_BUCKET || "";
    const nodeEnv  = options.nodeEnv  || process.env.NODE_ENV || "";
    const appEnv   = options.appEnv   || process.env.APP_ENV || "";

    const errors = [];

    // ─── 1. NODE_ENV ↔ APP_ENV consistency ──────────────────────────────────
    if (appEnv) {
        const envMismatch =
            (nodeEnv === "production" && appEnv === "dev") ||
            (nodeEnv === "development" && appEnv === "prod");

        if (envMismatch) {
            errors.push(
                `NODE_ENV="${nodeEnv}" conflicts with APP_ENV="${appEnv}". ` +
                `These must be consistent.`
            );
        }
    }

    // ─── 2. DEV → Prod DB guard ─────────────────────────────────────────────
    if (nodeEnv === "development" && matchesAny(mongoUri, PROD_DB_PATTERNS)) {
        errors.push(
            `DEV ENV CONNECTED TO PRODUCTION DATABASE. ` +
            `MONGO_URI_PLATFORM contains a production identifier. ` +
            `Update .env to use your local dev database.`
        );
    }

    // ─── 3. PROD → Dev DB guard ─────────────────────────────────────────────
    if (nodeEnv === "production" && matchesAny(mongoUri, DEV_DB_PATTERNS)) {
        errors.push(
            `PROD ENV CONNECTED TO DEVELOPMENT DATABASE. ` +
            `MONGO_URI_PLATFORM contains a dev identifier. ` +
            `Update deployment config to use the production database.`
        );
    }

    // ─── 4. DEV → Prod bucket guard ────────────────────────────────────────
    if (nodeEnv === "development" && matchesAny(r2Bucket, PROD_BUCKET_PATTERNS)) {
        errors.push(
            `DEV ENV USING PRODUCTION STORAGE BUCKET "${r2Bucket}". ` +
            `Set R2_BUCKET to the dev bucket.`
        );
    }

    // ─── 5. PROD → Dev bucket guard ────────────────────────────────────────
    if (nodeEnv === "production" && matchesAny(r2Bucket, DEV_BUCKET_PATTERNS)) {
        errors.push(
            `PROD ENV USING DEVELOPMENT STORAGE BUCKET "${r2Bucket}". ` +
            `Set R2_BUCKET to the production bucket.`
        );
    }

    // ─── Verdict ────────────────────────────────────────────────────────────
    if (errors.length > 0) {
        const msg = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");

        logger.error(
            {
                event:   "ENV_MISCONFIGURATION",
                severity: "P0",
                nodeEnv,
                appEnv,
                mongoUri: mongoUri.replace(/\/\/[^@]+@/, "//***@"), // mask credentials
                r2Bucket,
                errors,
            },
            `🚨 ENV_MISCONFIGURATION — BOOT BLOCKED\n${msg}`
        );

        throw new Error(
            `ENV_MISCONFIGURATION (P0): ${errors.length} environment isolation violation(s) detected. ` +
            `See log above for details.`
        );
    }

    logger.info(
        {
            event:  "ENV_GUARD_PASSED",
            nodeEnv,
            appEnv:  appEnv || "(not set)",
            r2Bucket: r2Bucket || "(not set)",
        },
        "[ENV GUARD] ✅ Environment isolation validated"
    );
}

module.exports = { validateEnvironment };
