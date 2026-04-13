const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const PlatformUser = require('../src/models/PlatformUser');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Plan = require('../src/modules/platformDomain/models/plan.model');
const AddOn = require('../src/modules/platformDomain/models/addOn.model');

describe('Add-On Merge Behavior', () => {
    let token;
    let organization;
    let basePlan;
    let extraUsersAddon;
    let owner;

    beforeEach(async () => {
        const superAdmin = await PlatformUser.create({
            name: 'Test Admin',
            email: 'admin@test.com',
            password: '$2a$10$nxW9S.iFpXTCvA9y9Z8z8u7X5Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7',
            role: 'superadmin',
            isActive: true,
            tokenVersion: 1
        });

        token = jwt.sign(
            { id: superAdmin._id, type: 'platform', tokenVersion: 1 },
            process.env.JWT_SECRET || 'testsecret'
        );

        owner = await User.create({
            name: 'Test Owner',
            email: 'owner@test.com',
            password: '$2a$10$nxW9S.iFpXTCvA9y9Z8z8u7X5Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7Y7',
            isActive: true
        });

        basePlan = await Plan.create({
            name: 'Growth Plan',
            code: 'pro',
            isActive: true,
            limits: { maxUsers: 5, maxBranches: 1 },
            modules: { communication: { smsQuota: 100 } }
        });

        organization = await Organization.create({
            name: 'Merge Test Org',
            slug: 'merge-org',
            billingCountry: 'USA',
            billingCurrency: 'USD',
            country: 'USA',
            ownerId: owner._id,
            planId: basePlan._id,
            subscription: {
                plan: 'pro',
                status: 'active'
            }
        });

        extraUsersAddon = await AddOn.create({
            name: 'Extra Users (5)',
            code: 'XUSER_5',
            type: 'LIMIT',
            benefits: { maxUsers: 5 },
            pricing: {
                regions: [{ regionCode: 'GLOBAL', currency: 'USD', monthly: 20, yearly: 200, countries: ['USA'] }]
            }
        });
    });

    it('should aggregate limits from plan and multiple active add-ons', async () => {
        // 1. Initial check
        const res1 = await request(app)
            .get(`/api/v1/platform/org/${organization._id}/subscription`)
            .set('Authorization', `Bearer ${token}`);

        expect(res1.body.data.limits.maxUsers).toBe(5);

        // 2. Add first add-on
        await request(app)
            .post(`/api/v1/platform/org/${organization._id}/add-addon`)
            .set('Authorization', `Bearer ${token}`)
            .send({ addOnId: extraUsersAddon._id });

        // 3. Verify merge
        const res2 = await request(app)
            .get(`/api/v1/platform/org/${organization._id}/subscription`)
            .set('Authorization', `Bearer ${token}`);

        expect(res2.body.data.limits.maxUsers).toBe(10);
        expect(res2.body.data.addOns).toContain('XUSER_5');
    });
});
