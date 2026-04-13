const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const PlatformUser = require('../src/models/PlatformUser');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Plan = require('../src/modules/platformDomain/models/plan.model');

describe('OAV Plan Mutation', () => {
    let token;
    let superAdmin;
    let organization;
    let testPlan;
    let fallbackPlan;
    let owner;

    beforeEach(async () => {
        // 1. Seed Super Admin
        superAdmin = await PlatformUser.create({
            name: 'Test Superadmin',
            email: 'admin@test.com',
            password: '$2a$10$nxW9S.iFpXTCvA9y9Z8z8u7X5Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7',
            role: 'superadmin',
            isActive: true,
            tokenVersion: 1
        });

        // 2. Generate Token
        token = jwt.sign(
            { id: superAdmin._id, type: 'platform', tokenVersion: 1 },
            process.env.JWT_SECRET || 'testsecret'
        );

        // 3. Seed Owner
        owner = await User.create({
            name: 'Org Owner',
            email: 'owner@test.com',
            password: '$2a$10$nxW9S.iFpXTCvA9y9Z8z8u7X5Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7',
            isActive: true
        });

        // 4. Seed Plans
        fallbackPlan = await Plan.create({
            name: 'Basic Plan',
            code: 'basic',
            isActive: true,
            limits: { users: 5, branches: 1 },
            pricing: { monthly: 49 }
        });

        testPlan = await Plan.create({
            name: 'Pioneer Plan',
            code: 'pioneer',
            isActive: true,
            limits: { users: 10, branches: 2 },
            pricing: { monthly: 99 }
        });

        // 5. Seed Organization
        organization = await Organization.create({
            name: 'Test Org',
            slug: 'test-org',
            version: 0,
            isActive: true,
            ownerId: owner._id,
            planId: fallbackPlan._id,
            billingCountry: 'USA',
            billingCurrency: 'USD',
            country: 'USA',
            subscription: {
                plan: 'basic',
                status: 'active'
            }
        });
    });

    it('should successfully change plan and increment version', async () => {
        const res = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: testPlan._id,
                expectedVersion: 0
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.version).toBe(1);

        const updatedOrg = await Organization.findById(organization._id);
        expect(updatedOrg.version).toBe(1);
        expect(updatedOrg.planId.toString()).toBe(testPlan._id.toString());
    });

    it('should return 409 Conflict when expectedVersion is stale', async () => {
        // First update
        await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: testPlan._id,
                expectedVersion: 0
            });

        // Second update with same (now stale) version
        const res = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: testPlan._id,
                expectedVersion: 0
            });

        expect(res.status).toBe(409);
        expect(res.body.error.message).toContain('VERSION_CONFLICT');
    });
});
