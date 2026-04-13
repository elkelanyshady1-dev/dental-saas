/**
 * statusStyles.js
 * Sprint 7.2 — Status Badge Maps
 *
 * All enums aligned to Swagger v20.2.0 frozen contract.
 * Sources:
 *   - OrgOrganization.status
 *   - OrgContract.contractStatus
 *   - PlatformInvoice.status + .paymentStatus
 *   - RefundExecutionRecord.status
 */

// ─── Organization Runtime Status ─────────────────────────────────────────────
export const STATUS_BADGE_MAP = {
    provisioned: "bg-slate-50 text-slate-600 border-slate-200",
    trial_active: "bg-amber-50 text-amber-700 border-amber-200",
    trial_expired: "bg-orange-50 text-orange-700 border-orange-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    suspended: "bg-red-50 text-red-700 border-red-200",
    canceled: "bg-slate-100 text-slate-500 border-slate-200",
    // legacy aliases
    trial: "bg-amber-50 text-amber-700 border-amber-200",
    expired: "bg-slate-50 text-slate-600 border-slate-200",
};

export const STATUS_TEXT_MAP = {
    provisioned: "text-slate-500",
    trial_active: "text-amber-600",
    trial_expired: "text-orange-600",
    active: "text-emerald-600",
    suspended: "text-red-600",
    canceled: "text-slate-500",
    trial: "text-amber-600",
    expired: "text-slate-500",
};

// ─── Contract Status (OrgContract.contractStatus) ────────────────────────────
export const CONTRACT_STATUS_MAP = {
    draft: "bg-slate-50 text-slate-500 border-slate-200",
    pending_signature: "bg-yellow-50 text-yellow-700 border-yellow-200",
    pending_payment: "bg-orange-50 text-orange-700 border-orange-200",
    pending_activation: "bg-blue-50 text-blue-500 border-blue-200",
    scheduled: "bg-blue-50 text-blue-600 border-blue-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    superseded: "bg-violet-50 text-violet-600 border-violet-200",
    terminated: "bg-red-50 text-red-700 border-red-200",
    expired: "bg-slate-100 text-slate-500 border-slate-200",
    canceled: "bg-slate-100 text-slate-400 border-slate-200",
    // v21.0: Dunning lifecycle statuses
    grace: "bg-amber-50 text-amber-700 border-amber-200",
    suspended: "bg-orange-50 text-orange-700 border-orange-200",
    void: "bg-slate-100 text-slate-400 border-slate-300",
};

// ─── PlanTemplate / PlanVersion Status ───────────────────────────────────────
export const PLAN_BADGE_MAP = {
    draft: "bg-slate-100 text-slate-600 border-slate-200",
    published: "bg-emerald-50 text-emerald-700 border-emerald-200",
    active: "bg-blue-50 text-blue-700 border-blue-200",
    archived: "bg-slate-100 text-slate-400 border-slate-200",
    deprecated: "bg-orange-50 text-orange-600 border-orange-200",
};

// ─── Invoice Status (PlatformInvoice.status) ──────────────────────────────────
export const INVOICE_STATUS_MAP = {
    draft: "bg-slate-50 text-slate-500 border-slate-200",
    issued: "bg-blue-50 text-blue-600 border-blue-200",
    open: "bg-blue-50 text-blue-700 border-blue-200",
    partial: "bg-amber-50 text-amber-700 border-amber-200",
    overdue: "bg-orange-50 text-orange-700 border-orange-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    void: "bg-slate-100 text-slate-400 border-slate-200",
    uncollectible: "bg-red-50 text-red-600 border-red-200",
    // legacy aliases used in some views
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    voided: "bg-slate-100 text-slate-500 border-slate-200",
    failed: "bg-red-50 text-red-700 border-red-100",
};

// ─── Invoice Payment Status (PlatformInvoice.paymentStatus) ──────────────────
export const PAYMENT_STATUS_MAP = {
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    authorized: "bg-blue-50 text-blue-600 border-blue-100",
    captured: "bg-emerald-50 text-emerald-700 border-emerald-100",
    failed: "bg-red-50 text-red-700 border-red-100",
    refunded: "bg-blue-50 text-blue-700 border-blue-100",
    partially_refunded: "bg-violet-50 text-violet-700 border-violet-100",
    disputed: "bg-orange-50 text-orange-700 border-orange-100",
};

// ─── Refund Status (RefundExecutionRecord.status) ─────────────────────────────
// Color semantics:
//   - neutral/slate  = pending/waiting states
//   - amber/yellow   = under review
//   - green          = approved / completed
//   - red            = rejected / failed
//   - blue           = processing
export const REFUND_STATUS_MAP = {
    refund_requested: "bg-slate-50 text-slate-600 border-slate-200",
    refund_under_review: "bg-amber-50 text-amber-700 border-amber-200",
    refund_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    refund_rejected: "bg-red-50 text-red-700 border-red-200",
    refund_processing: "bg-blue-50 text-blue-700 border-blue-200",
    refund_completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
    refund_failed: "bg-red-100 text-red-800 border-red-300",
};

// Human-readable labels for refund states
export const REFUND_STATUS_LABELS = {
    refund_requested: "Requested",
    refund_under_review: "Under Review",
    refund_approved: "Approved",
    refund_rejected: "Rejected",
    refund_processing: "Processing",
    refund_completed: "Completed",
    refund_failed: "Failed",
};

// Allowed next states per current state (mirrors refundStateMachine.js)
export const REFUND_ALLOWED_TRANSITIONS = {
    refund_requested: ["refund_under_review"],
    refund_under_review: ["refund_approved", "refund_rejected"],
    refund_approved: ["refund_processing"],
    refund_processing: ["refund_completed", "refund_failed"],
    refund_rejected: [],
    refund_completed: [],
    refund_failed: [],
};
