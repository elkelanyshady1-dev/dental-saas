/**
 * platformContract.test.js
 * v16.0 Sovereign Governance — Drift Prevention Suite
 * 
 * Validates the frontend feature registry against the backend exported contract.
 */
import { describe, it, expect } from 'vitest';
import { PLATFORM_FEATURES } from '@/platform/core/routing/platformFeatureRegistry';
import contract from './platform-contract.json';
import { z } from 'zod';

const STRICT = true;

// Contract Schema Validation
const ContractSchema = z.object({
    capabilities: z.array(z.string()),
    featureFlags: z.array(z.string()),
    version: z.string()
});

const EXPECTED_VERSION = "1.0.0";

describe('🏛 Platform Plane Contract Enforcement', () => {

    it('should match expected contract version', () => {
        expect(contract.version).toBe(EXPECTED_VERSION);
    });

    it('should pass schema validation', () => {
        const result = ContractSchema.safeParse(contract);
        expect(result.success).toBe(true);
    });

    it('should align all frontend capabilities with backend contract', () => {
        const frontendCaps = [...new Set(
            PLATFORM_FEATURES
                .map(f => f.capability)
                .filter(Boolean)
        )];

        frontendCaps.forEach(cap => {
            expect(contract.capabilities, `Frontend capability "${cap}" is missing in backend contract`).toContain(cap);
        });
    });

    it('should align all frontend feature flags with backend contract', () => {
        const frontendFlags = [...new Set(
            PLATFORM_FEATURES
                .map(f => f.featureFlag)
                .filter(Boolean)
        )];

        frontendFlags.forEach(flag => {
            expect(contract.featureFlags, `Frontend feature flag "${flag}" is missing in backend contract`).toContain(flag);
        });
    });

    if (STRICT) {
        it('STRICT: should not have orphan backend capabilities (all keys must be used)', () => {
            const frontendCaps = new Set(
                PLATFORM_FEATURES
                    .map(f => f.capability)
                    .filter(Boolean)
            );

            contract.capabilities.forEach(cap => {
                expect(frontendCaps, `STRICT FAIL: Backend capability "${cap}" has no frontend usage`).toContain(cap);
            });
        });

        it('STRICT: should not have orphan backend feature flags', () => {
            const frontendFlags = new Set(
                PLATFORM_FEATURES
                    .map(f => f.featureFlag)
                    .filter(Boolean)
            );

            contract.featureFlags.forEach(flag => {
                expect(frontendFlags, `STRICT FAIL: Backend feature flag "${flag}" has no frontend usage`).toContain(flag);
            });
        });
    }
});
