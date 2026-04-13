/**
 * check-aggregate-mutation.js
 * 
 * Static analysis script to enforce architectural boundaries.
 * v2.1 — Comprehensive Aggregate Coverage
 * 
 * Scans backend/src for prohibited mutations outside authorized aggregate services.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '../backend/src');
const MODULES_DIR = path.join(BASE_DIR, 'modules');

const VIOLATIONS = [];

function logViolation(file, message) {
    VIOLATIONS.push({ file, message });
}

/**
 * Recursively walk directory and find files
 */
function walk(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

/**
 * WHITELIST: Map of model names to authorized mutation services
 */
const AUTHORIZED_SERVICES = {
    'Patient': ['patient.aggregate.service.js'],
    'FinancialSnapshot': ['financialSnapshot.subscriber.js'],
    'ClinicalCase': ['clinicalProtocol.service.js', 'SCPEModels.js'], // Models.js allowed for schema definition/index
    'InventoryItem': ['inventory.subscriber.js', 'inventory.service.js'],
    'InventoryTransaction': ['inventory.subscriber.js', 'inventory.service.js'],
    'DoctorInvoice': ['alignerProduction.service.js'],
    'CaseCostSnapshot': ['inventory.subscriber.js', 'inventory.service.js'],
    'CaseMarginProjection': ['inventory.subscriber.js', 'inventory.service.js'] // Alias for cost snapshot often used in UI/Analytics
};

function scan() {
    console.log("🔍 Starting Comprehensive Aggregate Mutation Scan...");

    walk(BASE_DIR, (filePath) => {
        if (!filePath.endsWith('.js')) return;

        const content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);
        const relativePath = path.relative(BASE_DIR, filePath);

        // 1. Check Aggregate Mutations
        for (const [model, authorizedFiles] of Object.entries(AUTHORIZED_SERVICES)) {
            // Regex to find model mutations: Model.save, Model.updateOne, Model.findOneAndUpdate, Model.create, Model.delete, etc.
            const mutationRegex = new RegExp(`${model}\\.(save|updateOne|findOneAndUpdate|findByIdAndUpdate|create|delete|insert|updateMany)`, 'g');

            if (content.match(mutationRegex)) {
                // If violation found, check if the current file is authorized
                if (!authorizedFiles.includes(fileName)) {
                    logViolation(relativePath, `Direct mutation of ${model} detected. Only authorized in: ${authorizedFiles.join(', ')}`);
                }
            }
        }

        // 2. AuditLog Immutability (Strict: No update/delete allowed anywhere)
        if (content.match(/AuditLog\.(updateOne|findOneAndUpdate|findByIdAndUpdate|updateMany|deleteOne|deleteMany|remove)\(/)) {
            logViolation(relativePath, "PROHIBITED: Retroactive mutation or deletion of AuditLog detected.");
        }

        // 3. Analytics Domain Read-Only Enforcement
        if (filePath.includes(path.join('modules', 'analyticsDomain'))) {
            if (content.match(/\.(save|updateOne|findOneAndUpdate|findByIdAndUpdate|create|delete|insert|updateMany)\(/)) {
                logViolation(relativePath, "Analytics domain violation: Strictly read-only domain cannot perform mutations.");
            }
            if (content.includes('eventBus.emit(')) {
                logViolation(relativePath, "Analytics domain violation: Observational domain cannot emit events.");
            }
        }
    });

    // Report
    if (VIOLATIONS.length > 0) {
        console.error("\n❌ ARCHITECTURAL VIOLATIONS DETECTED:");
        VIOLATIONS.forEach(v => {
            console.error(`  - ${v.file}: ${v.message}`);
        });
        process.exit(1);
    }

    console.log("\n✅ Architectural Sovereignty Verified. Aggregates protected.");
    process.exit(0);
}

scan();
