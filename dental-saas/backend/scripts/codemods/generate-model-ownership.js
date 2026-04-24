#!/usr/bin/env node
/**
 * generate-model-ownership.js
 * Step 5e-B — Phase 1 · Ownership inference.
 *
 * Walks every model file in src/ and classifies it as platform / shared /
 * tenant based on:
 *   1. Hard-coded EXPLICIT_OVERRIDES (trumps everything — encodes plan
 *      decisions like ShareLink being platform-plane even though the old
 *      file sat under modules/share/).
 *   2. Path-based heuristics.
 *
 * Emits a JSON map keyed by absolute model path → { modelName, plane, rule }.
 * The `rule` field explains WHY each classification was chosen so a reviewer
 * can audit quickly.
 *
 * Usage:
 *   node scripts/codemods/generate-model-ownership.js > model-ownership.json
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Explicit overrides (plan-driven) ───────────────────────────────────────
// These classifications come from the 3-layer plan decisions. Reviewer may
// edit freely — the file sits in the repo so edits show in git.

const EXPLICIT_OVERRIDES = {
    // ShareLink moved to platform in Step 5c Commit 4.
    "ShareLink": "platform",

    // Shared-infra collections (pure infra, no business data).
    "CommunicationLog": "shared",
    "CommunicationMetrics": "shared",
    "CommunicationRetryLog": "shared",
    "EmailEvent": "shared",
    "DomainEventOutbox": "shared",
    "Outbox": "shared",
    "SideEffectOutbox": "shared",
    "IdempotencyKey": "shared",

    // Platform audit trails (explicitly kept on platform in Commit 2 scope).
    "AuthTrace": "platform",
    "PermissionChangeLog": "platform",
    "BillingEventLog": "platform",
    "RefundExecutionRecord": "platform",
    "AuditLog": "platform",
    "OrgUsage": "platform",
    "OrgStorageAlertState": "platform",
    "organizationStorageUsage": "platform",

    // Tenant-scope (even though file lives under src/organization/...)
    "Patient": "tenant",
    "Appointment": "tenant",
    "Chair": "tenant",
    "Family": "tenant",
    "FamilyMember": "tenant",
    "Recall": "tenant",
    "OrganizationSettings": "tenant",
    "Notification": "tenant",
    "SignupIdempotency": "tenant",
    "PolicyVersion": "tenant",
    "SecurityAlert": "tenant",
    "OrgAddOn": "tenant",

    // Platform core
    "Organization": "platform",
    "PlatformUser": "platform",
    "User": "tenant",                    // org-scoped User collection
    "PlatformRole": "platform",
    "PlatformCapability": "platform",
    "PlatformConfig": "platform",
    "PlatformNotification": "platform",
    "PlatformInvoice": "platform",
    "InvoiceSequence": "platform",
    "FeatureDefinition": "platform",
    "ModuleDefinition": "platform",
    "FeatureFlag": "platform",
    "Plan": "platform",
    "PlanVersion": "platform",
    "PlanTemplate": "platform",
    "OrgContract": "platform",
    "OrganizationEntitlement": "platform",
    "BillingLedger": "platform",
    "BillingSettings": "platform",
    "BillingControl": "platform",
    "BillingAuditLog": "platform",
    "BillingTimeline": "platform",
    "LedgerAccount": "platform",
    "LedgerTransaction": "platform",
    "PaymentAttempt": "platform",
    "RevenueSnapshotProjection": "platform",
    "SubscriptionMutationRecord": "platform",
    "RevenueSchedule": "platform",
    "ExchangeRate": "platform",
    "revenueAnalytics": "platform",
    "campaign": "platform",
    "coupon": "platform",
    "Region": "platform",
    "Cluster": "platform",
    "addOn": "platform",
    "EmailTemplate": "platform",
    "GuardianAuditLog": "platform",
    "PasswordResetToken": "platform",
    "RefreshToken": "platform",
    "VerificationToken": "platform",
    "MagicToken": "platform",
    "OtpRecord": "platform",
    "RateLimitEntry": "shared",
    "Session": "platform",
    "KashierEvent": "platform",
    "StripeEvent": "platform",
    "CronLock": "platform",
    "SiteContent": "platform",
    "Lead": "platform",
    "Ticket": "platform",
    "MigrationLog": "platform",

    // Tombstone proxy re-exports (flagged for cleanup later)
    "BillingInvoice": "platform",   // → re-exports PlatformInvoice
};

// ─── Path-based heuristics (fallback) ───────────────────────────────────────

function planeByPath(filePath) {
    const rel = filePath.replace(/\\/g, "/");
    if (/\/src\/platform\//.test(rel)) return { plane: "platform", rule: "path:src/platform" };
    if (/\/src\/shared\//.test(rel)) return { plane: "platform", rule: "path:src/shared (most shared models are platform)" };
    if (/\/src\/core\//.test(rel)) {
        if (/\/outbox\//.test(rel) || /IdempotencyKey/.test(rel) || /DomainEventOutbox/.test(rel)) {
            return { plane: "shared", rule: "path:src/core + outbox/idempotency" };
        }
        return { plane: "platform", rule: "path:src/core (default = platform)" };
    }
    if (/\/src\/organization\//.test(rel)) {
        if (/orgAddOn/.test(rel)) return { plane: "tenant", rule: "path:src/organization + orgAddOn (kept tenant per Commit 3)" };
        return { plane: "tenant", rule: "path:src/organization" };
    }
    if (/\/src\/modules\//.test(rel)) return { plane: "tenant", rule: "path:src/modules" };
    if (/\/src\/orgRuntime\//.test(rel)) return { plane: "tenant", rule: "path:src/orgRuntime (per-org runtime state)" };
    return { plane: "unknown", rule: "no-rule-matched" };
}

// ─── Walk model files ───────────────────────────────────────────────────────

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "tests") continue;
            yield* walk(full);
        } else if (entry.isFile()) {
            const rel = full.replace(/\\/g, "/");
            // Match: *.model.js, *.models.js, OR any .js under a "models" directory
            if (rel.endsWith(".model.js") || rel.endsWith(".models.js")) {
                yield full;
            } else if (rel.endsWith(".js") && /\/models\//.test(rel)) {
                yield full;
            }
        }
    }
}

function extractModelName(filePath) {
    const src = fs.readFileSync(filePath, "utf-8");
    // Look for: modelName = "X" OR const modelName = "X" OR modelName: "X"
    const m1 = src.match(/modelName\s*[:=]\s*["'`]([^"'`]+)["'`]/);
    if (m1) return m1[1];
    // Fallback: mongoose.model("X", ...)
    const m2 = src.match(/mongoose\.model\(\s*["'`]([^"'`]+)["'`]/);
    if (m2) return m2[1];
    return null;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(process.cwd(), "src");
if (!fs.existsSync(ROOT)) {
    console.error("Run from backend/ directory — src/ not found");
    process.exit(2);
}

const map = {};
const warnings = [];

for (const file of walk(ROOT)) {
    let modelName = extractModelName(file);
    let nameSource = modelName ? "schema" : null;
    if (!modelName) {
        // Fallback: use basename (without .model.js / .js) as the effective
        // name. This catches proxy shims and non-standard exports that still
        // need a classification. Flagged as "derived" so reviewers see it.
        const base = path.basename(file).replace(/\.model(s)?\.js$/, "").replace(/\.js$/, "");
        modelName = base;
        nameSource = "filename";
        warnings.push({ file, reason: "no modelName extracted — derived from filename" });
    }

    let plane;
    let rule;
    if (EXPLICIT_OVERRIDES[modelName]) {
        plane = EXPLICIT_OVERRIDES[modelName];
        rule = `explicit:${modelName}=${plane}` + (nameSource === "filename" ? " (name derived)" : "");
    } else {
        const pathGuess = planeByPath(file);
        plane = pathGuess.plane;
        rule = pathGuess.rule + (nameSource === "filename" ? " (name derived)" : "");
    }

    const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
    map[rel] = { modelName, plane, rule };
}

const output = {
    generatedAt: new Date().toISOString(),
    total: Object.keys(map).length,
    byPlane: Object.values(map).reduce((acc, v) => {
        acc[v.plane] = (acc[v.plane] || 0) + 1;
        return acc;
    }, {}),
    warnings,
    models: map,
};

process.stdout.write(JSON.stringify(output, null, 2));
