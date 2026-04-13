require("module-alias/register");
/**
 * checkRegionIsolation.js
 * v13.0 Geopolitical Sovereignty — Static Code Guard
 * 
 * Purpose: Scans service and job directories for prohibited usage of global mongoose 
 * or stripe clients in sovereign financial contexts.
 */
const fs = require('fs');
const path = require('path');

const PROHIBITED_IMPORTS = [
    'const AuditLog = require("../../../models/AuditLog")',
    'const Ticket = require("../../../models/Ticket")',
    'const SubscriptionMutationRecord = require("../models/SubscriptionMutationRecord.model")',
    'const RevenueSnapshotProjection = require("../models/RevenueSnapshotProjection.model")',
    'const DomainEventOutbox = require("../../../../models/DomainEventOutbox")',
    'const stripeAdapter = require("../adapters/stripe.adapter")'
];

const TARGET_PATHS = [
    'src/modules/billingDomain/platformFinance/services',
    'src/modules/supportDomain/services',
    'src/jobs',
    'src/modules/supportDomain/jobs'
];

function scan() {
    console.log("Starting Geopolitical Sovereignty Isolation Scan...");
    let violations = 0;

    TARGET_PATHS.forEach(target => {
        const fullPath = path.join(process.cwd(), target);
        if (!fs.existsSync(fullPath)) return;

        const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.js'));

        files.forEach(file => {
            const content = fs.readFileSync(path.join(fullPath, file), 'utf8');
            PROHIBITED_IMPORTS.forEach(prohibited => {
                if (content.includes(prohibited)) {
                    console.error(`[VIOLATION] ${target}/${file}: Uses global financial model import instead of Regional binding.`);
                    console.error(`    Found: ${prohibited}`);
                    violations++;
                }
            });

            // Check for direct mongoose.model calls without dynamic schema
            if (content.includes('mongoose.model("AuditLog"') || content.includes('mongoose.model("Ticket"')) {
                if (!content.includes('mongooseConnection.model')) {
                    console.error(`[VIOLATION] ${target}/${file}: Potential direct Mongoose model binding detected. Use regionContext.`);
                    violations++;
                }
            }
        });
    });

    if (violations > 0) {
        console.error(`\nScan failed with ${violations} sovereignty violations.`);
        process.exit(1);
    } else {
        console.log("\nGeopolitical Sovereignty Verified: No global leakage detected in financial services.");
    }
}

scan();
