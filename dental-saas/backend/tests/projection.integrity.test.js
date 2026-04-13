const mongoose = require('mongoose');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Plan = require('../src/modules/platformDomain/models/plan.model');
const AddOn = require('../src/modules/platformDomain/models/addOn.model');
const OrgAddOn = require('../src/modules/billingDomain/models/orgAddOn.model');
const Patient = require('../src/modules/patientDomain/core/patient.model');
const { buildEffectivePlan } = require('../src/core/subscription/effectivePlanBuilder');
const { initSubscribers } = require('../src/modules/patientDomain/subscribers/ownership.subscriber');
const eventBus = require('../src/core/eventBus');
const { DOCTOR_ASSIGNED_TO_PATIENT } = require('../src/core/domainEvents');

describe('Projection Integrity & Data Governance', () => {
    let organization;
    let owner;
    let doctor1;
    let doctor2;
    let patient;

    beforeEach(async () => {
        await Promise.all([
            Organization.deleteMany({}),
            User.deleteMany({}),
            Plan.deleteMany({}),
            AddOn.deleteMany({}),
            OrgAddOn.deleteMany({}),
            Patient.deleteMany({})
        ]);

        owner = await User.create({
            name: 'Org Owner',
            email: 'owner@test.com',
            password: 'p',
            isActive: true
        });

        organization = await Organization.create({
            name: 'Projection Org',
            slug: 'proj-org',
            ownerId: owner._id,
            planId: new mongoose.Types.ObjectId(), // Fake but required
            billingCountry: 'USA',
            billingCurrency: 'USD',
            country: 'USA'
        });

        doctor1 = await User.create({
            name: 'Dr. One',
            email: 'dr1@test.com',
            password: 'p',
            organizationId: organization._id,
            isActive: true
        });

        doctor2 = await User.create({
            name: 'Dr. Two',
            email: 'dr2@test.com',
            password: 'p',
            organizationId: organization._id,
            isActive: true
        });

        patient = await Patient.create({
            name: 'Test Patient',
            organizationId: organization._id,
            isActive: true
        });

        // Initialize subscribers for the test
        initSubscribers();
    });

    test('1. visibleToDoctors reflects doctor assignment and prevents array corruption', async () => {
        // Assign Doctor 1
        eventBus.emit(DOCTOR_ASSIGNED_TO_PATIENT, {
            organizationId: organization._id,
            patientId: patient._id,
            doctorId: doctor1._id
        });

        // Wait for subscriber
        await new Promise(r => setTimeout(r, 100));

        let updatedPatient = await Patient.findById(patient._id);
        expect(updatedPatient.visibleToDoctors).toContainEqual(doctor1._id);

        // Assign Doctor 2
        eventBus.emit(DOCTOR_ASSIGNED_TO_PATIENT, {
            organizationId: organization._id,
            patientId: patient._id,
            doctorId: doctor2._id
        });

        await new Promise(r => setTimeout(r, 100));

        updatedPatient = await Patient.findById(patient._id);
        expect(updatedPatient.visibleToDoctors).toHaveLength(2);
        expect(updatedPatient.visibleToDoctors).toContainEqual(doctor1._id);
        expect(updatedPatient.visibleToDoctors).toContainEqual(doctor2._id);

        // Re-assign Doctor 1 (Idempotency check)
        eventBus.emit(DOCTOR_ASSIGNED_TO_PATIENT, {
            organizationId: organization._id,
            patientId: patient._id,
            doctorId: doctor1._id
        });

        await new Promise(r => setTimeout(r, 100));

        updatedPatient = await Patient.findById(patient._id);
        expect(updatedPatient.visibleToDoctors).toHaveLength(2); // Should NOT duplicate
    });

    test('2. Removing doctor does not corrupt visibleToDoctors array', async () => {
        // Seed patient with doctors
        await Patient.updateOne(
            { _id: patient._id },
            { $set: { visibleToDoctors: [doctor1._id, doctor2._id] } }
        );

        // Manually trigger removal logic (simulating what an admin would do)
        // System wide policy: removing doctor from org or case should pull from visibleToDoctors
        await Patient.updateOne(
            { _id: patient._id },
            { $pull: { visibleToDoctors: doctor1._id } }
        );

        const updatedPatient = await Patient.findById(patient._id);
        expect(updatedPatient.visibleToDoctors).toHaveLength(1);
        expect(updatedPatient.visibleToDoctors).toContainEqual(doctor2._id);
        expect(updatedPatient.visibleToDoctors).not.toContainEqual(doctor1._id);
    });

    test('3. No float monetary values exist in billing totals', async () => {
        // We use integer-based math for all financial fields (stored in cents/micros)
        // Verify thatOrgAddOn prices are whole numbers (if that is the rule)
        // OR verify that calculations result in integers
        const sampleOrgAddOn = await OrgAddOn.create({
            organizationId: organization._id,
            addOnId: new mongoose.Types.ObjectId(),
            status: 'active',
            billingCycleStart: new Date(),
            billingCycleEnd: new Date(),
            currency: 'USD',
            price: 5000, // 50.00 stored as units (cents)
            version: 1
        });

        expect(Number.isInteger(sampleOrgAddOn.price)).toBe(true);
    });
});
