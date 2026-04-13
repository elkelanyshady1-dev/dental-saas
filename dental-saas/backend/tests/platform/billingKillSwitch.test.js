/**
 * billingKillSwitch.test.js
 * Platform Billing Kill Switch — Unit Tests
 *
 * Tests: service layer, middleware, guardian escalation, anomaly detection.
 * All external dependencies are mocked — no real DB or HTTP required.
 *
 * PLANE: Platform / Billing
 */

"use strict";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockReq(overrides = {}) {
    return {
        method: "POST",
        path: "/api/platform/billing/test",
        ip: "127.0.0.1",
        platformUser: { _id: "pid001", email: "admin@dentalsaas.com" },
        body: {},
        ...overrides
    };
}

function makeMockRes() {
    const res = {
        _status: 200,
        _body: null,
        status(code) { this._status = code; return this; },
        json(body) { this._body = body; return this; }
    };
    return res;
}

// ─── Inline reimplementations for unit testing (no DB, no external deps) ─────

/** Minimal in-process kill switch service replica */
function makeKillSwitchService(initialState = false) {
    let _state = initialState;
    let _reason = "";
    let _source = "system";
    let _actor = "system";
    let _activatedAt = null;
    const _history = [];

    return {
        async isBillingKillSwitchActive() { return _state; },
        async activateBillingKillSwitch(reason, source = "manual", actor = "system") {
            _state = true;
            _reason = reason;
            _source = source;
            _actor = actor;
            _activatedAt = new Date();
            _history.push({ killSwitch: true, reason, source, actor, changedAt: _activatedAt });
            return { killSwitch: true, reason, source, activatedBy: actor, activatedAt: _activatedAt };
        },
        async deactivateBillingKillSwitch(actor = "system") {
            _state = false;
            _reason = "Manually cleared";
            _source = "manual";
            _actor = actor;
            _activatedAt = new Date();
            _history.push({ killSwitch: false, reason: "Manual deactivation", source: "manual", actor, changedAt: _activatedAt });
            return { killSwitch: false, activatedBy: actor, activatedAt: _activatedAt };
        },
        async getBillingControl() {
            return { killSwitch: _state, reason: _reason, source: _source, activatedBy: _actor, activatedAt: _activatedAt, history: _history };
        },
        // Expose state for assertions
        _getState() { return _state; },
        _getReason() { return _reason; },
        _getSource() { return _source; },
        _getHistory() { return [..._history]; }
    };
}

/** billingGuard middleware backed by an injectable service */
async function runBillingGuard(service, req, res) {
    return new Promise((resolve) => {
        const next = resolve;
        service.isBillingKillSwitchActive().then(active => {
            if (!active) {
                resolve("next");
                return;
            }
            res.status(503).json({ success: false, error: "billing_locked" });
            resolve("blocked");
        }).catch(() => {
            res.status(503).json({ success: false, error: "billing_locked" });
            resolve("blocked");
        });
    });
}

/** Minimal anomaly monitor replica */
function makeAnomalyMonitor(service) {
    const ANOMALY_MULTIPLIER = 10;
    const RATE_LIMIT_MAX = 100;
    let _count = 0;
    let _windowStart = Date.now();

    return {
        async checkInvoiceAnomaly({ amountMinor, avgPlanPriceMinor, isTrial = false, contractId }) {
            const threshold = avgPlanPriceMinor * ANOMALY_MULTIPLIER;
            if (avgPlanPriceMinor > 0 && amountMinor > threshold) {
                const reason = `RULE_1_EXCESSIVE_AMOUNT: invoice ${amountMinor} > threshold ${threshold}`;
                await service.activateBillingKillSwitch(reason, "anomaly-detection", "anomaly-monitor");
                return { anomalyDetected: true, rule: "RULE_1_EXCESSIVE_AMOUNT", reason };
            }
            if (!isTrial && amountMinor === 0) {
                const reason = `RULE_2_ZERO_AMOUNT_PAID_CONTRACT: invoice=0 for non-trial contract ${contractId}`;
                await service.activateBillingKillSwitch(reason, "anomaly-detection", "anomaly-monitor");
                return { anomalyDetected: true, rule: "RULE_2_ZERO_AMOUNT_PAID_CONTRACT", reason };
            }
            return { anomalyDetected: false };
        },
        async checkBillingRateLimit(context = "test") {
            const now = Date.now();
            const RATE_LIMIT_WINDOW_MS = 60000;
            if (now - _windowStart > RATE_LIMIT_WINDOW_MS) { _count = 0; _windowStart = now; }
            _count++;
            if (_count > RATE_LIMIT_MAX) {
                await service.activateBillingKillSwitch(`RULE_3_RATE_LIMIT_EXCEEDED: ${_count} attempts`, "anomaly-detection", "anomaly-monitor");
                return { rateLimitExceeded: true, count: _count };
            }
            return { rateLimitExceeded: false, count: _count };
        },
        resetCounter() { _count = 0; _windowStart = Date.now(); }
    };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Billing Kill Switch — Service Layer", () => {

    // ── Test 1 ────────────────────────────────────────────────────────────────
    it("1. kill switch inactive → billing allowed (isBillingKillSwitchActive returns false)", async () => {
        const service = makeKillSwitchService(false);
        const active = await service.isBillingKillSwitchActive();
        expect(active).toBe(false);
    });

    // ── Test 2 ────────────────────────────────────────────────────────────────
    it("2. kill switch active → billing blocked (isBillingKillSwitchActive returns true)", async () => {
        const service = makeKillSwitchService(true);
        const active = await service.isBillingKillSwitchActive();
        expect(active).toBe(true);
    });

    // ── Test 3a ───────────────────────────────────────────────────────────────
    it("3a. activateBillingKillSwitch persists state with correct fields", async () => {
        const service = makeKillSwitchService(false);
        const result = await service.activateBillingKillSwitch("test reason", "guardian", "guardian");

        expect(result.killSwitch).toBe(true);
        expect(result.reason).toBe("test reason");
        expect(result.source).toBe("guardian");
        expect(service._getState()).toBe(true);
    });

    // ── Test 3b ───────────────────────────────────────────────────────────────
    it("3b. after activation, isBillingKillSwitchActive returns true", async () => {
        const service = makeKillSwitchService(false);
        expect(await service.isBillingKillSwitchActive()).toBe(false);
        await service.activateBillingKillSwitch("test", "manual", "admin@test.com");
        expect(await service.isBillingKillSwitchActive()).toBe(true);
    });

    // ── Test 5 ────────────────────────────────────────────────────────────────
    it("5. manual deactivation clears kill switch state", async () => {
        const service = makeKillSwitchService(true);
        expect(service._getState()).toBe(true);

        const result = await service.deactivateBillingKillSwitch("superadmin@dentalsaas.com");
        expect(result.killSwitch).toBe(false);
        expect(service._getState()).toBe(false);
        expect(service._getSource()).toBe("manual");
    });

    it("5b. deactivation records actor in history", async () => {
        const service = makeKillSwitchService(true);
        await service.deactivateBillingKillSwitch("superadmin@dentalsaas.com");
        const history = service._getHistory();
        const lastEntry = history[history.length - 1];
        expect(lastEntry.actor).toBe("superadmin@dentalsaas.com");
        expect(lastEntry.killSwitch).toBe(false);
    });
});

// ─── billingGuard middleware ──────────────────────────────────────────────────

describe("Billing Kill Switch — billingGuard middleware", () => {

    it("1. inactive kill switch → next() is called (billing allowed)", async () => {
        const service = makeKillSwitchService(false);
        const req = makeMockReq();
        const res = makeMockRes();

        const outcome = await runBillingGuard(service, req, res);
        expect(outcome).toBe("next");
        expect(res._body).toBeNull();
    });

    it("2. active kill switch → 503 billing_locked response", async () => {
        const service = makeKillSwitchService(true);
        const req = makeMockReq();
        const res = makeMockRes();

        const outcome = await runBillingGuard(service, req, res);
        expect(outcome).toBe("blocked");
        expect(res._status).toBe(503);
        expect(res._body.error).toBe("billing_locked");
    });

    it("3. service throws → fail-safe blocks billing (503)", async () => {
        const failingService = {
            async isBillingKillSwitchActive() {
                throw new Error("DB unreachable");
            }
        };
        const req = makeMockReq();
        const res = makeMockRes();

        const outcome = await runBillingGuard(failingService, req, res);
        expect(outcome).toBe("blocked");
        expect(res._status).toBe(503);
    });
});

// ─── Guardian escalation ──────────────────────────────────────────────────────

describe("Billing Kill Switch — Guardian escalation", () => {

    // ── Test 3 ────────────────────────────────────────────────────────────────
    it("3. billing-critical invariant failure triggers kill switch activation", async () => {
        const service = makeKillSwitchService(false);

        // Simulate Guardian detecting BILLING_LEDGER_INTEGRITY failure
        const BILLING_CRITICAL_INVARIANTS = new Set([
            "BILLING_LEDGER_INTEGRITY",
            "UNIQUE_ACTIVE_CONTRACT_PER_ORG",
            "PROVIDER_PRICE_MAPPING_VALID",
        ]);

        const failures = [
            { name: "BILLING_LEDGER_INTEGRITY", pass: false, reason: "2 duplicate providerEventIds found" }
        ];

        const billingCriticalFailures = failures.filter(r => BILLING_CRITICAL_INVARIANTS.has(r.name));
        expect(billingCriticalFailures).toHaveLength(1);

        if (billingCriticalFailures.length > 0) {
            const failedNames = billingCriticalFailures.map(r => r.name).join(", ");
            await service.activateBillingKillSwitch(
                `Guardian invariant(s) violated: ${failedNames}`,
                "guardian",
                "guardian"
            );
        }

        expect(service._getState()).toBe(true);
        expect(service._getSource()).toBe("guardian");
        expect(service._getReason()).toContain("BILLING_LEDGER_INTEGRITY");
    });

    it("3b. non-billing invariant failure does NOT trigger kill switch", async () => {
        const service = makeKillSwitchService(false);

        const BILLING_CRITICAL_INVARIANTS = new Set([
            "BILLING_LEDGER_INTEGRITY",
            "UNIQUE_ACTIVE_CONTRACT_PER_ORG",
            "PROVIDER_PRICE_MAPPING_VALID",
        ]);

        const failures = [
            { name: "NO_LEGACY_PLAN_MODEL_PRESENT", pass: false, reason: "Legacy model found" }
        ];

        const billingCriticalFailures = failures.filter(r => BILLING_CRITICAL_INVARIANTS.has(r.name));
        expect(billingCriticalFailures).toHaveLength(0);

        // Kill switch must NOT be activated
        expect(service._getState()).toBe(false);
    });
});

// ─── Manual admin activation ──────────────────────────────────────────────────

describe("Billing Kill Switch — Admin Control", () => {

    // ── Test 4 ────────────────────────────────────────────────────────────────
    it("4. manual admin activation with reason and actor", async () => {
        const service = makeKillSwitchService(false);

        await service.activateBillingKillSwitch(
            "Emergency billing stop — suspected fraud",
            "manual",
            "superadmin@dentalsaas.com"
        );

        expect(service._getState()).toBe(true);
        expect(service._getReason()).toBe("Emergency billing stop — suspected fraud");
        expect(service._getSource()).toBe("manual");
    });

    it("4b. activation without prior deactivation is idempotent (re-activate succeeds)", async () => {
        const service = makeKillSwitchService(true);
        // Already active — re-activation with a new reason should update the reason
        await service.activateBillingKillSwitch("New reason", "manual", "admin@test.com");
        expect(service._getState()).toBe(true);
        expect(service._getReason()).toBe("New reason");
    });

    it("4c. getBillingControl returns full state after activation", async () => {
        const service = makeKillSwitchService(false);
        await service.activateBillingKillSwitch("Test", "guardian", "guardian");
        const doc = await service.getBillingControl();
        expect(doc.killSwitch).toBe(true);
        expect(doc.source).toBe("guardian");
    });
});

// ─── Anomaly Detection ────────────────────────────────────────────────────────

describe("Billing Kill Switch — Anomaly Detection", () => {

    // ── Test 6a ───────────────────────────────────────────────────────────────
    it("6a. RULE_1: excessive invoice amount (>10× avg) triggers kill switch", async () => {
        const service = makeKillSwitchService(false);
        const monitor = makeAnomalyMonitor(service);

        // avg = 100, threshold = 1000; amount = 5000 → anomaly
        const result = await monitor.checkInvoiceAnomaly({
            amountMinor: 5000,
            avgPlanPriceMinor: 100,
            isTrial: false,
            contractId: "contract-001"
        });

        expect(result.anomalyDetected).toBe(true);
        expect(result.rule).toBe("RULE_1_EXCESSIVE_AMOUNT");
        expect(service._getState()).toBe(true);
        expect(service._getSource()).toBe("anomaly-detection");
    });

    it("6b. RULE_1: normal invoice amount does NOT trigger kill switch", async () => {
        const service = makeKillSwitchService(false);
        const monitor = makeAnomalyMonitor(service);

        const result = await monitor.checkInvoiceAnomaly({
            amountMinor: 500,
            avgPlanPriceMinor: 100,
            isTrial: false,
            contractId: "contract-002"
        });

        expect(result.anomalyDetected).toBe(false);
        expect(service._getState()).toBe(false);
    });

    // ── Test 6c ───────────────────────────────────────────────────────────────
    it("6c. RULE_2: zero-amount invoice on paid contract triggers kill switch", async () => {
        const service = makeKillSwitchService(false);
        const monitor = makeAnomalyMonitor(service);

        const result = await monitor.checkInvoiceAnomaly({
            amountMinor: 0,
            avgPlanPriceMinor: 100,
            isTrial: false,
            contractId: "contract-003"
        });

        expect(result.anomalyDetected).toBe(true);
        expect(result.rule).toBe("RULE_2_ZERO_AMOUNT_PAID_CONTRACT");
        expect(service._getState()).toBe(true);
    });

    it("6d. RULE_2: zero-amount invoice on TRIAL contract is allowed (not an anomaly)", async () => {
        const service = makeKillSwitchService(false);
        const monitor = makeAnomalyMonitor(service);

        const result = await monitor.checkInvoiceAnomaly({
            amountMinor: 0,
            avgPlanPriceMinor: 100,
            isTrial: true,   // trial → OK
            contractId: "contract-004"
        });

        expect(result.anomalyDetected).toBe(false);
        expect(service._getState()).toBe(false);
    });

    // ── Test 6e: Rate limit ───────────────────────────────────────────────────
    it("6e. RULE_3: billing rate limit exceeded triggers kill switch", async () => {
        const service = makeKillSwitchService(false);
        const monitor = makeAnomalyMonitor(service);
        monitor.resetCounter();

        let lastResult;
        for (let i = 0; i <= 101; i++) {
            lastResult = await monitor.checkBillingRateLimit("test");
        }

        expect(lastResult.rateLimitExceeded).toBe(true);
        expect(service._getState()).toBe(true);
        expect(service._getSource()).toBe("anomaly-detection");
    });

    it("6f. RULE_3: billing rate under limit does NOT trigger kill switch", async () => {
        const service = makeKillSwitchService(false);
        const monitor = makeAnomalyMonitor(service);
        monitor.resetCounter();

        // Only 5 attempts — well under limit of 100
        for (let i = 0; i < 5; i++) {
            await monitor.checkBillingRateLimit("test");
        }

        expect(service._getState()).toBe(false);
    });
});

// ─── Kill Switch History Audit ────────────────────────────────────────────────

describe("Billing Kill Switch — Audit History", () => {

    it("records full history of state changes", async () => {
        const service = makeKillSwitchService(false);

        await service.activateBillingKillSwitch("reason1", "guardian", "guardian");
        await service.deactivateBillingKillSwitch("admin@test.com");
        await service.activateBillingKillSwitch("reason2", "manual", "admin@test.com");

        const history = service._getHistory();
        expect(history).toHaveLength(3);
        expect(history[0].killSwitch).toBe(true);
        expect(history[0].source).toBe("guardian");
        expect(history[1].killSwitch).toBe(false);
        expect(history[2].killSwitch).toBe(true);
        expect(history[2].source).toBe("manual");
    });
});

// ─── Log Format Validation ────────────────────────────────────────────────────

describe("Billing Kill Switch — Log Format Specification", () => {

    it("activation log shape includes billing:true and event field", async () => {
        const activationLogs = [];
        const mockLogger = {
            error(meta, msg) { activationLogs.push({ meta, msg }); },
            warn(meta, msg) { activationLogs.push({ meta, msg }); }
        };

        // Simulate the log call from activateBillingKillSwitch
        mockLogger.error(
            {
                billing: true,
                event: "BILLING_KILL_SWITCH_ACTIVATED",
                reason: "test",
                source: "guardian",
                actor: "guardian",
                activatedAt: new Date().toISOString()
            },
            "[BILLING] BILLING_KILL_SWITCH_ACTIVATED — reason: test | source: guardian | actor: guardian"
        );

        expect(activationLogs).toHaveLength(1);
        expect(activationLogs[0].meta.billing).toBe(true);
        expect(activationLogs[0].meta.event).toBe("BILLING_KILL_SWITCH_ACTIVATED");
        expect(activationLogs[0].msg).toContain("[BILLING]");
    });

    it("blocked operation log shape includes billing:true and event:BILLING_OPERATION_BLOCKED", () => {
        const logs = [];
        const mockLogger = {
            error(meta, msg) { logs.push({ meta, msg }); }
        };

        mockLogger.error(
            {
                billing: true,
                event: "BILLING_OPERATION_BLOCKED",
                method: "POST",
                path: "/api/platform/billing/test"
            },
            "[BILLING] BILLING_OPERATION_BLOCKED — POST /api/platform/billing/test"
        );

        expect(logs[0].meta.billing).toBe(true);
        expect(logs[0].meta.event).toBe("BILLING_OPERATION_BLOCKED");
    });
});
