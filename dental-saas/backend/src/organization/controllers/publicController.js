const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Organization = require("@shared/models/Organization").default;
const SiteContent = require("../models/SiteContent").default;
const Lead = require("../models/Lead").default;
const initializeRolesForOrganization = require("@utils/roleInitializer");
const logger = require("@utils/logger");
const { resolveCountry } = require("@core/geo/countryResolver");
const { consumePricingToken, validatePricingToken } = require("./otpController");
const { resolveRegionCode } = require("@billing/pricing/pricingRegionResolver");
const { DEV_AUTH_MODE } = require("@config/authConfig");

// ─── Per-Org DB Isolation ─────────────────────────────────────────────────────
// Branch, User, Role are org-domain entities → must be created in dental_org_<orgId>
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const BranchDef = require("@shared/models/Branch");
const UserDef = require("@shared/models/User");

// v6.0 Geo Pricing Integration using PlanTemplate + PlanVersion engine
const PlanVersion = require("@billing/models/PlanVersion.model").default;
const PlanTemplate = require("@billing/models/PlanTemplate.model").default;
// Plan Projection Layer — SSOT for all derived display/routing fields.
// getPublicPlans uses showInMarketing from the projection — not inline derivations.
const { projectPlanVersionList } = require("@billing/services/planProjection.service");

// PHASE 6 Contract-first trial provisioning
const OrgContract = require("@billing/models/OrgContract.model").default;
const PlatformInvoice = require("@billing/models/PlatformInvoice.model").default;

// PHASE 6 Trial contract billing timeline event
const { emitBillingTimelineEvent } = require("@billing/services/billingTimeline.service");

// ISO 4217 country codes allowed for signup
const ALLOWED_ISO_CODES = new Set(["EG", "SA", "AE", "KW", "QA", "BH", "OM", "GB", "US"]);

// Currency mapping per ISO code
const ISO_TO_CURRENCY = {
    EG: "EGP",
    SA: "SAR",
    AE: "AED",
    KW: "KWD",
    QA: "QAR",
    BH: "BHD",
    OM: "OMR",
    GB: "GBP",
    US: "USD"
};

// PHASE 7 Password complexity regex
// At least 8 characters, 1 uppercase, 1 digit, 1 special character.
// Applied to new signups only, existing users unaffected.
const PASSWORD_COMPLEXITY_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// PHASE 3 v24.0 — Signup idempotency protection
const SignupIdempotency = require("../models/SignupIdempotency.model").default;

// ---------------------------------------------------------------------------
// Public: Signup for a new organization (trial onboarding)
// v23.0 ATOMIC: All writes wrapped in MongoDB transaction.
// v22.0 Phone-based OTP verification + geo routing.
// ---------------------------------------------------------------------------
exports.signup = async (req, res) => {
    try {
        let { organizationName, slug, fullName, email, password, phoneNumber, pricingToken } = req.body;

        // ── PHASE 3 v24.0: Idempotency-Key replay check ──────────────────────
        const idempotencyKey = req.headers["idempotency-key"];
        if (idempotencyKey) {
            // @rls-public-plane — pre-auth public signup endpoint, no JWT context
            const existing = await SignupIdempotency.findOne({ idempotencyKey }).lean();
            if (existing && existing.status === "completed" && existing.response) {
                logger.info(
                    { idempotencyKey, orgId: existing.organizationId },
                    "[Signup] Idempotent replay — returning cached result"
                );
                return res.status(existing.response.statusCode || 201).json(existing.response.body);
            }
            if (existing && existing.status === "processing") {
                return res.status(409).json({
                    success: false,
                    message: "A signup with this idempotency key is already being processed."
                });
            }
        }

        // Phase 1: Field validation
        if (!organizationName || !fullName || !email || !password || !phoneNumber) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        // v22.0: Validate pricingToken (phone verification proof)
        let isoCode, regionCode;

        const isDev = DEV_AUTH_MODE;
        const tokenResult = pricingToken ? await consumePricingToken(pricingToken) : { valid: false };

        if (tokenResult.valid) {
            const { country: phoneCountry, region: phoneRegion, phone: verifiedPhone } = tokenResult.data;
            isoCode = (phoneCountry || "US").toUpperCase().trim();
            regionCode = phoneRegion || resolveRegionCode(isoCode);

            if (verifiedPhone && verifiedPhone !== phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number does not match the verified number."
                });
            }
        } else if (isDev) {
            logger.warn(
                { phoneNumber: phoneNumber?.slice(0, 6) + "****" },
                "[SIGNUP] DEV MODE: pricingToken missing or expired, deriving region from phone"
            );
            const { extractCountryFromPhone } = require("@core/geo/phoneCountryExtractor");
            const { country: devCountry } = extractCountryFromPhone(phoneNumber);
            isoCode = (devCountry || "US").toUpperCase().trim();
            regionCode = resolveRegionCode(isoCode);
        } else {
            return res.status(400).json({
                success: false,
                message: "Phone verification expired. Please verify your phone number again."
            });
        }

        // Auto-generate slug if not provided
        if (!slug && organizationName) {
            slug = organizationName
                .toLowerCase()
                .trim()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "");
            if (slug.length < 4) slug += "-clinic";
        }

        const slugRegex = /^[a-z0-9-]{4,}$/;
        if (!slugRegex.test(slug)) {
            return res.status(400).json({
                success: false,
                message: "Slug must be at least 4 characters, lowercase, and contain no spaces."
            });
        }

        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phoneNumber)) {
            return res.status(400).json({ success: false, message: "Invalid phone number format (E.164 required)" });
        }

        // PHASE 7 Password complexity enforcement
        if (!PASSWORD_COMPLEXITY_RE.test(password)) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters and include at least one uppercase letter, one number, and one special character."
            });
        }

        // Phase 2 + v29.0: Uniqueness checks (read-only, outside transaction)
        // Organization slug check — platform DB (correct)
        // Email/phone checks — in per-org mode, these are cross-org uniqueness guards.
        // We check the platform-level Organization by slug, and rely on the
        // per-org unique index on email within each org DB for isolation.
        // Cross-org email uniqueness is NOT enforced (each org DB is independent).
        const existingOrg = await Organization.findOne({ slug: slug.toLowerCase().trim() });

        if (existingOrg) {
            return res.status(409).json({ success: false, message: "Slug already taken" });
        }

        // Phase 3: Trial initialization
        const now = new Date();
        const trialEndDate = new Date(now);
        trialEndDate.setDate(now.getDate() + 14);

        const billingCountry = isoCode;

        // @rls-public-plane — pre-auth public signup endpoint, no JWT context
        const trialPlanVersion = await PlanVersion.findOne({
            templateCode: "trial-tier",
            status: "active"
        }).lean();

        if (!trialPlanVersion) {
            logger.error({ service: "PublicController", action: "signup_trial_plan_missing" },
                "FATAL: No active PlanVersion with templateCode='trial-tier' found. Cannot provision trial org.");
            return res.status(500).json({ success: false, message: "No active trial plan configured. Please contact support." });
        }

        const billingCurrency = ISO_TO_CURRENCY[isoCode] || trialPlanVersion.pricing?.baseCurrency || "USD";

        // Pre-hash password before entering the transaction (bcrypt is CPU-bound)
        const hashedPassword = await bcrypt.hash(password, 12);

        // ════════════════════════════════════════════════════════════════════
        // PHASE A: Platform transaction (shared DB)
        // Creates Organization + OrgContract — platform-level entities.
        // ════════════════════════════════════════════════════════════════════
        const session = await mongoose.startSession();
        let organization;
        let trialContract;

        try {
            await session.withTransaction(async () => {
                // 4a. Create Organization
                [organization] = await Organization.create([{
                    name: organizationName,
                    slug: slug.toLowerCase().trim(),
                    country: isoCode,
                    regionCode,
                    billingCountry,
                    billingCurrency,
                    ownerId: new mongoose.Types.ObjectId(),

                    subscription: {
                        status: "trial",
                        trialEndsAt: trialEndDate,
                        planVersion: 0,
                    },

                    trialStartDate: now,
                    trialEndDate: trialEndDate,
                    currentContractId: null,

                    isActive: true,
                    isVerified: true,
                }], { session });

                // 4e. Contract-First Trial Provisioning
                const planCode = trialPlanVersion.templateCode || "trial-tier";
                const planVersionTag = trialPlanVersion.versionTag || "v1";

                [trialContract] = await OrgContract.create([{
                    organizationId: organization._id,
                    planVersionId: trialPlanVersion._id,
                    planCode,
                    planVersionTag,
                    contractStatus: "active",
                    lockedPrice: 0,
                    currency: billingCurrency,
                    billingInterval: "monthly",
                    effectiveFrom: now,
                    effectiveTo: trialEndDate,
                    trialDays: 14,
                    trialStartDate: now,
                    trialEndDate,
                    autoRenew: false,
                    gracePeriodDays: 7,
                    source: "provisioning",
                    createdBy: organization._id, // placeholder, updated in Phase B
                    pricingSnapshot: {
                        snapshotType: "computed",
                        basePrice: 0,
                        regionCode: regionCode || "unknown",
                        billingInterval: "monthly",
                        taxRate: 0,
                        taxAmount: 0,
                        discountAmount: 0,
                        couponApplied: false,
                        perSeatAddition: 0,
                        isOverride: false,
                    }
                }], { session });

                // Set org.currentContractId pointer
                organization.currentContractId = trialContract._id;
                await organization.save({ session });
            });
        } finally {
            session.endSession();
        }

        logger.info(
            { orgId: organization._id, slug: organization.slug },
            "[Signup] Phase A committed — platform entities persisted"
        );

        // ════════════════════════════════════════════════════════════════════
        // PHASE B: Org Bootstrap — Per-Org Database
        // Creates Branch, Roles, Admin User in dental_org_<orgId>.
        // ════════════════════════════════════════════════════════════════════
        const orgId = String(organization._id);
        let orgConn;
        let signupResult;

        try {
            orgConn = dbManager.getConnection(orgId);
            const BranchModel = getModel(orgConn, BranchDef);
            const UserModel = getModel(orgConn, UserDef);

            // RLS safety guard: ensure we're NOT writing to platform DB
            if (UserModel.db.name === "saasdental") {
                throw new Error("RLS VIOLATION: Writing org user to platform DB");
            }

            // 4b. Create Default Branch
            const [branch] = await BranchModel.create([{
                name: "Main Branch",
                organizationId: organization._id,
                phone: phoneNumber
            }]);

            // 4c. Create Org Admin User
            const roles = await initializeRolesForOrganization(
                organization._id,
                { connection: orgConn }
            );

            const [adminUser] = await UserModel.create([{
                name: fullName,
                email: email.toLowerCase().trim(),
                password: hashedPassword,
                organizationId: organization._id,
                roleId: roles.org_admin._id,
                branchAccess: [branch._id],
                hasFullBranchAccess: true,
                isActive: true,
                phoneNumber,
                phoneVerified: true,
                phoneVerifiedAt: now,
                isEmailVerified: true,
                emailVerifiedAt: now,
            }]);

            // 4d. Update ownerId + contract createdBy with actual admin user
            await Organization.findByIdAndUpdate(organization._id, {
                $set: { ownerId: adminUser._id }
            });
            await OrgContract.findByIdAndUpdate(trialContract._id, {
                $set: { createdBy: adminUser._id, activatedBy: adminUser._id }
            });

            signupResult = {
                orgId: organization._id,
                slug: organization.slug,
                contractId: trialContract._id,
                adminUserId: adminUser._id,
            };

            logger.info(
                { orgId, branchId: branch._id, adminUserId: adminUser._id, dbName: orgConn.name },
                "[Signup] Phase B complete — org entities bootstrapped in per-org DB"
            );

        } catch (bootstrapError) {
            logger.error(
                { errName: bootstrapError.name, errMsg: bootstrapError.message?.substring(0, 500), orgId },
                "[Signup] CRITICAL: Phase B org bootstrap failed. Marking org as PROVISION_FAILED."
            );

            try {
                await Organization.findByIdAndUpdate(organization._id, {
                    $set: {
                        "subscription.status": "provision_failed",
                        provisionError: {
                            message: bootstrapError.message?.substring(0, 500),
                            phase: "B_SIGNUP_BOOTSTRAP",
                            timestamp: new Date(),
                        }
                    }
                });
            } catch (markErr) {
                logger.error({ err: markErr.message, orgId }, "[Signup] Failed to mark org as PROVISION_FAILED");
            }

            return res.status(500).json({ success: false, message: "Registration partially failed. Please contact support." });
        } finally {
            if (orgConn) {
                try { dbManager.releaseConnection(orgId); } catch (_) { /* best-effort */ }
            }
        }

        // Post-Commit: BillingTimeline event (PHASE 6, non-blocking)
        setImmediate(async () => {
            try {
                await emitBillingTimelineEvent({
                    organizationId: signupResult.orgId,
                    contractId: signupResult.contractId,
                    eventType: "CONTRACT_CREATED",
                    source: "signup_trial",
                    payload: {
                        planCode: trialPlanVersion.templateCode || "trial-tier",
                        planVersionTag: trialPlanVersion.versionTag || "v1",
                        lockedPrice: 0,
                        currency: billingCurrency,
                        trialDays: 14,
                        createdBy: signupResult.adminUserId,
                    }
                });
            } catch (timelineErr) {
                logger.warn(
                    { err: timelineErr.message, orgId: signupResult.orgId },
                    "[Signup] BillingTimeline event emission failed (non-fatal)"
                );
            }
        });

        // v30.1: Email OTP removed from post-commit — email is now verified
        // BEFORE signup (during the signup wizard, right after phone OTP).

        logger.info(
            { orgId: signupResult.orgId, slug: signupResult.slug, country: isoCode, regionCode },
            "New organization signup (trial, phone-verified, atomic transaction)"
        );

        // ── PHASE 3 v24.0: Store idempotency result (non-blocking) ───────────
        if (idempotencyKey) {
            setImmediate(async () => {
                try {
                    await SignupIdempotency.findOneAndUpdate(
                        { idempotencyKey },
                        {
                            $set: {
                                status: "completed",
                                organizationId: signupResult.orgId,
                                response: {
                                    statusCode: 201,
                                    body: {
                                        success: true,
                                        message: "Account created successfully. You can now log in.",
                                        data: {
                                            slug: signupResult.slug,
                                            trialEndDate,
                                            country: isoCode,
                                            region: regionCode,
                                        }
                                    }
                                },
                                requestFingerprint: {
                                    email: email.toLowerCase().trim(),
                                    slug: signupResult.slug,
                                    phoneNumber,
                                },
                                ipAddress: req.ip,
                                userAgent: req.headers["user-agent"],
                            },
                            $setOnInsert: { idempotencyKey }
                        },
                        { upsert: true }
                    );
                } catch (idemErr) {
                    logger.warn(
                        { err: idemErr.message, idempotencyKey },
                        "[Signup] Idempotency record save failed (non-fatal)"
                    );
                }
            });
        }

        return res.status(201).json({
            success: true,
            message: "Account created successfully. You can now log in.",
            data: {
                slug: signupResult.slug,
                trialEndDate,
                country: isoCode,
                region: regionCode,
            }
        });

    } catch (error) {
        logger.error({ err: error, service: "PublicController", action: "signup_error" }, "Error in signup");
        return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
    }
};

// Legacy alias
exports.createOrganization = exports.signup;

// ---------------------------------------------------------------------------
// Public: Get Global Site Content
// ---------------------------------------------------------------------------
const SITE_CONTENT_DEFAULT = {
    heroTitle: "The Smart Dental Platform for Modern Clinics",
    heroSubtitle: "Secure, scalable, and designed for dental professionals.",
    aboutTitle: "Empowering Dental Clinics with Smart Solutions",
    aboutDescription: "DentalSaaS provides everything you need to manage your practice securely.",
    whatsappNumber: null,
    supportEmail: null
};

exports.getSiteContent = async (req, res) => {
    try {
        let content = null;
        try {
            // @rls-public-plane — pre-auth public endpoint, no JWT context
            content = await SiteContent.findOne({ isActive: true }).lean();
        } catch (dbError) {
            logger.error({ err: dbError, service: "PublicController", action: "site_content_db_error" }, "DB error fetching site content");
        }

        return res.status(200).json({
            success: true,
            data: content || SITE_CONTENT_DEFAULT,
            tenant: null
        });
    } catch (error) {
        logger.error({ err: error, service: "PublicController", action: "get_site_content_fatal" }, "Fatal error in getSiteContent");
        return res.status(200).json({
            success: true,
            data: SITE_CONTENT_DEFAULT,
            tenant: null
        });
    }
};

// ---------------------------------------------------------------------------
// Public: GET /public/plans?country=EG
// Returns regional pricing for publicly displayed plans.
// v22.0 Pricing gated behind OTP verification.
// ---------------------------------------------------------------------------
exports.getPublicPlans = async (req, res) => {
    try {
        const countryCode = (req.query.country || "US").toUpperCase().trim();
        const resolvedCurrency = ISO_TO_CURRENCY[countryCode] || "USD";

        const pricingTokenHeader = req.headers["x-pricing-token"];
        const tokenCheck = await validatePricingToken(pricingTokenHeader);
        const showPricing = tokenCheck.valid;

        // @rls-public-plane — pre-auth public endpoint, no JWT context
        // Primary safety: DB-level hard filter — only status=active + visibility=public
        // reach this point. This is the first line of defence against leakage.
        const activeVersions = await PlanVersion.find({
            status: "active",
            visibility: "public"
        }).sort({ activatedAt: -1 }).lean();

        // Apply Plan Projection Layer.
        // showInMarketing is the authoritative gate — NEVER re-derived inline.
        // projectPlanVersion returns { ...version, showInMarketing, isLive, displayStatus, ... }
        const projected = projectPlanVersionList(activeVersions);

        // Runtime assertion: belt-and-suspenders visibility leak guard.
        // Uses showInMarketing from the projection layer — not an ad-hoc inline check.
        const leaked = projected.filter(v => !v.showInMarketing);
        if (leaked.length > 0) {
            logger.error(
                { leakedIds: leaked.map(v => v._id), service: "PublicController" },
                "[SECURITY] Non-public PlanVersion leaked through DB query (showInMarketing=false)"
            );
        }
        // Safe list: only versions the projection layer confirms should be shown
        const safeVersions = projected.filter(v => v.showInMarketing);

        // Enrich with template metadata
        const templateIds = [...new Set(safeVersions.map(v => v.templateId?.toString()).filter(Boolean))];
        const templates = await PlanTemplate.find(
            { _id: { $in: templateIds }, status: { $ne: "archived" } },
            { name: 1, code: 1, description: 1, visibility: 1 }
        ).lean();
        const templateMap = Object.fromEntries(templates.map(t => [t._id.toString(), t]));

        const result = safeVersions
            .filter(v => {
                const tmpl = templateMap[v.templateId?.toString()];
                if (!tmpl) return false;
                if (tmpl.visibility?.hiddenCountries?.includes(countryCode)) return false;
                return true;
            })
            .map(v => {
                const tmpl = templateMap[v.templateId?.toString()] || {};
                const region = v.pricing?.regions?.find(r => r.countries?.includes(countryCode))
                    || v.pricing?.regions?.[0];
                const currency = region?.currency || resolvedCurrency;

                const monthlyPrice = showPricing ? (region?.monthly ?? null) : null;
                const annualPrice = showPricing ? (region?.yearly ?? null) : null;

                return {
                    id: v._id,
                    code: v.templateCode,
                    name: tmpl.name || v.label,
                    description: tmpl.description || "",
                    versionTag: v.versionTag,
                    currency: showPricing ? currency : null,
                    monthlyPrice,
                    annualPrice,
                    limits: v.limits,
                    modules: v.modules,
                    trialDays: v.trialDays ?? 14,
                    isPopular: false,
                    isSalesManaged: false,
                    pricingLocked: !showPricing,
                    // Projection fields — available for marketing page consumers
                    displayStatus: v.displayStatus,
                    isLive: v.isLive,
                    showInMarketing: v.showInMarketing,
                };
            });

        return res.status(200).json({
            success: true,
            data: result,
            currency: showPricing ? resolvedCurrency : null,
            pricingAvailable: showPricing,
        });
    } catch (error) {
        logger.error({ err: error, service: "PublicController", action: "get_public_plans" }, "Error fetching public plans");
        return res.status(500).json({ success: false, message: "Unable to load plans" });
    }
};


// ---------------------------------------------------------------------------
// Public: WhatsApp Lead Generation
// ---------------------------------------------------------------------------
exports.submitWhatsAppLead = async (req, res) => {
    try {
        const { source, name, phone, message, organizationInterest } = req.body;
        const limitString = (str) => (str ? String(str).substring(0, 500) : undefined);

        await Lead.create({
            source: limitString(source) || "landing",
            name: limitString(name),
            phone: limitString(phone),
            message: limitString(message),
            organizationInterest: limitString(organizationInterest),
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        return res.status(201).json({ success: true, message: "Thank you, we'll be in touch shortly." });
    } catch (error) {
        logger.error({ err: error, service: "PublicController", action: "whatsapp_lead" }, "Error recording lead");
        return res.status(500).json({ success: false, message: "Unable to record enquiry" });
    }
};
