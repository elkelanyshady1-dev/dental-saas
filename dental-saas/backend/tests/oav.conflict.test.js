const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const PlatformUser = require('../src/models/PlatformUser');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Plan = require('../src/modules/platformDomain/models/plan.model');

/**
 * OAV Conflict Test
 * 
 * Verifies that the system enforces Optimistic Atomic Versioning (OAV)
 * by rejecting updates that provide a stale version.
 */
describe('Backend OAV Conflict Enforcement', () => {
    let token;
    let superAdmin;
    let organization;
    let fallbackPlan;
    let targetPlan;
    let owner;

    beforeEach(async () => {
        // Clear collections involved
        await PlatformUser.deleteMany({});
        await Organization.deleteMany({});
        await User.deleteMany({});
        await Plan.deleteMany({});

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

        targetPlan = await Plan.create({
            name: 'Enterprise Plan',
            code: 'enterprise',
            isActive: true,
            limits: { users: 50, branches: 10 },
            pricing: { monthly: 499 }
        });

        // 5. Seed Organization
        organization = await Organization.create({
            name: 'Conflict Test Org',
            slug: 'conflict-org',
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

    test('should reject update with 409 Conflict when expectedVersion is stale', async () => {
        // Step 1: Successful update (increments version to 1)
        const firstUpdate = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: targetPlan._id,
                expectedVersion: 0
            });

        expect(firstUpdate.status).toBe(200);
        expect(firstUpdate.body.data.version).toBe(1);

        // Step 2: Attempt update with STALE version (0)
        const secondUpdate = await request(app)
            .post(`/api/v1/platform/org/${organization._id}/change-plan`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                newPlanId: targetPlan._id,
                expectedVersion: 0 // Stale! Current version is 1.
            });

        // Step 3: Expect 409 Conflict
        expect(secondUpdate.status).toBe(409);
        expect(secondUpdate.body.error.code).toBe('VERSION_CONFLICT');
    });
});
