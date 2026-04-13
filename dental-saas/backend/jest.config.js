const path = require("path");

// Shared module alias resolution for all test projects
const sharedModuleNameMapper = {
    "^@root/(.*)$": "<rootDir>/src/$1",
    "^@platform/(.*)$": "<rootDir>/src/platform/$1",
    "^@billing/(.*)$": "<rootDir>/src/platform/billing/$1",
    "^@finance/(.*)$": "<rootDir>/src/platform/finance/$1",
    "^@projections/(.*)$": "<rootDir>/src/projections/$1",
    "^@services/(.*)$": "<rootDir>/src/services/$1",
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
    "^@core/(.*)$": "<rootDir>/src/core/$1",
    "^@contracts/(.*)$": path.resolve(__dirname, "../packages/platform-contract/$1")
};

module.exports = {
    projects: [
        // ── Contract Tests (No DB — Pure Data Transformation) ────────────
        // Runs against Zod schemas + DTO builders only. No MongoDB, no setup.js.
        {
            displayName: "contracts",
            testEnvironment: "node",
            testMatch: ["**/tests/*.contract.test.js"],
            clearMocks: true,
            testTimeout: 10000,
            moduleNameMapper: sharedModuleNameMapper,
            // NO setupFilesAfterEnv — contract tests are DB-free
        },
        // ── Integration Tests (MongoDB Required) ─────────────────────────
        // Uses MongoMemoryReplSet + full bootstrap. Original behavior.
        {
            displayName: "integration",
            testEnvironment: "node",
            testMatch: ["**/tests/**/*.test.js"],
            testPathIgnorePatterns: ["\\.contract\\.test\\.js$"],
            clearMocks: true,
            setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
            testTimeout: 30000,
            moduleNameMapper: sharedModuleNameMapper,
        },
    ],
};

