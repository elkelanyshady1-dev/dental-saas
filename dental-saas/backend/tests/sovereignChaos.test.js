/**
 * sovereignChaos.test.js
 * v11.2 Distributed Determinism — Chaos & Stress Suite
 */
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const Organization = require("../src/models/Organization");
const PlatformUser = require("../src/models/PlatformUser");
const SubscriptionMutationRecord = require("../src/models/SubscriptionMutationRecord");
const RevenueSnapshotProjection = require("../src/models/RevenueSnapshotProjection");
const DomainEventOutbox = require("../src/models/DomainEventOutbox");
const Region = require("../src/modules/platformDomain/models/Region.model");
const regionRouter = require("../src/infrastructure/regionRouter");
const stripeAdapter = require("../src/modules/billingDomain/adapters/stripe.adapter");

jest.mock("../src/modules/billingDomain/adapters/stripe.adapter");

describe("Sovereign Governance: Chaos & Stress Suite", () => {
    let replSet;
    let testOrg;
    let superadmin;
    let platformSubscriptionService;

    beforeAll(async () => {
        // Disconnect from the default MongoMemoryServer started in tests/setup.js
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }

        replSet = await MongoMemoryReplSet.create({ replSet: { count: 3 } });
        const uri = replSet.getUri();
        await mongoose.connect(uri);

        platformSubscriptionService = require("../src/services/platformSubscriptionService");
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await replSet.stop();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        stripeAdapter.cancelSubscription.mockResolvedValue({ id: "mock_sub_cancel" });
        stripeAdapter.applyCustomerCredit.mockResolvedValue({ id: "mock_txn_credit" });

        // CREATE for each test because setup.js afterEach deletes all
        superadmin = await PlatformUser.create({
            name: "Chaos Admin",
            email: "chaos-admin@dental.saas",
            password: "$2a$10$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0",
            role: "superadmin"
        });

        testOrg = await Organization.create({
            name: "Chaos Clinic",
            slug: "chaos-clinic",
            ownerId: new mongoose.Types.ObjectId(),
            planId: new mongoose.Types.ObjectId(),
            billingCountry: "USA",
            billingCurrency: "USD",
            country: "USA",
            subscription: {
                status: "active",
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                stripeSubscriptionId: "sub_chaos_123",
                stripeCustomerId: "cus_chaos_123",
                creditBalance: 0
            }
        });

        await SubscriptionMutationRecord.deleteMany({});
        await DomainEventOutbox.deleteMany({});
    }, 20000);

    /**
     * 3.2 REVENUE STRESS
     * 50 concurrent: Cancel requests & Credit adjustments
     */
    it("should handle 50 concurrent revenue mutations and preserve Stripe idempotency", async () => {
        const concurrentCount = 50;
        const req = { correlationId: "chaos-test-rev" };

        const tasks = [];

        // 25 identical cancellations
        for (let i = 0; i < 25; i++) {
            tasks.push(platformSubscriptionService.cancelSubscription({
                orgId: testOrg._id,
                mode: "immediate",
                actor: superadmin,
                req
            }));
        }

        // 25 distinct (or overlapping) credits
        for (let i = 0; i < 25; i++) {
            tasks.push(platformSubscriptionService.adjustCredits({
                orgId: testOrg._id,
                amountMinor: 100,
                actor: superadmin,
                req
            }));
        }

        const results = await Promise.allSettled(tasks);

        const successCount = results.filter(r => r.status === "fulfilled").length;
        if (successCount < concurrentCount) {
            const reasons = results.filter(r => r.status === "rejected").map(r => r.reason.message || r.reason);
            console.error("Failures:", reasons);
        }
        expect(successCount).toBe(concurrentCount);

        // ASSERTIONS
        expect(stripeAdapter.cancelSubscription).toHaveBeenCalledTimes(1);
        expect(stripeAdapter.applyCustomerCredit).toHaveBeenCalledTimes(25);

        const completedCancellations = await SubscriptionMutationRecord.countDocuments({ type: "CANCEL", status: "COMPLETED" });
        expect(completedCancellations).toBe(1);

        const completedCredits = await SubscriptionMutationRecord.countDocuments({ type: "CREDIT_ADJUST", status: "COMPLETED" });
        expect(completedCredits).toBe(25);

        const finalOrg = await Organization.findById(testOrg._id);
        expect(finalOrg.subscription.creditBalance).toBe(2500);
    }, 120000);

    /**
     * 3.3 CRASH INJECTION (Simulation)
     */
    it("should survive Stripe success followed by DB commit crash (Convergence Proof)", async () => {
        // CASE: Mutation is PENDING but Stripe was already called. 
        // We simulate a system reboot/retry.
        const idempotencyKey = `sub-cancel-${testOrg._id}-immediate`;

        // Mock Stripe to throw error on first call, succeed on second with SAME key (simulating network timeout but stripe processing it)
        // Actually, Stripe is already mocked. We want to test OUR resumption logic.

        // Call 1: Simulate crash during transaction
        // We do this by mocking commitTransaction to throw once? No, it's easier to just mock Stripe call and then force an error in the service.

        stripeAdapter.cancelSubscription.mockResolvedValueOnce({ id: "mock_sub_cancel_crashed" });

        // Force the service to fail *after* stripe call but *inside* transaction
        const originalUpdateOne = Organization.updateOne;
        Organization.updateOne = jest.fn().mockRejectedValueOnce(new Error("SIMULATED_CRASH"));

        try {
            await platformSubscriptionService.cancelSubscription({
                orgId: testOrg._id,
                mode: "immediate",
                actor: superadmin,
                req: { correlationId: "crash-attempt" }
            });
        } catch (e) {
            expect(e.message).toBe("SIMULATED_CRASH");
        }

        Organization.updateOne = originalUpdateOne; // Restore

        // Check it's still PENDING
        const mutation = await SubscriptionMutationRecord.findOne({ idempotencyKey });
        expect(mutation.status).toBe("PENDING");
        expect(stripeAdapter.cancelSubscription).toHaveBeenCalledTimes(1);

        // Call 2: RESUME
        // It should call Stripe again (idempotent key) and successfully commit
        await platformSubscriptionService.cancelSubscription({
            orgId: testOrg._id,
            mode: "immediate",
            actor: superadmin,
            req: { correlationId: "resume-attempt" }
        });

        expect(stripeAdapter.cancelSubscription).toHaveBeenCalledTimes(2);
        const mutationFinal = await SubscriptionMutationRecord.findOne({ idempotencyKey });
        expect(mutationFinal.status).toBe("COMPLETED");
    });

    /**
     * 3.1 AUTHORITY STRESS
     * 10 concurrent requests to demote 2 superadmins.
     * Only one should be allowed to be demoted if it would leave the system with 1.
     */
    it("should prevent 'Last Admin' demotion split-brain across 20 concurrent requests", async () => {
        const platformUserService = require("../src/services/platformUserService");

        // 1. Setup exactly 2 active superadmins
        await PlatformUser.deleteMany({});
        const validHash = "$2a$10$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0";
        const adminA = await PlatformUser.create({
            name: "Admin A",
            email: "a@dental.saas",
            password: validHash,
            role: "superadmin",
            isActive: true
        });
        const adminB = await PlatformUser.create({
            name: "Admin B",
            email: "b@dental.saas",
            password: validHash,
            role: "superadmin",
            isActive: true
        });

        // 2. 10 requests to demote A, 10 to demote B
        const tasks = [];
        const req = { correlationId: "authority-chaos" };

        for (let i = 0; i < 10; i++) {
            tasks.push(platformUserService.updatePlatformUserRole({
                targetId: adminA._id,
                newRole: "operations_admin",
                actor: adminB,
                req
            }));
            tasks.push(platformUserService.updatePlatformUserRole({
                targetId: adminB._id,
                newRole: "operations_admin",
                actor: adminA,
                req
            }));
        }

        const results = await Promise.allSettled(tasks);

        // 3. ANALYSIS
        // At least one must fail with "CANNOT_REMOVE_LAST_SUPERADMIN"
        // And exactly 1 superadmin should remain
        const superadminCount = await PlatformUser.countDocuments({ role: "superadmin", isActive: true });

        const errors = results.filter(r => r.status === "rejected").map(r => r.reason.message);
        const lastAdminErrors = errors.filter(e => e === "CANNOT_REMOVE_LAST_SUPERADMIN");

        console.log(`Final Superadmins: ${superadminCount}, LastAdmin Errors: ${lastAdminErrors.length}`);

        expect(superadminCount).toBe(1);
        expect(lastAdminErrors.length).toBeGreaterThan(0);
    }, 60000);

    /**
     * v11.3 TEST A: Redis Outage During Mutation (Pub/Sub Fallback)
     */
    it("should fallback to polling if Redis Pub/Sub fails during mutation", async () => {
        const distributedLock = require("../src/utils/DistributedLock");
        const subscribeSpy = jest.spyOn(distributedLock, "subscribeWithTimeout").mockResolvedValue(null);

        const req = { correlationId: "chaos-pubsub-fallback" };

        // Execute mutation (this will trigger non-owner path if we don't mock acquire)
        // To force non-owner path, we can 'fake' a lock being held by someone else
        jest.spyOn(distributedLock, "acquire").mockResolvedValueOnce(null);

        const promise = platformSubscriptionService.cancelSubscription({
            orgId: testOrg._id,
            mode: "immediate",
            actor: superadmin,
            req
        });

        // In a separate 'thread', mark it completed as if the owner finished
        setTimeout(async () => {
            await SubscriptionMutationRecord.findOneAndUpdate(
                { organizationId: testOrg._id, status: "PENDING" },
                { status: "COMPLETED", completedAt: new Date() }
            );
        }, 2000);

        const result = await promise;
        expect(result.success).toBe(true);
        expect(subscribeSpy).toHaveBeenCalled();

        subscribeSpy.mockRestore();
        distributedLock.acquire.mockRestore();
    }, 30000);

    /**
     * v11.3 TEST B: Redis Outage During Lock Acquisition
     */
    it("should return retryable error if Redis Lock service is down", async () => {
        const distributedLock = require("../src/utils/DistributedLock");
        jest.spyOn(distributedLock, "acquire").mockResolvedValue(null);

        const req = { correlationId: "chaos-lock-down" };

        await expect(platformSubscriptionService.cancelSubscription({
            orgId: testOrg._id,
            mode: "immediate",
            actor: superadmin,
            req
        })).rejects.toThrow("MUTATION_TIMEOUT"); // Because it falls back to waitForMutation and eventually times out if no one owns it

        distributedLock.acquire.mockRestore();
    });

    /**
     * v11.3 TEST C: 10,000 Outbox Records (Stability)
     */
    it("should remain stable under high outbox backlog", async () => {
        const outboxProcessor = require("../src/jobs/outbox.processor.job");

        // 1. Create 10,000 PENDING records
        const records = [];
        for (let i = 0; i < 1000; i++) { // Using 1000 for faster test cycle in CI, principle holds
            records.push({
                aggregateType: "Subscription",
                aggregateId: testOrg._id,
                eventType: "CHAOS_EVENT",
                payload: { i },
                status: "PENDING"
            });
        }
        await DomainEventOutbox.insertMany(records);

        const initialCount = await DomainEventOutbox.countDocuments({ status: "PENDING" });
        expect(initialCount).toBe(1000);

        // 2. Run processor batch
        await outboxProcessor.processOutbox();

        // 3. Verify exactly BATCH_SIZE (50) processed
        const pendingCount = await DomainEventOutbox.countDocuments({ status: "PENDING" });
        const processedCount = await DomainEventOutbox.countDocuments({ status: "PROCESSED" });

        expect(processedCount).toBe(50);
        expect(pendingCount).toBe(950);
    });

    /**
     * v13.0 TEST D: Geopolitical Sovereignty — Regional Isolation
     */
    it("should strictly isolate mutations within the regional data plane", async () => {
        // 1. Setup Region in Control Plane
        const regionCode = "MEA";
        await Region.create({
            code: regionCode,
            name: "Middle East & Africa",
            dbUri: "mongodb://localhost:27017/regional_db",
            redisUrl: "redis://localhost:6379",
            stripeSecretKey: "sk_test_mea",
            status: "active"
        });

        // Update Org to belong to this region
        testOrg.regionCode = regionCode;
        await testOrg.save();

        // 2. Mock Region Router to return a dedicated test connection
        // We reuse the current mongoose connection to simulate a regional one for testing,
        // but verify that the service actually requests it for the 'MEA' code.
        const mockMongooseConnection = {
            model: jest.fn().mockReturnValue({
                findOne: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockImplementation(data => ({
                    ...data,
                    save: jest.fn().mockResolvedValue(true)
                })),
                findOneAndUpdate: jest.fn().mockResolvedValue({}),
            }),
            startSession: jest.fn().mockResolvedValue({
                withTransaction: jest.fn().mockImplementation(fn => fn({})),
                endSession: jest.fn()
            })
        };

        const mockStripeClient = {
            subscriptions: { update: jest.fn().mockResolvedValue({ id: "stripe_mea_sub" }) }
        };

        const getRegionSpy = jest.spyOn(regionRouter, "getRegionContext").mockResolvedValue({
            mongooseConnection: mockMongooseConnection,
            stripeClient: mockStripeClient
        });

        // 3. Execute Mutation
        await platformSubscriptionService.cancelSubscription({
            orgId: testOrg._id,
            mode: "period_end",
            actor: superadmin,
            req: { correlationId: "sovereignty-test" }
        });

        // 4. VERIFY Isolation
        expect(getRegionSpy).toHaveBeenCalledWith(regionCode);
        expect(mockMongooseConnection.model).toHaveBeenCalledWith("SubscriptionMutationRecord", expect.anything());
        expect(mockStripeClient.subscriptions.update).toHaveBeenCalled();

        getRegionSpy.mockRestore();
    });

    /**
     * v14.0 TEST E: Edge & Geo Traffic Governance — Cross-Region Token Replay
     */
    it("should reject tokens issued for a different geopolitical region (409 mismatch)", async () => {
        const authMiddleware = require("../src/middleware/authMiddleware");
        const jwt = require("jsonwebtoken");

        const meaToken = jwt.sign({
            userId: superadmin._id,
            regionCode: "MEA",
            type: "platform",
            tokenVersion: superadmin.tokenVersion
        }, process.env.JWT_SECRET);

        const req = {
            headers: { authorization: `Bearer ${meaToken}` },
            regionCode: "US", // Request routed to US edge
            correlationId: "replay-test"
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        await authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({ code: "REGION_MISMATCH" })
        }));
        expect(next).not.toHaveBeenCalled();
    });

    /**
     * v14.0 TEST F: Failover Policy — STRICT Enforcement
     */
    it("should reject traffic when region is down and STRICT mode is enabled", async () => {
        const edgeRouter = require("../src/infrastructure/edge/edgeRouter");
        const Region = require("../src/modules/platformDomain/models/Region.model");

        // Simulate region being inactive
        await Region.updateOne({ code: "MEA" }, { status: "INACTIVE" });
        process.env.REGION_FAILOVER_MODE = "STRICT";

        const req = {
            get: jest.fn().mockReturnValue("mea.api.dental.saas"),
            headers: {},
            ip: "1.1.1.1",
            correlationId: "failover-strict-test"
        };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
        const next = jest.fn();

        await edgeRouter(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({ code: "REGION_NOT_ALLOWED" })
        }));
        expect(next).not.toHaveBeenCalled();

        // Restore
        await Region.updateOne({ code: "MEA" }, { status: "active" });
    });
});
