require("module-alias/register");
/**
 * exportPlatformContract.js
 * v16.0 Sovereign Alignment — Deterministic Contract Exporter
 * 
 * Extracts authoritative capabilities and feature flags from the backend
 * and writes them to a JSON artifact for frontend drift prevention testing.
 */
const fs = require('fs');
const path = require('path');

// Pull authoritative definitions (No HTTP, no DB dependencies)
const { PLATFORM_CAPABILITIES } = require('../src/services/platformCapabilityResolver');
const { PLATFORM_FEATURE_FLAGS } = require('../src/config/platformFeatureFlags');

const EXPORT_PATH = path.join(__dirname, '../../frontend/src/platform/__tests__/platform-contract.json');

const CONTRACT_VERSION = "1.0.0";

const contract = {
    capabilities: [...PLATFORM_CAPABILITIES].sort(),
    featureFlags: Object.keys(PLATFORM_FEATURE_FLAGS).sort(),
    version: CONTRACT_VERSION,
    exportedAt: new Date().toISOString()
};

function ensureDirectoryOccurrence(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

try {
    ensureDirectoryOccurrence(EXPORT_PATH);
    fs.writeFileSync(EXPORT_PATH, JSON.stringify(contract, null, 2));
    console.log(`✅ Platform contract exported successfully to: ${EXPORT_PATH}`);
} catch (error) {
    console.error(`❌ Failed to export platform contract: ${error.message}`);
    process.exit(1);
}
