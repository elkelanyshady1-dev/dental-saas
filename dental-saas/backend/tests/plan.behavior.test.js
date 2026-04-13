const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const PlatformUser = require('../src/models/PlatformUser');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Branch = require('../src/models/Branch');
const Plan = require('../src/modules/platformDomain/models/plan.model');
const AddOn = require('../src/modules/platformDomain/models/addOn.model');
const OrgAddOn = require('../src/modules/billingDomain/models/orgAddOn.model');
const { buildEffectivePlan } = require('../src/core/subscription/effectivePlanBuilder');

describe('Backend Enterprise Behavior - Plan & Add-On Logic', () => {
    let token;
    let superAdmin;
    let organization;
    let basePlan;
    let enterprisePlan;
    let tinyPlan;
    let userAddon;
    let owner;

    beforeEach(async () => {
        // Clear collections
        await Promise.all([
            PlatformUser.deleteMany({}),
            Organization.deleteMany({}),
            User.deleteMany({}),
            Branch.deleteMany({}),
            Plan.deleteMany({}),
            AddOn.deleteMany({}),
            OrgAddOn.deleteMany({})
        ]);

        // 1. Seed Super Admin
        superAdmin = await PlatformUser.create({
            name: 'Audit Admin',
            email: 'admin@enterprise.com',
            password: '$2a$10$nxW9S.iFpXTCvA9y9Z8z8u7X5Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7',
            role: 'superadmin',
            isActive: true,
            tokenVersion: 1
        });

        token = jwt.sign(
            { id: superAdmin._id, type: 'platform', tokenVersion: 1 },
            process.env.JWT_SECRET || 'testsecret'
        );

        // 2. Seed Plans
        basePlan = await Plan.create({
            name: 'Base Plan',
            code: 'base',
            isActive: true,
            limits: { maxUsers: 5, maxBranches: 2 },
            modules: { communication: { smsQuota: 100 } }
        });

        enterprisePlan = await Plan.create({
            name: 'Enterprise Plan',
            code: 'enterprise',
            isActive: true,
            limits: { maxUsers: 100, maxBranches: 10 },
            modules: { communication: { smsQuota: 1000 } }
        });

        tinyPlan = await Plan.create({
            name: 'Tiny Plan',
            code: 'tiny',
            isActive: true,
            limits: { maxUsers: 1, maxBranches: 1 },
            modules: { communication: { smsQuota: 10 } }
        });

        // 3. Seed Add-on
        userAddon = await AddOn.create({
            name: 'Extra Users',
            code: 'extra-users',
            isActive: true,
            type: 'limit_extension',
            benefits: { maxUsers: 5 },
            pricing: {
                baseCurrency: 'USD',
                regions: [{ regionCode: 'GLOBAL', countries: ['USA'], monthly: 10, currency: 'USD' }]
            },
            version: 1
        });

        // 4. Seed Organization
        owner = await User.create({
            name: 'Org Owner',
            email: 'owner@test.com',
            password: 'password123',
            isActive: true
        });

        organization = await Organization.create({
            name: 'Behavior Test Org',
            slug: 'behavior-org',
            version: 0,
            isActive: true,
            ownerId: owner._id,
            planId: basePlan._id,
            billingCountry: 'USA',
            billingCurrency: 'USD',
            country: 'USA'
        });
    });

    test('1. Change plan updates planId and increments version correctly', async () => {
        const res = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: enterprisePlan._id,
                expectedVersion: 0
            });

        expect(res.status).toBe(200);
        expect(res.body.data.planId).toBe(enterprisePlan._id.toString());
        expect(res.body.data.version).toBe(1);

        const updatedOrg = await Organization.findById(organization._id);
        expect(updatedOrg.planId.toString()).toBe(enterprisePlan._id.toString());
        expect(updatedOrg.version).toBe(1);
    });

    test('2. Adding and removing add-on correctly affects effective limits', async () => {
        // Initial limits
        let effective = await buildEffectivePlan(organization._id);
        expect(effective.limits.maxUsers).toBe(5);

        // Add Add-on
        const addAddonRes = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/add-addon`)
            .set('Authorization', `Bearer ${token}`)
            .send({ addOnId: userAddon._id });

        expect(addAddonRes.status).toBe(200);
        const orgAddOnId = addAddonRes.body.data._id;

        // Check increased limits
        effective = await buildEffectivePlan(organization._id);
        expect(effective.limits.maxUsers).toBe(10); // 5 base + 5 addon

        // Remove Add-on
        const removeRes = await request(app)
            .delete(`/api/v1/platform/org/${organization._id}/remove-addon`)
            .set('Authorization', `Bearer ${token}`)
            .send({ orgAddOnId });

        expect(removeRes.status).toBe(200);

        // Check reverted limits
        effective = await buildEffectivePlan(organization._id);
        expect(effective.limits.maxUsers).toBe(5);
    });

    test('3. Invalid planId returns 400', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: fakeId,
                expectedVersion: 0
            });

        expect(res.status).toBe(400);
        expect(res.body.error.message).toBe('PLAN_NOT_FOUND');
    });

    test('4. Cannot downgrade below active usage constraints', async () => {
        // Add 2 active users (total 3 including owner)
        await User.create([
            { name: 'User 1', email: 'u1@test.com', password: 'p', organizationId: organization._id, isActive: true },
            { name: 'User 2', email: 'u2@test.com', password: 'p', organizationId: organization._id, isActive: true }
        ]);

        // Attempt to downgrade to tinyPlan (maxUsers: 1)
        const res = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: tinyPlan._id,
                expectedVersion: 0
            });

        // This test EXPECTS failure if the system enforces it
        // If it returns 200, then the behavior is "warn only"
        // But requested coverage says "Cannot downgrade", implying it should fail with error
        expect(res.status).toBe(400);
        expect(res.body.error.message).toBe('PLAN_INCOMPATIBLE_USAGE');
    });
});
