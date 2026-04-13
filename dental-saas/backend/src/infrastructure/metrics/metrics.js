/**
 * metrics.js
 * v13.0 Geopolitical Sovereignty — Regional Observability
 */
"use strict";

const client = require("prom-client");
const logger = require("../../utils/logger");

// 1. Create Registry
const register = new client.Registry();

// 2. Default Metrics (process memory, cpu, etc.)
client.collectDefaultMetrics({ register, prefix: "dental_saas_" });

/* ===============================
   FINANCIAL & REFUND METRICS
=============================== */
const refundExecutionTotal = new client.Counter({
    name: "dental_saas_refund_execution_total",
    help: "Total number of initiated refund attempts",
    labelNames: ["status", "regionCode"],
    registers: [register]
});

const refundReconciliationTotal = new client.Counter({
    name: "dental_saas_refund_reconciliation_total",
    help: "Total number of refund reconciliation repairs",
    labelNames: ["outcome", "regionCode"],
    registers: [register]
});

const mongoTransactionAbortTotal = new client.Counter({
    name: "dental_saas_mongo_transaction_abort_total",
    help: "Total number of MongoDB transactions aborted",
    labelNames: ["regionCode"],
    registers: [register]
});

/* ===============================
   WEBHOOK & SECURITY METRICS
============================== */
const webhookTotal = new client.Counter({
    name: "dental_saas_webhook_received_total",
    help: "Total number of Stripe webhooks received",
    labelNames: ["type", "status", "regionCode"],
    registers: [register]
});

const webhookRegionValidationFailureTotal = new client.Counter({
    name: "dental_saas_webhook_region_validation_failure_total",
    help: "Total number of webhooks rejected due to region mismatch",
    labelNames: ["regionCode"],
    registers: [register]
});

const webhookDuration = new client.Histogram({
    name: "dental_saas_webhook_processing_duration_ms",
    help: "Duration of webhook processing in milliseconds",
    labelNames: ["type", "regionCode"],
    buckets: [50, 100, 200, 500, 1000, 2000, 5000],
    registers: [register]
});

/* ===============================
   AUDIT & GOVERNANCE METRICS
============================== */
const auditAppendTotal = new client.Counter({
    name: "dental_saas_audit_append_total",
    help: "Total audit log append attempts",
    labelNames: ["outcome", "regionCode"],
    registers: [register]
});

const ticketSlaBreachTotal = new client.Counter({
    name: "dental_saas_ticket_sla_breach_total",
    help: "Total support SLA breaches detected",
    labelNames: ["regionCode"],
    registers: [register]
});

const ticketEscalationTotal = new client.Counter({
    name: "dental_saas_ticket_escalation_total",
    help: "Total support ticket escalations",
    labelNames: ["regionCode"],
    registers: [register]
});

const ticketOpenTotal = new client.Gauge({
    name: "dental_saas_ticket_open_total",
    help: "Number of currently open support tickets",
    labelNames: ["category", "priority", "regionCode"],
    registers: [register]
});

const refundViaTicketTotal = new client.Counter({
    name: "dental_saas_refund_via_ticket_total",
    help: "Total transactions executed via support tickets",
    labelNames: ["regionCode"],
    registers: [register]
});

const disputeTicketTotal = new client.Counter({
    name: "dental_saas_dispute_ticket_total",
    help: "Total dispute tickets created via webhooks",
    labelNames: ["regionCode"],
    registers: [register]
});

const subscriptionMutationTotal = new client.Counter({
    name: "dental_saas_subscription_mutation_total",
    help: "Total subscription state changes",
    labelNames: ["type", "outcome", "regionCode"],
    registers: [register]
});

const creditAdjustmentVolumeTotal = new client.Counter({
    name: "dental_saas_credit_adjustment_volume_total",
    help: "Total monetary volume of credit adjustments",
    labelNames: ["type", "regionCode"],
    registers: [register]
});

const outboxPendingTotal = new client.Gauge({
    name: "dental_saas_outbox_pending_total",
    help: "Total number of pending outbox events",
    labelNames: ["aggregateType", "regionCode"],
    registers: [register]
});

const outboxProcessedTotal = new client.Counter({
    name: "dental_saas_outbox_processed_total",
    help: "Total number of processed outbox events",
    labelNames: ["aggregateType", "eventType", "regionCode"],
    registers: [register]
});

const distributedLockContentionTotal = new client.Counter({
    name: "dental_saas_distributed_lock_contention_total",
    help: "Total number of distributed lock acquisition failures",
    labelNames: ["lockKey", "regionCode"],
    registers: [register]
});

const outboxClaimedTotal = new client.Counter({
    name: "dental_saas_outbox_claimed_total",
    help: "Total number of outbox events claimed by processors",
    labelNames: ["aggregateType", "processorId", "regionCode"],
    registers: [register]
});

const outboxReclaimedTotal = new client.Counter({
    name: "dental_saas_outbox_reclaimed_total",
    help: "Total number of orphaned outbox events reclaimed",
    labelNames: ["aggregateType", "regionCode"],
    registers: [register]
});

const mutationPubSubNotificationsTotal = new client.Counter({
    name: "dental_saas_mutation_pubsub_notifications_total",
    help: "Total completion notifications via Pub/Sub",
    labelNames: ["status", "regionCode"],
    registers: [register]
});

/* ===============================
   v14.0 EDGE & GEO METRICS
============================== */
const edgeRequestsTotal = new client.Counter({
    name: "dental_saas_edge_requests_total",
    help: "Total requests processed at the edge plane",
    labelNames: ["regionCode"],
    registers: [register]
});

const regionRoutingResolutionTotal = new client.Counter({
    name: "dental_saas_region_routing_resolution_total",
    help: "Total region routing resolution events",
    labelNames: ["method"], // successful, failed
    registers: [register]
});

const tokenRegionMismatchTotal = new client.Counter({
    name: "dental_saas_token_region_mismatch_total",
    help: "Total number of identity tokens rejected due to region mismatch",
    labelNames: ["regionCode"],
    registers: [register]
});

const regionFailoverTotal = new client.Counter({
    name: "dental_saas_region_failover_total",
    help: "Total number of regional failovers executed",
    labelNames: ["from", "to"],
    registers: [register]
});

/* ===============================
   v30.0 AUTH SECURITY METRICS
============================== */
const jwtLegacyFallbackTotal = new client.Counter({
    name: "dental_saas_jwt_legacy_fallback_total",
    help: "Total JWT tokens verified via legacy JWT_SECRET fallback",
    labelNames: ["tokenType"],
    registers: [register]
});

const accountLockedTotal = new client.Counter({
    name: "dental_saas_account_locked_total",
    help: "Total accounts locked due to brute force",
    registers: [register]
});

/* ===============================
   PHASE F.10 — SECURITY CHAIN DRIFT DETECTION
============================== */
const secureFlowViolationTotal = new client.Counter({
    name: "dental_saas_secure_flow_violation_total",
    help: "Total number of secure flow violations detected by drift detection",
    labelNames: ["route", "mode", "marker"],
    registers: [register]
});

const secureFlowRouteRateGauge = new client.Gauge({
    name: "dental_saas_secure_flow_route_violation_rate",
    help: "Per-route violation rate for alerting thresholds (violations per minute)",
    labelNames: ["route"],
    registers: [register]
});

const secureFlowAssertionTotal = new client.Counter({
    name: "dental_saas_secure_flow_assertion_total",
    help: "Total assertions (pass + fail) processed by the drift detection engine",
    labelNames: ["outcome"],  // "pass" | "fail"
    registers: [register]
});

/* ===============================
   PROCESS HEALTH GAUGES
============================== */
const activeHttpRequests = new client.Gauge({
    name: "dental_saas_active_http_requests",
    help: "Number of currently active HTTP requests",
    registers: [register]
});

const activeRefundTransactions = new client.Gauge({
    name: "dental_saas_active_refund_transactions",
    help: "Number of currently active refund transactions",
    labelNames: ["regionCode"],
    registers: [register]
});

// Re-expose heap used
const processHeapUsed = new client.Gauge({
    name: "dental_saas_process_heap_used_bytes",
    help: "Current heap bytes used",
    registers: [register],
    collect() {
        const { heapUsed } = process.memoryUsage();
        this.set(heapUsed);
    }
});

module.exports = {
    register,
    metrics: {
        refundExecutionTotal,
        refundReconciliationTotal,
        mongoTransactionAbortTotal,
        webhookTotal,
        webhookDuration,
        auditAppendTotal,
        ticketSlaBreachTotal,
        ticketEscalationTotal,
        ticketOpenTotal,
        refundViaTicketTotal,
        disputeTicketTotal,
        subscriptionMutationTotal,
        creditAdjustmentVolumeTotal,
        outboxPendingTotal,
        outboxProcessedTotal,
        distributedLockContentionTotal,
        outboxClaimedTotal,
        outboxReclaimedTotal,
        mutationPubSubNotificationsTotal,
        activeHttpRequests,
        activeRefundTransactions,
        edge_requests_total: edgeRequestsTotal,
        region_routing_resolution_total: regionRoutingResolutionTotal,
        token_region_mismatch_total: tokenRegionMismatchTotal,
        region_failover_total: regionFailoverTotal,
        webhook_region_validation_failure_total: webhookRegionValidationFailureTotal,
        jwt_legacy_fallback_total: jwtLegacyFallbackTotal,
        accountLockedTotal,
        // Phase F.10 — Drift Detection Metrics
        secureFlowViolationTotal,
        secureFlowRouteRateGauge,
        secureFlowAssertionTotal,
    }
};
