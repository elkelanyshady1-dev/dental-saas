module.exports = {
    // Patient Events
    PATIENT_CREATED: "patient.created",
    PATIENT_UPDATED: "patient.updated",
    PATIENT_DELETED: "patient.deleted",
    PATIENT_STATUS_CHANGED: "patient.status.changed",
    PATIENT_BRANCH_UPDATED: "patient.branch.updated",
    PATIENT_PORTAL_ACTIVATED: "patient.portal.activated",
    PATIENT_LOGIN_SUCCESS: "patient.login.success",
    PATIENT_LOGIN_FAILED: "patient.login.failed",
    PATIENT_BOOKING_REQUESTED: "patient.booking.requested",
    PATIENT_MEDICAL_UPDATED: "patient.medical.updated",
    PATIENT_POLICY_UPDATED: "patient.policy.updated",
    PATIENT_FILE_UPLOADED: "patient.file.uploaded",
    DOCTOR_ASSIGNED_TO_PATIENT: "patient.doctor.assigned",

    // Booking & Appointment Events
    APPOINTMENT_REQUESTED: "appointment.requested",
    APPOINTMENT_CREATED: "appointment.created",
    APPOINTMENT_UPDATED: "appointment.updated",           // Phase 13 — reschedule/edit
    APPOINTMENT_STATUS_CHANGED: "appointment.status_changed", // Phase 13 — FSM transition
    APPOINTMENT_APPROVED: "appointment.approved",
    APPOINTMENT_COMPLETED: "appointment.completed",
    BOOKING_APPROVED: "booking.approved",
    BOOKING_REJECTED: "booking.rejected",

    // Clinical Protocol Events (v4.5)
    CLINICAL_CASE_CREATED: "clinical.case.created",

    // Communication Events
    COMMUNICATION_QUEUED: "communication.queued",
    COMMUNICATION_SENT: "communication.sent",
    COMMUNICATION_FAILED: "communication.failed",

    // Organization Events (v1.8.0)
    ORG_LOGO_UPDATED: "org.logo.updated",
    ORG_NAME_UPDATED: "org.name.updated",

    // Billing / Financial Events (v1.8.1)
    INVOICE_OVERDUE: "invoice.overdue",

    // Security Events (v1.8.1)
    SECURITY_ALERT: "security.alert",

    // Notification Events (v1.8.1)
    NOTIFICATION_DELETED: "notification.deleted",

    // Subscription & Catalog Events (v11.0)
    PLAN_CHANGED: "subscription.plan.changed",
    ADDON_ADDED: "subscription.addon.added",
    ADDON_REMOVED: "subscription.addon.removed",

    // Platform Billing Lifecycle Events (v23.0 — TASK-AUTH-LIFECYCLE-HARDENING Phase 2)
    // These events enable EventBus subscribers (notifications, webhooks, analytics)
    // to react to contract and invoice lifecycle changes on the platform plane.
    CONTRACT_CREATED: "contract.created",
    CONTRACT_ACTIVATED: "contract.activated",
    PLATFORM_INVOICE_CREATED: "platform.invoice.created",
    PLATFORM_INVOICE_PAID: "platform.invoice.paid",

    // Email Events (v12.0) — internal infrastructure events
    // Emitted via email.events.js helpers. NOT registered in schemaRegistry.
    EMAIL_MAGIC_LINK: "email.magic_link",
    EMAIL_PASSWORD_RESET: "email.password_reset",
    EMAIL_OTP: "email.otp",
    EMAIL_INVOICE: "email.invoice",
    EMAIL_REFUND: "email.refund",
    EMAIL_TICKET_REPLY: "email.ticket_reply",

    // Phase 3 — Treatment Domain Events
    TREATMENT_CREATED: "treatment.created",
    TREATMENT_STATUS_CHANGED: "treatment.status_changed",
    TREATMENT_COMPLETED: "treatment.completed",

    // Phase 3 — Patient Billing Events
    PATIENT_INVOICE_CREATED: "invoice.created",
    PATIENT_INVOICE_VOIDED: "invoice.voided",
    PATIENT_PAYMENT_RECORDED: "payment.recorded",

    // Phase G — Financial Projection Events (Billing Domain Restructure)
    // Emitted by ledger.orchestrator.service.js after invoice/payment state changes.
    // Subscriber: financialSnapshot.subscriber.js (CQRS read model materialization)
    FINANCIAL_SNAPSHOT_REQUESTED: "financial.snapshot.requested",

    // Phase C — Double-Entry Ledger Events
    // Emitted by journal.service.js after a balanced journal entry is persisted.
    // Subscribers: audit, reconciliation (future)
    LEDGER_ENTRY_POSTED: "ledger.entry.posted",

    // Phase D — Refund Engine Events
    // Emitted by refund.service.js after a refund is fully processed.
    PAYMENT_REFUNDED: "payment.refunded",

    // Phase 4 — Orthodontic Intelligence Events
    SCAN_UPLOADED: "scan.uploaded",
    ANALYSIS_STARTED: "analysis.started",
    ANALYSIS_COMPLETED: "analysis.completed",
    ALIGNER_PLAN_CREATED: "aligner.plan_created",

    // Phase 5 — Patient Portal Events
    STAGE_REMINDER_SENT: "stage.reminder_sent",
    PHOTO_UPLOADED: "photo.uploaded",
    DOCTOR_REVIEW_COMPLETED: "doctor.review_completed",
    MONITORING_SUBMITTED: "monitoring.submitted",


    // Phase 7 - Unified Verification Engine Events (v27.0)
    // Infrastructure events — emitted by verificationEngine.service.js
    // Listeners: verification.listener.js (delivery) + CommunicationMetrics (tracking)
    // NOTE: NOT registered in schemaRegistry (infrastructure events, not domain)
    VERIFICATION_TOKEN_CREATED: "verification.token.created",
    VERIFICATION_TOKEN_VERIFIED: "verification.token.verified",
    VERIFICATION_TOKEN_FAILED: "verification.token.failed",
    VERIFICATION_FALLBACK_USED: "verification.fallback.used",

    // Phase 14 — Audit Intelligence Events
    AUDIT_EVENT_CREATED: "audit.event.created",
    GOVERNANCE_VIOLATION_DETECTED: "governance.violation.detected",

    // Phase B.2 — Module Lifecycle Events
    // Emitted by moduleLifecycle.service.js via lifecycleHooks.js
    // Subscribers: moduleState.subscriber.js, audit logger, analytics
    MODULE_ENABLED: "module.enabled",
    MODULE_DISABLED: "module.disabled",
    MODULE_INSTALLED: "module.installed",

    // TASK-INV-002 — Inventory Domain Events
    // Emitted by inventoryWrite.service.js
    // Subscribers: inventoryProjection.service.js (CQRS read model)
    //              accountingDomain (expense projection via inventory.expense.v1)
    INVENTORY_STOCK_ADDED: "inventory.stock.added.v1",
    INVENTORY_USED:        "inventory.used.v1",
    INVENTORY_LOW_STOCK:   "inventory.lowStock.v1",
    INVENTORY_EXPENSE:     "inventory.expense.v1",     // consumed by accountingDomain

    // TASK-LAB-002 — External Lab Domain Events
    // Emitted by labWrite.service.js
    LAB_CASE_CREATED:   "lab.case.created.v1",
    LAB_CASE_UPDATED:   "lab.case.updated.v1",
    LAB_CASE_COMPLETED: "lab.case.completed.v1",
    LAB_CLAIM_CREATED:  "lab.claim.created.v1",
    LAB_MESSAGE_SENT:   "lab.message.sent.v1",
};
