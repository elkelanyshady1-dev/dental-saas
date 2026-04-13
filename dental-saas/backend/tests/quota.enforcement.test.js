const request = require('supertest');
const mongoose = require('mongoose');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Plan = require('../src/modules/platformDomain/models/plan.model');
const AddOn = require('../src/modules/platformDomain/models/addOn.model');
const OrgAddOn = require('../src/modules/billingDomain/models/orgAddOn.model');
const CommunicationUsage = require('../src/modules/communicationDomain/models/communicationUsage.model');
const CommunicationService = require('../src/infrastructure/communication/CommunicationService');
const { getCurrentBillingCycle } = require('../src/core/subscription/communicationQuota.service');

// Mock the queue infrastructure
jest.mock('../src/infrastructure/queues/communication.queue', () => ({
    addCommunicationJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' })
}));

describe('Quota Enforcement & Add-On Impact', () => {
    let organization;
    let basePlan;
    let owner;
    let smsAddon;

    beforeEach(async () => {
        await Promise.all([
            Organization.deleteMany({}),
            User.deleteMany({}),
            Plan.deleteMany({}),
            AddOn.deleteMany({}),
            OrgAddOn.deleteMany({}),
            CommunicationUsage.deleteMany({})
        ]);

        owner = await User.create({
            name: 'Org Owner',
            email: 'owner@test.com',
            password: 'password123',
            isActive: true
        });

        basePlan = await Plan.create({
            name: 'Lite Plan',
            code: 'lite',
            isActive: true,
            limits: { maxUsers: 1 },
            modules: {
                communication: {
                    enabled: true,
                    smsQuota: 5,
                    overage: { smsPrice: 0 }
                }
            }
        });

        smsAddon = await AddOn.create({
            name: 'SMS Booster',
            code: 'sms-booster',
            isActive: true,
            type: 'limit_extension',
            benefits: { smsQuota: 10 },
            pricing: {
                baseCurrency: 'USD',
                regions: [{ regionCode: 'GLOBAL', countries: ['USA'], monthly: 5, currency: 'USD' }]
            },
            version: 1
        });

        organization = await Organization.create({
            name: 'Quota Org',
            slug: 'quota-org',
            ownerId: owner._id,
            planId: basePlan._id,
            billingCountry: 'USA',
            billingCurrency: 'USD',
            country: 'USA'
        });
    });

    test('1. Quota cannot exceed plan cap without overage', async () => {
        const { start, end } = getCurrentBillingCycle();

        // Seed usage at the limit
        await CommunicationUsage.create({
            organizationId: organization._id,
            billingCycleStart: start,
            billingCycleEnd: end,
            smsUsed: 5,
            version: 0
        });

        // Attempt to send - should fail
        await expect(CommunicationService.sendSMS({
            organizationId: organization._id,
            to: '+1234567890',
            templateKey: 'WELCOME'
        })).rejects.toThrow('COMMUNICATION_QUOTA_EXCEEDED');
    });

    test('2. Add-on increases cap and allows further usage', async () => {
        const { start, end } = getCurrentBillingCycle();

        // Seed usage at the limit
        await CommunicationUsage.create({
            organizationId: organization._id,
            billingCycleStart: start,
            billingCycleEnd: end,
            smsUsed: 5,
            version: 0
        });

        // Add Add-on (increases quota by 10, total 15)
        await OrgAddOn.create({
            organizationId: organization._id,
            addOnId: smsAddon._id,
            status: 'active',
            billingCycleStart: start,
            billingCycleEnd: end,
            currency: 'USD',
            price: 5
        });

        // Attempt to send - should now succeed
        const result = await CommunicationService.sendSMS({
            organizationId: organization._id,
            to: '+1234567890',
            templateKey: 'WELCOME'
        });

        expect(result.queued).toBe(true);
    });

    test('3. Removing add-on reduces cap but does not corrupt ledger', async () => {
        const { start, end } = getCurrentBillingCycle();

        // Add Add-on
        const orgAddOn = await OrgAddOn.create({
            organizationId: organization._id,
            addOnId: smsAddon._id,
            status: 'active',
            billingCycleStart: start,
            billingCycleEnd: end,
            currency: 'USD',
            price: 5
        });

        // Seed usage above base but within augmented (e.g. 7)
        await CommunicationUsage.create({
            organizationId: organization._id,
            billingCycleStart: start,
            billingCycleEnd: end,
            smsUsed: 7,
            version: 0
        });

        // Cancel Add-on
        orgAddOn.status = 'cancelled';
        await orgAddOn.save();

        // Attempt to send - should fail as cap is back to 5
        await expect(CommunicationService.sendSMS({
            organizationId: organization._id,
            to: '+1234567890',
            templateKey: 'WELCOME'
        })).rejects.toThrow('COMMUNICATION_QUOTA_EXCEEDED');

        // Ledger (CommunicationUsage) should still have 7 used, not be corrupted
        const usage = await CommunicationUsage.findOne({ organizationId: organization._id, billingCycleStart: start });
        expect(usage.smsUsed).toBe(7);
    });

    test('4. CommunicationService cannot bypass assertCommunicationQuota', async () => {
        const { start, end } = getCurrentBillingCycle();

        // Kill any overage pricing
        await Plan.findByIdAndUpdate(basePlan._id, {
            'modules.communication.overage.smsPrice': 0
        });

        // Max usage
        await CommunicationUsage.create({
            organizationId: organization._id,
            billingCycleStart: start,
            billingCycleEnd: end,
            smsUsed: 100, // Way over
            version: 0
        });

        // Direct call to service
        await expect(CommunicationService.sendSMS({
            organizationId: organization._id,
            to: '+1234567890',
            templateKey: 'TEST'
        })).rejects.toThrow('COMMUNICATION_QUOTA_EXCEEDED');
    });
});
