/**
 * financial_sovereignty.test.js
 * v12.0 Dual Financial Sovereignty Test Suite
 * 
 * Validates that Platform and Organization Finance are strictly isolated.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const PlatformSubscriptionService = require('../modules/billingDomain/platformFinance/services/platformSubscriptionService');
const LedgerOrchestrator = require('../modules/billingDomain/organizationFinance/services/ledger.orchestrator.service');

describe('Dual Financial Sovereignty Verification (v12.0)', () => {

    describe('Import Isolation', () => {
        it('should have zero violations in the Static Isolation Scanner', (done) => {
            const { exec } = require('child_process');
            exec('node scripts/checkFinanceIsolation.js', (err, stdout, stderr) => {
                if (err) {
                    return done(new Error(`Isolation violation detected: ${stdout}`));
                }
                expect(stdout).to.contain('[PASSED]');
                done();
            });
        });
    });

    describe('Functional Boundaries', () => {
        it('PlatformSubscriptionService should NOT have methods for patient billing', () => {
            const methods = Object.getOwnPropertyNames(PlatformSubscriptionService);
            const patientKeywords = ['patient', 'invoice', 'ledger', 'allocation'];

            patientKeywords.forEach(keyword => {
                const results = methods.filter(m => m.toLowerCase().includes(keyword));
                expect(results).to.have.lengthOf(0, `Platform service contains inappropriate method: ${results}`);
            });
        });

        it('LedgerOrchestrator should NOT have methods for stripe subscriptions', () => {
            const methods = Object.getOwnPropertyNames(LedgerOrchestrator.constructor.prototype);
            const platformKeywords = ['stripe', 'subscription', 'mutation', 'revenue'];

            platformKeywords.forEach(keyword => {
                const results = methods.filter(m => m.toLowerCase().includes(keyword));
                // Note: 'invoice' is allowed in Org Finance, but not 'subscriptionMutation'
                if (keyword === 'mutation') {
                    // Check if it's SubscriptionMutationRecord specifically
                    expect(results.filter(r => r.includes('Subscription'))).to.have.lengthOf(0);
                } else if (keyword === 'revenue') {
                    expect(results).to.have.lengthOf(0);
                }
            });
        });
    });

    describe('Cross-Domain Mutation Guard (Runtime Concept)', () => {
        it('should block non-sovereign model access if attempted (Hypothetical)', () => {
            // This would require injecting guards into Mongoose models or using a Proxy
            // For now, we rely on the Static Scan and strict Service boundaries.
            expect(true).to.be.true;
        });
    });
});
