const mongoose = require("mongoose");
const Organization = require("@shared/models/Organization").default;
const featureService = require("@services/featureService");
const initializeRolesForOrganization = require("@utils/roleInitializer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const logger = require("@utils/logger");

// ─── Per-Org DB Isolation (v2.0) ─────────────────────────────────────────────
// All org-domain entities (Branch, User, Role, AuditLog) are created in the
// per-org database (dental_org_<orgId>) via getModel(orgConn, Def).
// Platform entities (Organization, OrgContract, PlatformInvoice) remain in shared DB.
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const BranchDef = require("@shared/models/Branch");
const UserDef = require("@shared/models/User");
const AuditLogDef = require("@shared/models/AuditLog");

// ─── Contract-First Trial Provisioning (TDS) ─────────────────────────────────
// Every new org MUST receive an activated trial OrgContract at creation.
// No org can exist without currentContractId.
// PHASE 8 — PLANE-001 fix: All cross-plane imports use module aliases.
const {
  createContract
} = require("@billing/services/contractEngine.service");
const {
  activateContract
} = require("@billing/services/contractActivation.service");
const PlanVersion = require("@billing/models/PlanVersion.model").default;
const PlatformInvoice = require("@billing/models/PlatformInvoice.model").default;

// ─── Hybrid Onboarding Billing (Sprint 8) ────────────────────────────────────
// Post-trial pending contract scheduling + billing timeline events.
const OrgContract = require("@billing/models/OrgContract.model").default;
const {
  computePrice
} = require("@billing/pricing/pricingEngine.service");
const {
  emitBillingTimelineEvent
} = require("@billing/services/billingTimeline.service");

// ─── Audit Service ───────────────────────────────────────────────────────────
const auditService = require("@services/auditService");

// ════════════════════════════════════════════════════════════════════════════════
// PHASE 2 BOOTSTRAP — Org-domain entity creation
// Creates Branch, Roles, Admin User, AuditLog in the per-org database.
// Uses getModel(orgConn, Def) for full per-org DB isolation.
//
// CRITICAL: This runs AFTER the platform transaction has committed.
//           No platform session is passed — different DB scope.
// ════════════════════════════════════════════════════════════════════════════════
async function bootstrapOrganizationData({
  organization,
  organizationName,
  adminEmail,
  hashedPassword,
  platformUserId,
  derivedRegionCode,
  derivedBillingCurrency,
  country,
  ip,
  userAgent,
  orgConn // ← per-org DB connection (REQUIRED)
}) {
  // ── Resolve models on org DB ──────────────────────────────────────────────
  const BranchModel = getModel(orgConn, BranchDef);
  const UserModel = getModel(orgConn, UserDef);

  // RLS safety guard: ensure we're NOT writing to platform DB
  if (UserModel.db.name === "saasdental") {
    throw new Error(`RLS VIOLATION: bootstrapOrganizationData resolved UserModel on platform DB ` + `(expected dental_org_${organization._id}). Aborting to prevent cross-plane data leakage.`);
  }

  // ── Branch ────────────────────────────────────────────────────────────────
  // ⚠️ No platform session — different DB = different transaction scope
  const [branch] = await BranchModel.create([{
    name: `${organizationName} Main Branch`,
    type: "internal"
  }]);

  // ── Roles ─────────────────────────────────────────────────────────────────
  const roles = await initializeRolesForOrganization(organization._id, {
    connection: orgConn
  });

  // ── Admin User ────────────────────────────────────────────────────────────
  const [adminUser] = await UserModel.create([{
    firstName: "Organization",
    lastName: "Admin",
    name: "Organization Admin",
    email: adminEmail,
    // Org admin uses their real email — NOT a system-generated org email
    realEmail: adminEmail,
    isSystemGenerated: false,
    username: null,
    password: hashedPassword,
    mustChangePassword: true,
    // Phase 5: Org admin gets doctor role (clinical identity for calendar/scheduling)
    // Full admin access is enforced via platformDesignation = "ORG_ADMIN" (authorityBridge
    // injects ALL org permissions regardless of roleId — see User model §42).
    roleId: roles.doctor?._id || roles.org_admin._id,
    // fallback to org_admin if doctor not seeded
    platformDesignation: "ORG_ADMIN",
    // Phase 5: Default speciality for clinic owners (updated on profile completion)
    speciality: "orthodontist",
    branchAccess: [branch._id],
    hasFullBranchAccess: true,
    // Phase 4: Self-provisioned admins have a complete profile (skip the gate).
    // Staff created by admin will have profile.isComplete = false.
    profile: {
      isComplete: true,
      completedAt: new Date()
    }
  }]);

  // ── Audit Log ─────────────────────────────────────────────────────────────
  // Uses auditService which routes platform_user events to platform DB.
  // This is correct: provisioning is a platform action, so the audit record
  // goes to the platform audit chain (actorType: "platform_user").
  await auditService.createAuditRecord({
    branchId: branch._id,
    regionCode: derivedRegionCode,
    actorId: platformUserId,
    actorType: "platform_user",
    action: "ORG_CREATED",
    success: true,
    details: `Provisioned org: ${organizationName} | country: ${country} | region: ${derivedRegionCode} | currency: ${derivedBillingCurrency}`,
    ipAddress: ip,
    userAgent: userAgent
  });
  return {
    branch,
    roles,
    adminUser
  };
}
exports.provisionOrganization = async (data, platformUserId, ip, userAgent) => {
  const {
    organizationName,
    slug,
    plan,
    status,
    adminEmail,
    trialDays,
    country,
    // ── Sprint 8: Hybrid Onboarding Billing fields ────────────────────────
    trialPlanCode = "trial-tier",
    // allow caller to override trial plan templateCode
    postTrialPlanVersionId,
    // optional: schedule paid contract after trial
    billingInterval = "monthly" // billing cadence for post-trial contract
  } = data;
  if (!organizationName || !adminEmail || !country) {
    throw new Error("Organization name, Admin email, and Country are required");
  }

  // v20.1 Wave4 — ISO code validation (no display-name mapping)
  const allowedCountries = ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "GB", "US"];
  if (!allowedCountries.includes(country)) {
    throw new Error(`Invalid country code: expected one of ${allowedCountries.join(", ")}`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE A: Platform transaction (shared DB)
  // Creates Organization, Contract, Invoice — all platform-level entities.
  // This transaction is committed BEFORE org bootstrap begins.
  // ════════════════════════════════════════════════════════════════════════
  const session = await mongoose.startSession();
  session.startTransaction();
  let organization;
  let activeContract;
  let updatedOrg;
  let trialEndDate;
  let derivedRegionCode;
  let derivedBillingCurrency;
  let derivedBillingCountry;
  let hashedPassword;
  let tempPassword;
  let pendingContract = null;
  let selectedPlan = null;
  let preview = null;
  let trialPlanVersion;
  try {
    // 1. Validate uniqueness
    // @rls-platform-service — org creation/provisioning, no org-scoped req context
    const existingOrg = await Organization.findOne({
      $or: [{
        name: organizationName
      }, ...(slug ? [{
        slug
      }] : [])]
    }).session(session);
    if (existingOrg) {
      throw new Error("Organization name or slug already in use");
    }
    const now = new Date();
    const trialPeriod = parseInt(trialDays) || 14;

    // ─── 2a. Auto-derive commercial fields from country ISO code ──────────────
    const REGION_MAP = {
      EG: "MEA",
      SA: "MEA",
      AE: "MEA",
      KW: "MEA",
      QA: "MEA",
      BH: "MEA",
      OM: "MEA",
      GB: "EU",
      US: "US"
    };
    const CURRENCY_MAP = {
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
    derivedRegionCode = REGION_MAP[country] || "MEA";
    derivedBillingCurrency = CURRENCY_MAP[country] || "USD";
    derivedBillingCountry = country;

    // ─── 2b. planId (legacy field) REMOVED ──────────────────────────────────
    const resolvedPlanId = null;
    logger.info({
      country,
      derivedRegionCode,
      derivedBillingCurrency
    }, `[Provision] Derived commercial context for: ${organizationName}`);

    // ─── 2c. Resolve PlanVersion for trial contract ──────────────────────────
    // @rls-platform-service — org creation/provisioning, no org-scoped req context
    trialPlanVersion = await PlanVersion.findOne({
      templateCode: trialPlanCode,
      status: "active"
    }).session(session).lean();
    if (!trialPlanVersion) {
      throw new Error(`[Provision] FATAL: NO_ACTIVE_TRIAL_PLAN_VERSION. ` + `No active PlanVersion found with templateCode='${trialPlanCode}'. ` + `Seed a PlanTemplate with code='${trialPlanCode}' and publish an active PlanVersion before provisioning.`);
    }

    // ─── 2d. Eagerly resolve post-trial PlanVersion (if scheduled) ───────────
    if (postTrialPlanVersionId) {
      // @rls-platform-service — org creation/provisioning, no org-scoped req context
      selectedPlan = await PlanVersion.findById(postTrialPlanVersionId).session(session).lean();
      if (!selectedPlan) {
        throw new Error(`[Provision] POST_TRIAL_PLAN_NOT_FOUND: PlanVersion ${postTrialPlanVersionId} not found.`);
      }
      if (selectedPlan.status !== "active") {
        throw new Error(`[Provision] POST_TRIAL_PLAN_NOT_ACTIVE: PlanVersion ${postTrialPlanVersionId} ` + `has status='${selectedPlan.status}'. Only active versions can be scheduled.`);
      }
    }

    // ─── 2e. Create Organization document ────────────────────────────────────
    trialEndDate = new Date(now.getTime() + trialPeriod * 24 * 60 * 60 * 1000);
    [organization] = await Organization.create([{
      name: organizationName,
      slug: slug || undefined,
      ownerId: platformUserId,
      country,
      regionCode: derivedRegionCode,
      billingCountry: derivedBillingCountry,
      billingCurrency: derivedBillingCurrency,
      isActive: status !== "suspended",
      subscription: {
        status: "trial",
        trialEndsAt: trialEndDate
      },
      trialStartDate: now,
      trialEndDate
    }], {
      session
    });

    // 3. Initialize org features (platform Organization document)
    await featureService.initializeOrgFeatures(organization);
    await featureService.applyPlanFeatures(organization, {
      session
    });

    // 4. Generate temporary password (no DB operation — safe in platform phase)
    tempPassword = crypto.randomBytes(8).toString("hex");
    hashedPassword = await bcrypt.hash(tempPassword, 10);

    // ─── 9. CONTRACT-FIRST TRIAL PROVISIONING (TDS) ──────────────────────────
    const planCode = trialPlanVersion.templateCode || "trial";
    const planVersionTag = trialPlanVersion.versionTag || "v1";

    // 9a. Create draft OrgContract
    const draftContract = await createContract({
      planVersionId: trialPlanVersion._id,
      planCode,
      planVersionTag,
      lockedPrice: 0,
      currency: derivedBillingCurrency,
      billingInterval: "monthly",
      effectiveFrom: now,
      effectiveTo: trialEndDate,
      trialDays: trialPeriod,
      trialStartDate: now,
      trialEndDate,
      paymentProvider: "manual",
      source: "provisioning",
      autoRenew: false,
      gracePeriodDays: 0
    }, platformUserId, {
      session
    });
    logger.info({
      contractId: draftContract._id,
      orgId: organization._id
    }, "[Provision] Trial draft contract created");

    // 9b. Create $0 trial invoice — pre-marked as "paid"
    const [trialInvoice] = await PlatformInvoice.create([{
      contractId: draftContract._id,
      planVersionId: trialPlanVersion._id,
      invoiceType: "initial",
      billingCycleStart: now,
      billingCycleEnd: trialEndDate,
      dueDate: now,
      currency: derivedBillingCurrency,
      lineItems: [{
        description: `Trial Period — ${planCode} (${trialPeriod} days)`,
        quantity: 1,
        unitPrice: 0,
        unitPriceMinor: 0,
        total: 0,
        totalMinor: 0,
        type: "plan"
      }],
      basePlanAmount: 0,
      basePlanAmountMinor: 0,
      subtotalAmount: 0,
      subtotalAmountMinor: 0,
      totalAmount: 0,
      totalAmountMinor: 0,
      status: "paid",
      paymentStatus: "captured",
      paidAt: now,
      paymentProvider: "manual",
      regionCode: derivedRegionCode,
      createdBy: platformUserId,
      idempotencyKey: `trial_${organization._id}_${draftContract._id}`,
      metadata: {
        trialProvisioning: true,
        isTrialActivation: true,
        reason: "trial_provisioning"
      }
    }], {
      session
    });
    logger.info({
      invoiceId: trialInvoice._id,
      orgId: organization._id
    }, "[Provision] Trial $0 invoice created (pre-paid)");

    // 9c. Activate contract — sets org.currentContractId + subscription.status
    ({
      contract: activeContract,
      organization: updatedOrg
    } = await activateContract(draftContract._id, trialInvoice._id, {
      activatedBy: platformUserId,
      session
    }));
    logger.info({
      contractId: activeContract._id,
      currentContractId: updatedOrg.currentContractId
    }, "[Provision] Trial contract activated");

    // ─── 10. INVARIANT: currentContractId MUST be set ────────────────────────
    if (!updatedOrg.currentContractId) {
      throw new Error(`[Provision] FATAL: currentContractId is null after trial contract activation ` + `(orgId=${organization._id}, contractId=${activeContract._id}). ` + `This indicates a bug in contractActivation.service.`);
    }

    // ─── 11. SCHEDULE POST-TRIAL CONTRACT (Sprint 8) ─────────────────────────
    if (selectedPlan) {
      try {
        preview = await computePrice({
          planVersion: selectedPlan,
          billingInterval: billingInterval || "monthly",
          country: derivedBillingCountry,
          provider: "manual"
        });
      } catch (priceErr) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`PRICE_NOT_CONFIGURED_FOR_REGION: computePrice failed for PlanVersion ` + `${selectedPlan._id} in region derived from country='${derivedBillingCountry}'. ` + `Original error: ${priceErr.message}`);
        }
        logger.warn({
          err: priceErr.message,
          planVersionId: selectedPlan._id,
          orgId: organization._id
        }, "[Provision] computePrice failed for post-trial plan — using 0 as fallback (non-production)");
        preview = {
          finalPrice: 0,
          currency: derivedBillingCurrency,
          regionCode: derivedRegionCode,
          snapshot: null
        };
      }
      if (preview.finalPrice == null) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`PRICE_NOT_CONFIGURED_FOR_REGION: computePrice returned null finalPrice ` + `for PlanVersion ${selectedPlan._id} country='${derivedBillingCountry}'.`);
        }
        logger.warn({
          planVersionId: selectedPlan._id,
          orgId: organization._id
        }, "[Provision] Pricing missing — defaulting to 0 (non-production)");
        preview.finalPrice = 0;
      }
      pendingContract = new OrgContract({
        planVersionId: selectedPlan._id,
        planCode: selectedPlan.templateCode,
        planVersionTag: selectedPlan.versionTag,
        lockedPrice: preview.finalPrice,
        currency: preview.currency || derivedBillingCurrency,
        billingInterval: billingInterval || "monthly",
        previousContractId: activeContract._id,
        trialDays: 0,
        effectiveFrom: trialEndDate,
        effectiveTo: null,
        contractStatus: "pending_activation",
        paymentProvider: "manual",
        autoRenew: true,
        gracePeriodDays: 7,
        pricingSnapshot: preview.snapshot || null,
        createdBy: platformUserId,
        source: "provisioning"
      });
      await pendingContract.save({
        session
      });
      logger.info({
        pendingContractId: pendingContract._id,
        orgId: organization._id,
        previousContractId: activeContract._id,
        planCode: selectedPlan.templateCode,
        effectiveFrom: trialEndDate
      }, "[Provision] Post-trial pending contract scheduled");
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE A COMMIT — Platform entities are now persisted.
    // ════════════════════════════════════════════════════════════════════════
    await session.commitTransaction();
    session.endSession();
    logger.info({
      orgId: organization._id
    }, `[Provision] Phase A committed — platform entities persisted for: ${organizationName}`);
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {/* already committed or ended */}
    try {
      session.endSession();
    } catch (_) {/* already ended */}
    logger.error({
      errName: error.name,
      errMsg: error.message?.substring(0, 300)
    }, `Failed to provision organization (Phase A): ${organizationName}`);
    throw error;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE B: Org Bootstrap — Per-Org Database
  // Creates Branch, Roles, Admin User, AuditLog in dental_org_<orgId>.
  //
  // CRITICAL DESIGN:
  //   - Runs AFTER platform transaction is committed
  //   - Uses dbManager.getConnection() for org-specific DB
  //   - Uses getModel(orgConn, Def) for all org-domain models
  //   - NO platform session — different DB = different transaction scope
  //   - On failure: marks org as PROVISION_FAILED (platform entities are safe)
  // ════════════════════════════════════════════════════════════════════════════
  const orgId = String(organization._id);
  let orgConn;
  try {
    // Create per-org connection (dental_org_<orgId>)
    orgConn = dbManager.getConnection(orgId);
    logger.info({
      orgId,
      dbName: `dental_org_${orgId}`
    }, "[Provision] Phase B — Per-org DB connection established");
    const {
      branch,
      roles,
      adminUser
    } = await bootstrapOrganizationData({
      organization,
      organizationName,
      adminEmail: data.adminEmail,
      hashedPassword,
      platformUserId,
      derivedRegionCode,
      derivedBillingCurrency,
      country: data.country,
      ip,
      userAgent,
      orgConn
    });
    logger.info({
      orgId,
      branchId: branch._id,
      adminUserId: adminUser._id,
      roleCount: Object.keys(roles).length
    }, "[Provision] Phase B complete — org entities bootstrapped in per-org DB");

    // ─── 12. EMIT POST-COMMIT BILLING TIMELINE EVENTS (non-blocking) ─────────
    if (pendingContract && selectedPlan) {
      setImmediate(async () => {
        try {
          await emitBillingTimelineEvent({
            contractId: String(activeContract._id),
            eventType: "PLAN_SCHEDULED",
            source: "system",
            payload: {
              fromContractId: String(activeContract._id),
              pendingContractId: String(pendingContract._id),
              fromPlan: trialPlanVersion.templateCode,
              toPlan: selectedPlan.templateCode,
              toPlanVersionId: String(selectedPlan._id),
              changeType: preview.finalPrice > 0 ? "upgrade" : "downgrade",
              effectiveFrom: trialEndDate.toISOString(),
              billingInterval: billingInterval || "monthly"
            }
          });
        } catch (evtErr) {
          logger.warn({
            err: evtErr.message,
            orgId: organization._id
          }, "[Provision] PLAN_SCHEDULED timeline event failed (non-fatal)");
        }
      });
    }
    return {
      organization: updatedOrg.toObject(),
      adminUser: {
        id: adminUser._id,
        email: adminUser.email
      },
      tempPassword,
      currentContractId: String(activeContract._id),
      contractStatus: activeContract.contractStatus,
      trialEndsAt: trialEndDate.toISOString(),
      ...(pendingContract && {
        pendingContractId: String(pendingContract._id),
        postTrialPlanCode: selectedPlan.templateCode,
        postTrialActivatesAt: trialEndDate.toISOString()
      })
    };
  } catch (bootstrapError) {
    // ════════════════════════════════════════════════════════════════════════
    // PHASE B FAILURE RECOVERY
    // Platform entities (org, contract, invoice) are already committed.
    // Mark the org as PROVISION_FAILED so the admin dashboard can surface it
    // and a retry mechanism (manual or automated) can re-attempt Phase B.
    // ════════════════════════════════════════════════════════════════════════
    logger.error({
      errName: bootstrapError.name,
      errMsg: bootstrapError.message?.substring(0, 500),
      orgId,
      phase: "B_ORG_BOOTSTRAP"
    }, `[Provision] CRITICAL: Phase B org bootstrap failed for ${organizationName}. Platform entities are committed. Marking org as PROVISION_FAILED.`);
    try {
      await Organization.findByIdAndUpdate(organization._id, {
        $set: {
          "subscription.status": "provision_failed",
          "provisionError": {
            message: bootstrapError.message?.substring(0, 500),
            phase: "B_ORG_BOOTSTRAP",
            timestamp: new Date()
          }
        }
      });
    } catch (markErr) {
      logger.error({
        err: markErr.message,
        orgId
      }, "[Provision] CRITICAL: Failed to mark org as PROVISION_FAILED");
    }
    throw new Error(`Organization ${organizationName} was created in the platform DB but org bootstrap failed: ${bootstrapError.message}. ` + `The organization has been marked as PROVISION_FAILED. Please retry the bootstrap.`);
  } finally {
    // Always release the per-org connection back to the pool
    if (orgConn) {
      try {
        dbManager.releaseConnection(orgId);
      } catch (_) {/* best-effort release */}
    }
  }
};