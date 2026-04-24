const express = require("express");
const app = express();
const helmet = require("helmet");

// Disable automatic Express ETag generation (v19.3 Platform Plane Isolation).
// Express computes ETags for all responses by default — returning 304 when body
// hasn't changed. The platform frontend has no 304 rehydration logic outside of
// the /feature-flags endpoint, causing blank page rendering on cached routes.
// Manual ETag on /feature-flags (res.setHeader('ETag', ...)) is unaffected —
// this setting only disables Express's *automatic* ETag computation.
app.set("etag", false);

// Trust the first proxy (Stripe/Nginx) to resolve client IPs correctly
// Required for express-rate-limit to function behind a load balancer.
app.set("trust proxy", 1);
const mongoSanitize = require("./src/middleware/mongoSanitize.middleware");
const { createLimiter } = require("./src/middleware/rateLimiter");
const errorHandler = require("./src/middleware/errorHandler");
const logger = require("./src/utils/logger");

const cookieParser = require("cookie-parser");
// Request Correlation — reads X-Request-ID from client or generates UUID.
// Aliases req.correlationId for backward compatibility with audit service
// and logging consumers. Echoes X-Request-ID + x-correlation-id in every response.
const requestIdMiddleware = require("./src/platform/middleware/requestIdMiddleware");

const edgeRouter = require("./src/infrastructure/edge/edgeRouter");
const { register } = require("./src/infrastructure/metrics/metrics");
const { registerRouter } = require("./src/integrity/routerRegistry");


// ─── TEMP DEBUG — GLOBAL REQUEST LOGGER (FIRST MIDDLEWARE) ────────────────────
// Fires on EVERY inbound request BEFORE any other middleware can intercept.
// If this log is missing while the browser still gets a 503, the request isn't
// reaching this Node process at all (wrong port / proxy / different instance).
// Remove after root cause identified.
app.use((req, res, next) => {
    console.log(
        "📥 INCOMING",
        req.method,
        req.originalUrl,
        "| host:", req.headers.host,
        "| x-forwarded-host:", req.headers["x-forwarded-host"] || "<none>",
        "| origin:", req.headers.origin || "<none>"
    );
    // Also trace the outgoing status so we can correlate INCOMING → status.
    res.on("finish", () => {
        console.log(
            "📤 OUTGOING",
            req.method,
            req.originalUrl,
            "→",
            res.statusCode,
            res.statusMessage || ""
        );
    });
    next();
});

let shuttingDown = false;

// 🛡️ v11.0 Hardening — Shutdown Guard
app.use((req, res, next) => {
    if (shuttingDown) {
        res.set("Connection", "close");
        return res.status(503).send("Server shutting down");
    }
    next();
});

// 📊 v11.0 Hardening — Prometheus Metrics
app.get("/metrics", async (req, res) => {
    if (process.env.METRICS_ENABLED !== "true") {
        return res.status(404).send("Not found");
    }
    try {
        res.set("Content-Type", register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(err);
    }
});

app.use(helmet());
app.use(requestIdMiddleware);

app.use(edgeRouter);

// 🛡️ v11.0 Hardening — Stripe Raw Body Mounting
// MUST be mounted before express.json()
app.use("/api/public/stripe/webhook", express.raw({ type: "application/json" }));

// ─── Phase 4: QStash Communication Webhook ────────────────────────────────────
// Raw body is required so the Upstash signature verifier sees the exact bytes
// QStash signed. Route-scoped mount — the raw parser ONLY runs on this one
// POST, which guarantees no earlier global body parser can touch the bytes.
// Mounted BEFORE express.json() below for defense-in-depth.
const { handleCommunicationJob } = require("./src/jobs/controllers/job.controller");
app.post(
    "/api/public/qstash/comm",
    express.raw({ type: "application/json", limit: "1mb" }),
    handleCommunicationJob
);

// ─── Kashier Webhook Raw Body ────────────────────────────────────────────────
// Kashier signs the raw request bytes with HMAC-SHA256; the controller
// (kashier.webhook.controller.handleKashierWebhook) hard-fails on
// `RAW_BODY_REQUIRED` when `req.rawBody` is missing. Route-scoped json with a
// `verify` hook gives us BOTH the parsed `req.body` (for `parseEvent`) and
// `req.rawBody` (for signature verification). Mounted BEFORE the global
// express.json so no earlier parser can swallow the bytes.
const { handleKashierWebhook } = require("./src/platform/billing/controllers/kashier.webhook.controller");
app.post(
    "/api/public/webhooks/kashier",
    express.json({
        limit: "1mb",
        verify: (req, _res, buf) => { req.rawBody = buf; }
    }),
    handleKashierWebhook
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(mongoSanitize); // v30.0 — Express 5-safe NoSQL injection prevention (custom middleware)
app.use(cookieParser());

const requestContext = require("./src/middleware/requestContext");
app.use(requestContext);

const responseFormatter = require("./src/middleware/responseFormatter");
app.use(responseFormatter);

// Phase 9.1: Runtime DTO contract enforcer — validates displayName on every patient response
const dtoEnforcer = require("./src/middleware/dtoEnforcer");
app.use(dtoEnforcer);

const cors = require("cors");
const path = require("path");

const isProd = process.env.NODE_ENV === "production";

// Rate limiters (IPv6-safe via centralized factory)
const loginLimiter = createLimiter({
    windowMs: isProd ? 15 * 60 * 1000 : 1 * 60 * 1000,
    max: isProd ? 5 : 20,
    keyType: "ip",
    message: "Too many login attempts from this IP, please try again later",
});
// NOTE: refreshLimiter, forgotPasswordLimiter, registerLimiter are defined
// directly in authRoutes.js (v30.0) for route-level application.

const bookingLimiter = createLimiter({
    windowMs: 5 * 60 * 1000,
    max: 50,
    keyType: "ip",
    message: "Rate limit exceeded for booking operations",
});

const authRoutes = require("./src/routes/authRoutes");

let otpRoutes;
try {
    otpRoutes = require("./src/modules/auth/otp.routes");
    console.log("✅ OTP routes loaded");
} catch (err) {
    console.error("❌ Failed to load OTP routes:", err.message);
    process.exit(1);
}

let magicRoutes;
try {
    magicRoutes = require("./src/modules/auth/magic.routes");
    console.log("✅ Magic-link routes loaded");
} catch (err) {
    console.error("❌ Failed to load Magic-link routes:", err.message);
    process.exit(1);
}
const platformRoutes = require("./src/routes/platform");
const organizationRoutes = require("./src/routes/organizationRoutes");
const platformPublicRoutes = require("./src/shared/routes/platformPublicRoutes");
const healthRoutes = require("./src/routes/healthRoutes");

// Phase S2: familyRoutes, appointmentRoutes, recallRoutes, settingsRoutes, addOnRoutes
// are NOW mounted inside orgV1Routes.js (full security chain).
// Direct mounts removed — backward-compat via 308 redirects below.

// ─── Patient Portal & Booking Engine (v1.4.0) ─────────────
const patientBookingRoutes = require("./src/modules/booking/booking.routes");
const patientBookingApprovalRoutes = require("./src/modules/booking/bookingApproval.routes");
const patientPortalRoutes = require("./src/modules/patientPortal/patientPortal.routes");

const protect = require("./src/middleware/authMiddleware");
const orgProtect = require("./src/middleware/orgProtect");
const organizationContext = require("./src/middleware/organizationMiddleware");
const auditLogger = require("./src/middleware/auditLogger");
const platformAuditLogger = require("./src/middleware/platformAuditLogger");
const branchContextMiddleware = require("./src/middleware/branchContext.middleware.js");
// Phase A: Feature Flag middleware — resolves per-org FeatureFlag overrides → req.featureFlags
const { resolveFeatureFlags: featureFlagMiddleware } = require("./src/platform/flags/featureFlagMiddleware");
// Phase B — Unified Capability Middleware: merges PlanVersion + FeatureFlags + org overrides → req.capabilities
// REQUIRED: must run after featureFlagMiddleware (depends on req.featureFlags)
// and after orgSubscriptionGuard (depends on req.planCapabilities).
// requireEntitlement() in every module route reads req.capabilities.modules (SSOT).
const unifiedCapabilityMiddleware = require("./src/middleware/unifiedCapabilityMiddleware");
// Sprint 1: Org Subscription Guard — loads OrgContract + PlanVersion → sets req.planCapabilities
// Also enforces subscription validity (402 for expired/unknown orgs).
const orgSubscriptionGuard = require("./src/middleware/orgSubscriptionGuard");
// Phase F: RLS Context — attaches frozen row-level security scope to every org request
const rlsContext = require("./src/middleware/rlsContext");
// Phase 8 Seam: org write lock — HTTP-level rejection during cutover migrations.
// Day-1 never fires (no org is ever locked). Mounted now so the enforcement
// point is live the moment Phase 8 tooling flips a writeLocked flag.
const orgWriteLock = require("./src/middleware/orgWriteLock.middleware");
// Downtime migration guard — returns 503 MAINTENANCE_MODE while an org is
// being migrated in downtime mode. Platform admins bypass.
const maintenanceGuard = require("./src/middleware/maintenance.middleware");
// Per-org in-flight request counter — feeds the downtime migration drain phase.
const orgRequestCounter = require("./src/middleware/orgRequestCounter");
// Phase F.10: secureFlowMiddleware removed — per-org DB isolation is the sole tenant boundary
// No query-level drift detection needed when each org has its own database.
const secureFlowMiddleware = () => (req, res, next) => next();

// ─── Phase H.3: Legacy Settings Redirect ─────────────────────────────────────
// Intercepts old /org/security and /org/features-control paths (307 → canonical).
// Must be required AFTER logger is available.
const { createLegacySettingsRedirect } = require("./src/middleware/legacySettingsRedirect");

// ─── Sovereign Guard (v1.8.2) ───
const { verifyArchitecture } = require("./src/core/sovereignGuard");




const corsOptions = {
    origin: isProd ? (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false) : "http://localhost:3000",
    credentials: true
};

app.use(cors(corsOptions));

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM AUTH — Strictly isolated, no overlap with platform domain routes
// Mount BEFORE any global middleware that could interfere.
// ─────────────────────────────────────────────────────────────────────────────
// MOUNTED via platformRoutes later in file


// Serve uploaded files (patient photos, orthodontic photos, STL, etc.)
// ⚠️ Two directories exist due to multer config paths:
//   - backend/uploads/       — legacy patient uploads
//   - backend/src/uploads/   — orthodontic photo & STL uploads (via orthoUpload.js)
// Both are served at /uploads — Express tries each in order.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "src", "uploads")));

app.use("/api/health", healthRoutes);

// ─── Meta endpoints (public, no auth) ────────────────────────────────────────
// GET /api/meta/country → IP-suggested country for the registration dropdown.
// Suggestion only — the registration controller uses the USER-CONFIRMED value
// from the request body as the source of truth.
const metaRoutes = require("./src/routes/meta.routes");
app.use("/api/meta", metaRoutes);

// ─── Phase 10: Contract-Driven API Documentation ─────────────────────────────
// Serves OpenAPI spec generated from Zod response schemas (SSOT)
// /api/docs      → Swagger UI (interactive documentation)
// /api/docs-json → Raw JSON spec (consumed by openapi-typescript)
const swaggerUi = require("swagger-ui-express");
const { contractOpenApiDoc } = require("./src/config/openapi");
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(contractOpenApiDoc, {
    customSiteTitle: "DentalSaaS API Contracts",
    customCss: ".swagger-ui .topbar { display: none; }",
}));
app.get("/api/docs-json", (req, res) => {
    res.json(contractOpenApiDoc);
});

// Phase A+: Internal monitoring endpoints (no auth required — boolean flags only)
const authHealthRoutes = require("./src/routes/internal/authHealth.routes");
app.use("/api/internal", authHealthRoutes);
app.use("/api/public", platformPublicRoutes);

// Public share-link resolver (token-gated, no auth). The token is the
// capability; the controller enforces expiration + asset contract.
app.use("/api/v1/public/share-links", require("./src/modules/share/routes/shareLink.routes"));

// Audit loggers are read-only observers — safe to mount globally
app.use(auditLogger);
app.use(platformAuditLogger);
// Note: subscriptionGuard is NOT mounted globally (v13.3).
// It is scoped to org routes only — see v1Router below.

// Phase 4 / Phase 7 — authTraceMiddleware is OPT-IN only.
// Set ENABLE_AUTH_TRACE=true to enable verbose authorization decision logging.
// Default: OFF — zero overhead in normal operation.
// Use during debugging sessions or security audits only.
if (process.env.ENABLE_AUTH_TRACE === "true") {
    const { authTraceMiddleware } = require("./src/middleware/authTraceMiddleware");
    app.use(authTraceMiddleware);
    logger.info({ service: "app" }, "[BOOT] authTraceMiddleware mounted (ENABLE_AUTH_TRACE=true)");
}



// ─── API Version 1 Mapping ───
const v1Router = express.Router();

v1Router.use("/auth", authRoutes);
v1Router.use("/organizations", organizationRoutes);

// v1Router.use("/platform", platformRoutes); // MOUNTED BELOW as top-level /api/platform

// Phase S2: These routes have been migrated into orgV1Routes.js
// 308 redirects preserve backward compatibility for any external callers.
v1Router.use("/families",     legacyRouteRedirect("/api/v1/org/families"));
v1Router.use("/appointments", legacyRouteRedirect("/api/v1/org/appointments"));
v1Router.use("/recalls",      legacyRouteRedirect("/api/v1/org/recalls"));
v1Router.use("/settings",     legacyRouteRedirect("/api/v1/org/settings"));

// ─── Patient Domain Engine (v1.6.0) ──────────────
const patientDomainRoutes = require("./src/modules/patientDomain/patientDomain.routes");
v1Router.use("/patient/domain", patientDomainRoutes);

// DEPRECATED: These will be removed in v1.7.0 in favor of /patient/domain
v1Router.use("/patient/booking", bookingLimiter, patientBookingRoutes);
v1Router.use("/patient/portal", patientPortalRoutes);

// Staff-Side Modulation
v1Router.use("/org/booking-requests", patientBookingApprovalRoutes);

// ─── Phase H.3: Legacy Settings Path Redirects (307) ────────────────────────
// These MUST be mounted BEFORE v1Router.use('/org', ...) so Express matches
// them first. After the basePath change in featureRegistry, moduleLoader mounts
// at /org/settings/security and /org/settings/features. Without these redirects,
// any caller still using the old paths would get a 404.
//
// Route: /api/v1/org/security/*   → /api/v1/org/settings/security/*
// Route: /api/v1/org/features-control/* → /api/v1/org/settings/features/*
v1Router.use("/org/security",          createLegacySettingsRedirect("/api/v1/org/settings/security"));
v1Router.use("/org/features-control",  createLegacySettingsRedirect("/api/v1/org/settings/features"));

// Org v1 Routes — loaded via moduleLoader engine
const orgV1Routes = require("./src/routes/orgV1Routes");
// Org middleware chain (full capability resolution pipeline):
//   protect                     → verifies org JWT, sets req.user + req.context (Phase 7)
//   featureFlagMiddleware        → resolves per-org FeatureFlag overrides → req.featureFlags
//   orgSubscriptionGuard         → loads OrgContract + PlanVersion → req.planCapabilities + subscription enforcement
//   branchContextMiddleware      → resolves branch from JWT/query → req.context.branchId
//   unifiedCapabilityMiddleware  → merges req.planCapabilities + req.featureFlags → req.capabilities (SSOT)
//                                  requireEntitlement() in moduleLoader reads req.capabilities.modules
//   orgWriteLock                 → Phase 8 seam: 503 on mutating methods when org.writeLocked (inert Day-1)
//   rlsContext                   → Phase F: attaches frozen req.rls (organizationId, branchId, userId)
//   secureFlowMiddleware         → Phase F.10: no-op (per-org DB isolation is sole tenant boundary)
//   orgV1Routes                  → all controllers read req.capabilities + req.context
v1Router.use("/org", protect, featureFlagMiddleware,
    orgSubscriptionGuard,
    branchContextMiddleware,
    unifiedCapabilityMiddleware,
    maintenanceGuard,
    orgRequestCounter,
    orgWriteLock,
    rlsContext, secureFlowMiddleware(), orgV1Routes);
// Phase S2: /org/addons moved inside orgV1Routes — no separate mount needed

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE C — CANONICAL ROUTE ENFORCEMENT (Replaces Phase 12 Legacy Mounts)
// ═══════════════════════════════════════════════════════════════════════════════
//
// All org module routes are now served EXCLUSIVELY via /api/v1/org/* through
// the moduleLoader engine in orgV1Routes.js. The legacy direct mounts have
// been replaced with 308 Permanent Redirects for backward compatibility.
//
// 308 (not 301) is used to PRESERVE the HTTP method across redirects.
// This is critical: 301 can downgrade POST→GET in some HTTP clients.
//
// The redirects serve as a safety net during the transition period.
// Once all consumers are confirmed to use canonical paths, these
// redirects should be replaced with 410 Gone.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a 308 Permanent Redirect handler for legacy org module routes.
 * Named function for Express stack inspection by validateNoLegacyRoutes.
 * @param {string} canonicalBase — target canonical prefix (e.g., "/api/v1/org/users")
 */
function legacyRouteRedirect(canonicalBase) {
    return function legacyRouteRedirect(req, res) {
        const suffix = req.url || "";
        const target = canonicalBase + suffix;
        logger.warn({
            event: "LEGACY_ROUTE_REDIRECT",
            from: req.originalUrl,
            to: target,
            method: req.method,
            ip: req.ip,
        }, `[Phase C] Legacy route redirected: ${req.originalUrl} → ${target}`);
        res.redirect(308, target);
    };
}

v1Router.use("/users",             legacyRouteRedirect("/api/v1/org/users"));
v1Router.use("/roles",             legacyRouteRedirect("/api/v1/org/roles"));
v1Router.use("/branches",          legacyRouteRedirect("/api/v1/org/branches"));
v1Router.use("/procedures",        legacyRouteRedirect("/api/v1/org/procedures"));
v1Router.use("/treatments",        legacyRouteRedirect("/api/v1/org/treatments"));
v1Router.use("/invoices",          legacyRouteRedirect("/api/v1/org/invoices"));
v1Router.use("/payments",          legacyRouteRedirect("/api/v1/org/payments"));
v1Router.use("/finance",           legacyRouteRedirect("/api/v1/org/finance"));
v1Router.use("/orthodontic-cases", legacyRouteRedirect("/api/v1/org/orthodontic-cases"));

// ─── Phase 6: Shared Case Public Routes (Magic Links) ──────────────────────
// Public endpoints — NO auth required. Token-based access with rate limiting.
// NOT org-scoped — uses its own token-based auth. Must stay under /api/v1/shared.
const sharedCaseRoutes = require("./src/modules/orthodontics/routes/sharedCase.routes");
v1Router.use("/shared", sharedCaseRoutes);

// ─── Phase 5+6: Patient Portal & Remote Monitoring Routes ───────────────────
const portalAuthRoutes = require("./src/modules/patientPortal/routes/portalAuth.routes");
const portalMonitoringRoutes = require("./src/modules/patientPortal/routes/portalMonitoring.routes");
const portalAccessRoutes = require("./src/modules/patientPortal/routes/portalAccess.routes");

// Staff-facing route: mounted BEFORE portalAuthRoutes so Express matches it first.
// orgProtect sets req.user + req.organizationId. organizationContext validates org.
// rlsContext builds req.rls for secureModel in the auth service.
const portalAuthCtrl = require("./src/modules/patientPortal/controllers/portalAuth.controller");
v1Router.post("/portal/auth/magic-link/generate", ...orgProtect, organizationContext, rlsContext, portalAuthCtrl.generateMagicLink);

v1Router.use("/portal/auth", portalAuthRoutes);
v1Router.use("/portal/access", portalAccessRoutes);
v1Router.use("/portal", portalMonitoringRoutes);

// Sprint 2: Org entitlements endpoint (tenant-level capability self-serve)
const orgEntitlementRoutes = require("./src/routes/orgEntitlement.routes");
v1Router.use("/org/entitlements", protect, orgProtect, organizationContext, orgEntitlementRoutes);

// ─── Supervisor Plane Routes (Academic Supervision) ─────────────────────────
// Completely isolated from org middleware chain.
// Uses its own auth (supervisorProtect) and access guard (supervisorAccessGuard).
// NO orgProtect, NO subscriptionGuard, NO organizationContext.
const supervisorRoutes = require("./src/modules/supervisor/routes/supervisor.routes");
v1Router.use("/supervisor", supervisorRoutes);

// Mount v1
app.use("/api/v1", v1Router);

// ─── Platform Guard Imports (used by Bull Board, Admin, Governance) ──────────
const platformProtectMw = require("./src/middleware/platformProtect");
const superAdminOnlyMw = require("./src/middleware/superAdminOnly");

// ─── Bull Board — Queue Dashboard (superadmin only) ───────────────────────────
// Route: GET /admin/queues  — Real-time queue monitoring (6 queues)
try {
    const { getBullBoardRouter } = require("./src/infrastructure/bullBoard");
    // v23.1 Security Hardening — Sentinel AUDIT-003
    // Bull Board exposes live queue internals (job counts, payloads, Redis state).
    // Must be gated behind platformProtect + superAdminOnly to prevent unauthenticated access.
    app.use("/admin/queues", platformProtectMw, superAdminOnlyMw, getBullBoardRouter());
    logger.info({ service: "app", path: "/admin/queues" }, "[BullBoard] Queue dashboard mounted");
} catch (bbErr) {
    logger.warn({ err: bbErr.message }, "[BullBoard] Could not mount dashboard (non-fatal)");
}

/**
 * GET /admin/debug/email
 * Sends a test email DIRECTLY via Nodemailer (bypasses the queue entirely).
 * Returns the Ethereal preview URL in the JSON response.
 * Use this to isolate SMTP issues from queue/worker issues.
 *
 * v23.1 Security Hardening — Sentinel AUDIT-002
 * Guards: platformProtect + superAdminOnly (platform token required)
 * Disabled in production — returns 404. Dev/staging only.
 */
app.get("/admin/debug/email", platformProtectMw, superAdminOnlyMw, async (req, res) => {
    // Production block — this endpoint must never be reachable in prod
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ message: "Not available in production" });
    }
    try {
        const nodemailer = require("nodemailer");
        const { renderTemplate } = require("./src/email/engine/renderTemplate");

        // Create a fresh Ethereal account for this test
        const account = await nodemailer.createTestAccount();
        const transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: { user: account.user, pass: account.pass },
        });

        // Render a real template
        const html = renderTemplate("magicLink", {
            name: "Debug Test User",
            email: account.user,
            magicLink: "https://platform.dentalsaas.dev/auth?token=DEBUG_TEST_123",
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        });

        const info = await transporter.sendMail({
            from: '"DentalSaaS Platform" <noreply@platform.local>',
            to: account.user,
            subject: "[DEBUG] Email Pipeline Test — " + new Date().toISOString(),
            html,
        });

        const previewUrl = nodemailer.getTestMessageUrl(info);

        logger.info({ messageId: info.messageId, previewUrl }, "[DEBUG/email] Test email sent");
        console.log(`\n📭 EMAIL DEBUG — Preview URL:\n   ${previewUrl}\n`);

        return res.json({
            success: true,
            messageId: info.messageId,
            previewUrl,
            smtpUser: account.user,
            sentAt: new Date().toISOString(),
            note: "Direct SMTP test — bypasses queue. Open previewUrl to see the email.",
        });
    } catch (err) {
        logger.error({ err: err.message }, "[DEBUG/email] Direct email test failed");
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.get("/admin/test-queue", platformProtectMw, superAdminOnlyMw, async (req, res) => {
    try {
        const { emailQueue } = require("./src/infrastructure/queues/emailQueue");
        const job = await emailQueue.add("TEST_EMAIL", {
            type: "TEST_EMAIL",
            payload: { email: "queue-test@internal.dental-saas.dev", name: "Queue Test", subject: "Queue Health Check" }
        });
        res.json({ success: true, jobId: job.id, queue: "emailQueue", message: "Test job enqueued" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get("/admin/queue-health", platformProtectMw, superAdminOnlyMw, async (req, res) => {
    try {
        const { emailQueue } = require("./src/infrastructure/queues/emailQueue");
        const { smsQueue, whatsappQueue } = require("./src/infrastructure/queues/channelQueues");
        const { emailDLQ } = require("./src/infrastructure/queues/deadLetterQueue");
        const redis = require("./src/infrastructure/redis/redisClient");

        const [emailCounts, smsCounts, waCounts, dlqCounts] = await Promise.all([
            emailQueue.getJobCounts("waiting", "active", "completed", "failed"),
            smsQueue.getJobCounts("waiting", "active", "completed", "failed"),
            whatsappQueue.getJobCounts("waiting", "active", "completed", "failed"),
            emailDLQ.getJobCounts("waiting", "active", "completed", "failed"),
        ]);

        res.json({
            success: true,
            redis: { status: redis.status, connected: redis.status === "ready" },
            queues: {
                emailQueue: emailCounts,
                smsQueue: smsCounts,
                whatsappQueue: waCounts,
                emailDLQ: dlqCounts,
            },
            checkedAt: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Essential Legacy Routes (AUTH + PLATFORM — kept for backward compat) ────
// Auth routes are required at /api/auth for the frontend's current baseURL.
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/auth", otpRoutes);
app.use("/api/auth", magicRoutes);
console.log("✅ OTP routes mounted at /api/auth");
app.use("/api/organizations", organizationRoutes);
app.use("/api/platform", platformRoutes);
// registerRouter calls for metadata
registerRouter("platformRoutes", "/api/platform");

// ── Phase 7D: Legacy /core rewrite (DEPRECATED — Remove in v13) ──
// Rewrites /api/platform/core/* → /api/platform/* without redirect.
app.use("/api/platform/core", (req, res, next) => {
    req.url = req.originalUrl.replace("/api/platform/core", "/api/platform");
    next('route');
});

// ─── HIGH-003: Deprecated Legacy Routes ──────────────────────────────────────
// These legacy routes bypassed subscriptionGuard + requireEntitlement.
// All callers must migrate to /api/v1/org/* equivalents.
// Returns 410 Gone with migration guidance.
const deprecatedLegacyHandler = (newPath) => (req, res) => {
    logger.warn({
        event: "DEPRECATED_ROUTE_ACCESS",
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
    }, `[DEPRECATED] Legacy route accessed: ${req.originalUrl}`);
    res.status(410).json({
        success: false,
        error: {
            code: "ROUTE_DEPRECATED",
            message: `This endpoint is deprecated. Use ${newPath} instead.`,
            migration: newPath,
        },
    });
};

app.use("/api/families", deprecatedLegacyHandler("/api/v1/families"));
app.use("/api/appointments", deprecatedLegacyHandler("/api/v1/appointments"));
app.use("/api/recalls", deprecatedLegacyHandler("/api/v1/recalls"));
app.use("/api/settings", deprecatedLegacyHandler("/api/v1/settings"));

// ─── Development-Only Test Routes ────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
    app.get("/api/protected", protect, (req, res) => {
        res.json({
            message: "You accessed protected route",
            user: req.user,
        });
    });

    app.get("/api/org-test", orgProtect, organizationContext, (req, res) => {
        res.json({
            message: "Organization context working",
            organization: req.organization?.name || "Superadmin access",
        });
    });
}

app.get("/", (req, res) => {
    res.send("Dental SaaS API Running...");
});

// ─── Governance Dashboard Serving ─────────────────────────────
// Override CSP for governance dashboard (internal tool, uses inline scripts)
// MED-001 FIX: Scoped static serving to governance/dashboard folder only.
// Previously served __dirname (entire backend root) — exposed .env, app.js, etc.
app.use("/governance", (req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
    );
    next();
});
app.use(
    "/governance",
    express.static(path.join(__dirname, "src", "governance", "dashboard"))
);

// ─── Governance Report API (Phase 17-20) ──────────────────────
// HIGH-001 FIX: Added platformProtect + superAdminOnly guards.
// These endpoints expose internal audit reports and system architecture details.
app.get("/api/governance/report", ...platformProtectMw, superAdminOnlyMw, (req, res) => {
    try {
        const reportPath = path.join(
            __dirname,
            "src",
            "governance",
            "reports",
            "governance-report.json"
        );

        // Bust require cache so dashboard always reflects latest run
        delete require.cache[require.resolve(reportPath)];

        const report = require(reportPath);

        res.json(report);
    } catch (err) {
        res.status(500).json({
            error: "Failed to load governance report",
            details: err.message,
        });
    }
});

app.get("/api/governance/history", ...platformProtectMw, superAdminOnlyMw, (req, res) => {
    try {
        const historyPath = path.join(__dirname, "governance-history.json");
        delete require.cache[require.resolve(historyPath)];
        const history = require(historyPath);
        res.json(history);
    } catch (err) {
        res.json([]);
    }
});

// Global Error Handler must be the last middleware
app.use(errorHandler);

// Phase 6 — BullMQ workers removed.
//   Communication delivery is handled by communication.dispatcher
//   (sync path) and QStash → job.controller (async path), not by
//   in-process worker loops. Notification persistence is now a direct
//   Mongo write inside notification.service.
//
// Previously required here (removed in the Phase 6 cleanup):
//   ./src/infrastructure/workers/communication.worker
//   ./src/infrastructure/workers/emailWorker
//   ./src/infrastructure/workers/smsWorker
//   ./src/modules/notificationDomain/notification.worker
//
// The subscriptions file below is still required — it wires eventBus
// listeners that call notification.service.enqueueNotification.
require("./src/modules/notificationDomain/notification.subscriptions");

// Initialize Phase 1 Domain Subscribers (v3.2)
require("./src/modules/appointmentDomain/events/booking.subscriber").initSubscribers();
require("./src/modules/patientDomain/events/appointment.subscriber").initSubscribers();
require("./src/modules/patientDomain/subscribers/ownership.subscriber").initSubscribers();
require("./src/modules/patientDomain/subscribers/patientAudit.subscriber").initAuditSubscribers();

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE SOVEREIGN GUARD + v19.3 TOPOLOGY AUDIT
// ═══════════════════════════════════════════════════════════════════════════════
const { auditRouterTopology } = require("./src/integrity/routerTopologyAudit");
auditRouterTopology();
verifyArchitecture(app);

module.exports = { app, setShuttingDown: (val) => { shuttingDown = val; } };
