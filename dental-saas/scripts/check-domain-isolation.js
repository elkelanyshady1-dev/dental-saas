/**
 * check-domain-isolation.js
 * 
 * Static analysis script to enforce domain isolation boundaries.
 * v1.3 — Production-Grade Cross-Domain Analysis
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.resolve(__dirname, '../backend/src/modules');

const VIOLATIONS = [];

function logViolation(file, message) {
    VIOLATIONS.push({ file, message });
}

function walk(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

/**
 * Get the list of all valid domain modules
 */
const DOMAINS = fs.readdirSync(MODULES_DIR).filter(f => fs.statSync(path.join(MODULES_DIR, f)).isDirectory());

function scan() {
    console.log("🔍 Starting Production-Grade Domain Isolation Scan...");

    walk(MODULES_DIR, (filePath) => {
        if (!filePath.endsWith('.js')) return;

        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(MODULES_DIR, filePath);
        const pathParts = relativePath.split(/[\\\/]/);
        const currentDomain = pathParts[0];

        // Match require paths that go into other domain folders
        // Example: require('../otherDomain/models/...')
        // This regex looks for imports that target any of the known sibling domains
        DOMAINS.forEach(otherDomain => {
            if (otherDomain === currentDomain) return;

            // Look for requires that specify the other domain folder
            // Regex matches: require('.../otherDomain/models/...') OR require('.../otherDomain/core/...')
            // BUT only if it looks like it's targeting modular structure
            const crossImportRegex = new RegExp(`require\\(['"][^'"]*/${otherDomain}/(models|core|services)/[^'"]*['"]\\)`, 'g');

            let match;
            while ((match = crossImportRegex.exec(content)) !== null) {
                const importPath = match[0];
                const matchesModel = importPath.includes('/models/') || importPath.includes('/core/');

                if (matchesModel) {
                    if (currentDomain === 'analyticsDomain') {
                        // Analytics is allowed to import snapshots
                        if (!importPath.includes('Snapshot')) {
                            logViolation(relativePath, `Analytics domain coupling: Importing raw aggregate from ${otherDomain}. Use snapshots or projections instead.`);
                        }
                    } else {
                        logViolation(relativePath, `Direct cross-domain aggregate coupling: ${currentDomain} -> ${otherDomain}.`);
                    }
                }
            }
        });

        // SCPE (Clinical Protocol) / Inventory Decoupling
        if (currentDomain === 'clinicalProtocolDomain') {
            if (content.match(/require\(['"].*(inventoryDomain|models\/InventoryModels).*['"]\)/)) {
                if (content.includes("require(")) {
                    logViolation(relativePath, "Sovereignty Violation: Clinical Protocol decoupled dependency breach (Inventory).");
                }
            }
        }
    });

    if (VIOLATIONS.length > 0) {
        console.error("\n❌ DOMAIN ISOLATION VIOLATIONS DETECTED:");
        VIOLATIONS.forEach(v => {
            console.error(`  - ${v.file}: ${v.message}`);
        });
        process.exit(1);
    }

    console.log("\n✅ Domain isolation verified. Sovereignty maintained.");
    process.exit(0);
}

scan();
