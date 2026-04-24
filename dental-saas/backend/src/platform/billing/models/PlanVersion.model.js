/**
 * PlanVersion.model.js
 * Sprint 1 — Hybrid Billing Foundations
 * v2.0 — Added renewalPolicy, migrateToVersionId, renewalCutoffDate (Audit Improvement 2)
 *
 * PlanVersion is an immutable snapshot of a PlanTemplate at a point in time.
 * Once created with status "active", it MUST NOT be mutated.
 * New commercial changes require creating a new PlanVersion.
 *
 * Why PlanVersion is separate from PlanTemplate:
 *   - OrgContracts reference a specific PlanVersion (locked at signing)
 *   - PlanTemplates can evolve; existing contracts are unaffected
 *   - Audit trail: know exactly what was sold to each org
 *
 * Relationship:
 *   PlanTemplate 1──* PlanVersion 1──* OrgContract
 *
 * PLANE: Platform
 * COLLECTION: planversions
 *
 * ─── Pricing Architecture ────────────────────────────────────────────────────
 * PlanVersion.pricing.regions[] — mutable across version drafts
 * OrgContract.lockedPrice       — immutable snapshot computed by pricingEngine.service.js
 * PlatformInvoice               — ALWAYS reads lockedPrice from OrgContract; never re-computes
 *
 * The pricing engine (platform/billing/pricing/pricingEngine.service.js) is the
 * ONLY place that may compute a contract price from a PlanVersion.
 * Trial contracts bypass the engine and set lockedPrice = 0 directly.
 */

"use strict";

const mongoose = require("mongoose");

// ─── Global Pricing Snapshot (Phase 1 — pricing decoupling) ──────────────────
// New canonical pricing shape. Single USD price list; EG is routed to Kashier
// at resolve-time, not stored per-region.
// Mirrors PlanTemplate.pricing.global; frozen once version is "active"
// via the immutability guard below (pricing is already in the frozen list).
const versionGlobalPricingSchema = new mongoose.Schema({
  currency: {
    type: String,
    required: true,
    uppercase: true,
    default: "USD"
  },
  amountMonthly: {
    type: Number,
    required: true,
    min: 0
  },
  amountYearly: {
    type: Number,
    required: true,
    min: 0
  },
  providerPriceIds: {
    stripe: {
      monthly: {
        type: String,
        default: ""
      },
      yearly: {
        type: String,
        default: ""
      }
    },
    kashier: {
      monthly: {
        type: String,
        default: ""
      },
      yearly: {
        type: String,
        default: ""
      }
    }
  }
}, {
  _id: false
});

// ─── Immutable Pricing Snapshot (v2 — Legacy, kept for backward compat) ───────
// Copied from PlanTemplate at version creation — NEVER updated after "active".
const versionPricingRegionSchema = new mongoose.Schema({
  regionCode: {
    type: String,
    required: true,
    uppercase: true
  },
  countries: [{
    type: String,
    uppercase: true
  }],
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  monthly: {
    type: Number,
    required: true,
    min: 0
  },
  yearly: {
    type: Number,
    required: true,
    min: 0
  },
  biennial: {
    type: Number,
    min: 0
  },
  providerPriceIds: {
    stripe: {
      monthly: {
        type: String
      },
      yearly: {
        type: String
      },
      biennial: {
        type: String
      }
    },
    paymob: {
      monthly: {
        type: String
      },
      yearly: {
        type: String
      },
      biennial: {
        type: String
      }
    }
  }
}, {
  _id: false
});

// ─── Pricing v3: Region-Based with Country Overrides ──────────────────────────
// Resolution priority: Country Override → Region Default → Global Default
//
// Architecture:
//   pricingV3.regions[]      — region-level pricing (US, EU, MEA, APAC)
//   pricingV3.regions[].overrides[]  — country-specific price overrides within a region
//   pricingV3.regions[].excludedCountries[]  — countries excluded from region pricing
//   pricingV3.default        — global fallback for uncovered countries
//
// This field is NULLABLE. When null, the system falls back to v2 (pricing.regions).
// Controlled by PRICING_ENGINE env flag.

const pricingV3OverrideSchema = new mongoose.Schema({
  country: {
    type: String,
    required: true,
    uppercase: true
  },
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  monthly: {
    type: Number,
    required: true,
    min: 0
  },
  yearly: {
    type: Number,
    required: true,
    min: 0
  },
  // Provider integration IDs for country-specific pricing
  stripePriceId_monthly: {
    type: String,
    default: ""
  },
  stripePriceId_yearly: {
    type: String,
    default: ""
  },
  paymobPriceId_monthly: {
    type: String,
    default: ""
  },
  paymobPriceId_yearly: {
    type: String,
    default: ""
  }
}, {
  _id: false
});
const pricingV3RegionSchema = new mongoose.Schema({
  regionCode: {
    type: String,
    required: true,
    uppercase: true,
    enum: ["US", "EU", "MEA", "APAC"]
  },
  // Region default pricing
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  monthly: {
    type: Number,
    required: true,
    min: 0
  },
  yearly: {
    type: Number,
    required: true,
    min: 0
  },
  // Countries excluded from this region's pricing (must use override or global default)
  excludedCountries: [{
    type: String,
    uppercase: true
  }],
  // Country-specific price overrides within this region
  overrides: [pricingV3OverrideSchema],
  // Provider integration IDs for region-level pricing
  providerPriceIds: {
    stripe: {
      monthly: {
        type: String
      },
      yearly: {
        type: String
      }
    },
    paymob: {
      monthly: {
        type: String
      },
      yearly: {
        type: String
      }
    }
  }
}, {
  _id: false
});
const pricingV3Schema = new mongoose.Schema({
  default: {
    currency: {
      type: String,
      required: true,
      uppercase: true
    },
    monthly: {
      type: Number,
      required: true,
      min: 0
    },
    yearly: {
      type: Number,
      required: true,
      min: 0
    }
  },
  regions: [pricingV3RegionSchema]
}, {
  _id: false
});

// ─── Immutable Limits Snapshot ────────────────────────────────────────────────
const versionLimitsSchema = new mongoose.Schema({
  maxUsers: {
    type: Number,
    required: true
  },
  maxBranches: {
    type: Number,
    required: true
  },
  // Phase 4.0b: Explicit patient limit.
  //   null / 0  = unlimited
  //   > 0       = enforced limit
  maxPatients: {
    type: Number,
    default: 0
  },
  // Storage quota in megabytes per organization:
  //   -1        = unlimited (enterprise plans)
  //   0 / unset = not configured yet (treated as unlimited for backward compat)
  //   > 0       = enforced limit (e.g. 5120 = 5GB)
  // @deprecated Phase 4.0b — prefer quotas.storageMB. Kept for backward compat.
  maxStorageMB: {
    type: Number,
    default: 0
  }
}, {
  _id: false
});

// ─── Immutable Quotas Snapshot (Phase 4.0b) ──────────────────────────────────
// Fine-grained storage quotas. Takes precedence over limits.maxStorageMB when
// both are set. Null/0 = unlimited (matches limits convention).
//
// Resolution order (in entitlementResolver / quotaGuard):
//   quotas.storageMB ?? limits.maxStorageMB ?? null (unlimited)
const versionQuotasSchema = new mongoose.Schema({
  storageMB: {
    type: Number,
    default: 0
  },
  // Total allowed storage (MB)
  imagesMB: {
    type: Number,
    default: 0
  } // Optional sub-quota for images (MB)
}, {
  _id: false
});

// ─── Immutable Module Entitlement Snapshot ────────────────────────────────────
const versionModulesSchema = new mongoose.Schema({
  patients: {
    type: Boolean,
    default: true
  },
  appointments: {
    type: Boolean,
    default: true
  },
  finance: {
    type: Boolean,
    default: true
  },
  inventory: {
    type: Boolean,
    default: false
  },
  lab: {
    type: Boolean,
    default: false
  },
  orthodonticsAdv: {
    type: Boolean,
    default: false
  },
  analytics: {
    type: Boolean,
    default: false
  },
  booking: {
    type: Boolean,
    default: false
  },
  communication: {
    enabled: {
      type: Boolean,
      default: false
    },
    smsQuota: {
      type: Number,
      default: 0
    },
    whatsappQuota: {
      type: Number,
      default: 0
    },
    emailQuota: {
      type: Number,
      default: 0
    }
  }
}, {
  _id: false
});

// ─── Main Schema ──────────────────────────────────────────────────────────────
const planVersionSchema = new mongoose.Schema({
  // ── Parent Reference ──────────────────────────────────────────────────
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlanTemplate",
    required: true
  },
  // ── Version Identity ──────────────────────────────────────────────────
  // Semantic version scoped to template, e.g. "2.0.0"
  versionTag: {
    type: String,
    required: true,
    trim: true
  },
  // Human label for platform UI and contracts
  label: {
    type: String,
    required: true,
    trim: true
  },
  // ── Immutable Snapshot Fields ─────────────────────────────────────────
  // Copied from PlanTemplate at version creation.
  // THESE FIELDS MUST NEVER BE UPDATED after status is "active".
  templateCode: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  limits: {
    type: versionLimitsSchema,
    required: true
  },
  modules: {
    type: versionModulesSchema,
    default: () => ({})
  },
  pricing: {
    baseCurrency: {
      type: String,
      default: "USD",
      uppercase: true
    },
    // Phase 1 — new canonical pricing (USD + Kashier routing at resolve-time).
    // Optional during migration; populated by scripts/migratePricingToGlobal.js
    // or by the plan-builder form when authoring new templates.
    global: {
      type: versionGlobalPricingSchema,
      default: null
    },
    // @deprecated — Phase 10. Read-only from this version forward.
    // Scheduled for removal in Phase 11 once auditLegacyPricing.js
    // reports zero unmigrated documents.
    regions: [versionPricingRegionSchema]
  },
  // ── Pricing v3 (Region-Based with Overrides) ──────────────────────────
  // @deprecated — Phase 10. resolvePrice no longer reads this field.
  // Kept on the schema only so existing PlanVersion documents continue
  // to load without validation errors. Scheduled for removal in Phase 11.
  pricingV3: {
    type: pricingV3Schema,
    default: null
  },
  // ── Quotas (Phase 4.0b) ───────────────────────────────────────────────
  quotas: {
    type: versionQuotasSchema,
    default: () => ({})
  },
  inflationPolicy: {
    defaultPercent: {
      type: Number,
      default: 0
    },
    applyAfterYears: {
      type: Number,
      default: 1
    }
  },
  trialDays: {
    type: Number,
    default: 14
  },
  // ── Lifecycle ─────────────────────────────────────────────────────────
  // draft → active → deprecated
  // Only ONE version per template may be "active" at any time.
  status: {
    type: String,
    enum: ["draft", "active", "deprecated"],
    default: "draft"
  },
  // When this version became active (i.e., available for new contracts)
  activatedAt: {
    type: Date,
    default: null
  },
  // When this version was deprecated (no new contracts after this date)
  deprecatedAt: {
    type: Date,
    default: null
  },
  // ── Renewal Migration Policy ──────────────────────────────────────────
  // Controls what happens when an OrgContract on THIS (deprecated) version
  // reaches its renewal date. Only meaningful when status = "deprecated".
  //
  //   allowLegacyRenewal (default)
  //     → Contracts renew on this same deprecated version.
  //       Use for: grandfathered plans, long-term legacy customers.
  //
  //   migrate
  //     → At renewal, the billing engine creates a new contract on
  //       migrateToVersionId instead of this version.
  //       Use for: controlled migration path to a successor plan.
  //
  //   block
  //     → Renewal is blocked entirely. Org receives a dunning notice
  //       and must manually select a new plan.
  //       Use for: hard plan sunset after renewalCutoffDate.
  renewalPolicy: {
    type: String,
    enum: ["allowLegacyRenewal", "migrate", "block"],
    default: "allowLegacyRenewal"
  },
  // Target version for policy = "migrate".
  // Must reference an active PlanVersion on the same PlanTemplate.
  // Validated at publish time by the controller — not enforced by DB ref here
  // because the target version may not exist yet when the deprecated version
  // is being configured.
  migrateToVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlanVersion",
    default: null
  },
  // Hard cutoff date for renewal.
  // After this date, renewals are blocked regardless of renewalPolicy.
  // Null = no cutoff (policy applies indefinitely).
  renewalCutoffDate: {
    type: Date,
    default: null
  },
  // ── Change Record ─────────────────────────────────────────────────────
  // What changed relative to the previous version — for platform audit UI
  changeNotes: {
    type: String,
    default: ""
  },
  // ── Visibility Gate (replaces isSalesOnly — canonical as of v6.1) ──────
  // Controls who can see this version:
  //   "public"   → shown on marketing site, public pricing API
  //   "sales"    → hidden from public; only usable via sales contract creation
  //   "internal" → hidden from all external surfaces; platform-only
  visibility: {
    type: String,
    enum: ["public", "sales", "internal"],
    default: "public",
    required: true,
    index: true
  },
  // ── LEGACY: Sales Gate (deprecated — remove after migration script runs) ──
  // @deprecated v6.1 — use visibility instead.
  // Kept for backward compatibility during migration window.
  // Pre-save hook derives visibility from this if visibility === "public" (default).
  // DO NOT use in new code.
  isSalesOnly: {
    type: Boolean,
    default: false
  },
  // ── Audit ─────────────────────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser",
    required: true
  }
}, {
  timestamps: true,
  collection: "planversions"
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// One active version per template at any time (enforced at service layer + partial index)
planVersionSchema.index({
  templateId: 1,
  status: 1
});
planVersionSchema.index({
  templateId: 1,
  versionTag: 1
}, {
  unique: true
});
planVersionSchema.index({
  templateCode: 1,
  status: 1
});
planVersionSchema.index({
  "pricing.regions.countries": 1
});
planVersionSchema.index({
  activatedAt: -1
});

// ─── Unique Active Version Guard (Database-Level) ─────────────────────────────
// Guarantees that only ONE "active" PlanVersion may exist per templateCode.
//
// This is a PARTIAL unique index — it only applies when status = "active".
// Draft and deprecated versions are unaffected and may co-exist freely.
//
// Why this index is necessary:
//   - Without it, a race condition between two concurrent publish requests could
//     briefly activate two versions of the same template simultaneously.
//   - The service layer guard (controller pre-check) handles the normal case.
//   - This index is the hard stop that catches the race.
//
// Error thrown by MongoDB on violation:
//   E11000 duplicate key error — unique_active_plan_version_per_template
//
// Compatible with all existing queries — no index coalescence issues
// because existing { templateCode: 1, status: 1 } is a compound index,
// while this is a single-field partial index (different index shape).
planVersionSchema.index({
  templateCode: 1
}, {
  unique: true,
  partialFilterExpression: {
    status: "active"
  },
  name: "unique_active_plan_version_per_template"
});

// ─── Immutability Guard ───────────────────────────────────────────────────────
// Snapshot fields (limits, pricing, modules, etc.) are frozen once active.
// visibility is ALSO frozen once active — changing the exposure gate of a live
// version can break the pricing page, Stripe sync, and public analytics.
//
// Exception: the isSalesOnly→visibility bridge is allowed to write visibility
// on active docs during the migration window (one-time migration script).
// The bridge sets _visibilityDerivedFromLegacy = true to signal this.
// ─── Pre-Validate: Auto-generate label if missing ─────────────────────────────
// Fix for: "PlanVersion validation failed: label Path 'label' is required"
// Generates label = `${templateCode}@${versionTag}` when label is not provided.
// Example: enterprise@v1.1
// This allows programmatic version creation without requiring explicit labels.
planVersionSchema.pre("validate", function () {
  if (!this.label && this.templateCode && this.versionTag) {
    this.label = `${this.templateCode}@${this.versionTag}`;
  }
});
planVersionSchema.pre("save", async function () {
  // ── Backward-compat bridge: isSalesOnly → visibility ─────────────────────
  // On any save where isSalesOnly is explicitly set and visibility is at
  // default "public", derive visibility from the legacy boolean.
  // Sets a local flag so the guard below does NOT block this bridge write.
  let _visibilityDerivedFromLegacy = false;
  if (this.isModified("isSalesOnly")) {
    if (this.visibility === "public" || !this.visibility) {
      this.visibility = this.isSalesOnly ? "sales" : "public";
      _visibilityDerivedFromLegacy = true;
    }
  }

  // ── Plan Lifecycle Matrix ─────────────────────────────────────────────────
  // Enforces the legal status+visibility combinations:
  //   draft      → any visibility                       (internal drafting)
  //   active     → public, sales, internal              (all allowed while live)
  //   deprecated → sales, internal only (NOT public)    ← KEY INVARIANT
  //
  // When a version is being deprecated AND its current visibility is "public",
  // auto-correct to "sales" instead of throwing. This is the same repair the
  // Guardian auto-repair performs, but done inline at the point of deprecation
  // so the invariant is never violated in the first place.
  if (this.isModified("status") && this.status === "deprecated") {
    if (this.visibility === "public") {
      this.visibility = "sales";
    }
  }

  // Hard block: if something manages to set deprecated+public without going
  // through the normal deprecation flow (e.g., direct findByIdAndUpdate
  // bypass later fixed by a migration), throw at save time.
  if (this.status === "deprecated" && this.visibility === "public") {
    throw new Error(`[PlanVersion] DEPRECATED_PUBLIC_PLAN invariant violated: ` + `A deprecated PlanVersion cannot have visibility="public". ` + `Set visibility to "sales" or "internal" before deprecating.`);
  }
  if (!this.isNew && this.status === "active") {
    // ── Frozen snapshot fields ────────────────────────────────────────────
    const immutableFields = ["limits", "modules", "pricing", "pricingV3", "quotas", "inflationPolicy", "trialDays", "templateCode"];
    for (const field of immutableFields) {
      if (this.isModified(field)) {
        throw new Error(`[PlanVersion] Cannot mutate field "${field}" on an active version (${this._id}). ` + `Create a new draft version instead.`);
      }
    }

    // ── Visibility: UNLOCKED on active versions (Selective Immutability) ──
    // As of v6.2, visibility is classified as a **distribution-layer** field,
    // NOT a contract-layer field. Changing visibility on an active version:
    //   ✅ Affects which users can see the plan on the marketing page
    //   ✅ Does NOT affect existing OrgContract snapshots (locked at signing)
    //   ✅ Does NOT affect billing, renewal, or Stripe subscription state
    //
    // This follows the Stripe / Shopify "selective immutability" pattern:
    //   - Contract fields (limits, modules, pricing) → LOCKED on active
    //   - Distribution fields (visibility) → UNLOCKED on active
    //
    // The pre-save visibility validators (lifecycle matrix + bridge) still
    // apply above — the only thing removed is the blanket lock.
    //
    // To revert to full lock: uncomment the guard below.
    // if (this.isModified("visibility") && !_visibilityDerivedFromLegacy) {
    //     throw new Error(`[PlanVersion] Visibility locked on active version`);
    // }
  }
  if (this.isNew && this.status === "active") {
    this.activatedAt = new Date();
  }
});
const modelName = "PlanVersion";
module.exports = {
  modelName,
  schema: planVersionSchema
};