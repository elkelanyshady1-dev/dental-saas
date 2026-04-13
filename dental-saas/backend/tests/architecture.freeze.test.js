const fs = require('fs');
const path = require('path');

describe('Backend Architecture Freeze', () => {
    const forbiddenPatterns = [
        {
            pattern: ".subscription.plan =",
            isDomainSpecific: true,
            message: "Direct mutation of Organization.plan is forbidden. Use SubscriptionMutation service."
        },
        {
            pattern: "import Stripe",
            isDomainSpecific: true,
            message: "Stripe imports found outside dedicated adapter. Use stripe.adapter.js."
        },
        {
            pattern: ".toFixed(",
            isDomainSpecific: true,
            message: "Float precision detected via .toFixed(). Use Money utility for all monetary values."
        },
        {
            pattern: "* 0.",
            isDomainSpecific: true,
            message: "Decimal multiplication detected. Use Money.applyPercentage() or Money.prorate()."
        },
        {
            pattern: "/ 100",
            isDomainSpecific: true,
            message: "Hardcoded percentage division detected. Use Money.applyPercentage()."
        },
        {
            pattern: "parseFloat(",
            isDomainSpecific: true,
            message: "Float parsing detected. Financial values must use Money.fromDecimal() or fromMinor()."
        },
        {
            pattern: "role ===",
            isDomainSpecific: true,
            message: "Hardcoded role check detected. Use capabilityResolver or permissionMatrix."
        },

        // v8.2.1 Stabilization Patterns
        {
            pattern: "Number(",
            isDomainSpecific: true,
            message: "Explicit Number() casting detected in financial domain. Use Money.fromDecimal() or fromMinor()."
        },
        {
            pattern: "Math.round(",
            isDomainSpecific: true,
            whitelist: ["money.js"],
            message: "Math.round() detected in financial domain. Rounding must be handled by Money engine."
        },
        {
            pattern: /\b(?<!v)\d+\.\d+\b/iu,
            isRegex: true,
            isDomainSpecific: true,
            message: "Float literal detected in financial domain. All amounts must be minor integers. (Version strings like v8.2 are exempt)"
        },
        {
            pattern: /=\s*\d+\.\d+/,
            isRegex: true,
            isDomainSpecific: true,
            message: "Float assignment detected in financial domain. All amounts must be minor integers."
        }
    ];

    const financialDomains = [
        "modules/billingDomain",
        "modules/financialDomain",
        "core/finance"
    ];

    const scanDirectory = (dir, forbidden) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const normalizedPath = filePath.replace(/\\/g, '/');
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                if (!['node_modules', 'tests', 'dist', '.git'].includes(file)) {
                    scanDirectory(filePath, forbidden);
                }
            } else if (file.endsWith('.js')) {
                const content = fs.readFileSync(filePath, 'utf8');
                const isFinancialDomain = financialDomains.some(domain => normalizedPath.includes(domain));

                forbidden.forEach((item) => {
                    const { pattern, message, isDomainSpecific, whitelist, isRegex } = item;

                    // v8.2.1 Requirement: DO NOT modify Stripe adapter (Skip completely)
                    if (normalizedPath.includes('stripe.adapter.js')) return;

                    // Skip if domain-specific and NOT in a financial domain
                    if (isDomainSpecific && !isFinancialDomain) return;

                    // Skip if specific file is whitelisted for this pattern
                    if (whitelist && whitelist.some(w => normalizedPath.toLowerCase().endsWith(w.toLowerCase()))) return;

                    // Specific exception for capability/permission modules and auth controllers
                    const isAuthOrCapability = normalizedPath.includes('capability') || normalizedPath.includes('permission') || normalizedPath.includes('auth');
                    if (pattern === "role ===" && isAuthOrCapability) return;

                    let hasViolation = false;
                    if (isRegex) {
                        hasViolation = pattern.test(content);
                    } else {
                        hasViolation = content.includes(pattern);
                    }

                    if (hasViolation) {
                        throw new Error(`Architecture Violation in ${filePath}: ${message}`);
                    }
                });
            }
        });
    };

    it('should not contain forbidden architecture patterns', () => {
        const srcDir = path.resolve(__dirname, '../src');
        scanDirectory(srcDir, forbiddenPatterns);
    });
});
