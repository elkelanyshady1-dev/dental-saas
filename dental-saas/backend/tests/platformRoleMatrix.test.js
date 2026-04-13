/**
 * platformRoleMatrix.test.js
 * v20.1 Wave4 — Role Matrix Snapshot Test
 *
 * Generates a deterministic snapshot of the role → capability matrix
 * and compares it to a stored snapshot file. If the matrix changes
 * without updating the snapshot, the test fails.
 *
 * This prevents accidental role/capability drift.
 *
 * Usage: npx jest backend/tests/platformRoleMatrix.test.js
 */

const fs = require('fs');
const path = require('path');

const { PLATFORM_ROLES, PLATFORM_CAPABILITIES } = require('../../packages/platform-contract/platformContract.cjs.js');

const SNAPSHOT_PATH = path.resolve(__dirname, 'roleMatrixSnapshot.json');

function buildMatrix() {
    const matrix = {};

    // Sort roles alphabetically
    const sortedRoles = Object.keys(PLATFORM_ROLES).sort();

    for (const role of sortedRoles) {
        // Sort capabilities alphabetically for deterministic comparison
        matrix[role] = [...PLATFORM_ROLES[role]].sort();
    }

    // Also include the full capability enum for drift detection
    matrix.__capabilities__ = Object.values(PLATFORM_CAPABILITIES).sort();

    return matrix;
}

describe('Platform Role Matrix Snapshot', () => {
    test('role → capability matrix matches stored snapshot', () => {
        const currentMatrix = buildMatrix();

        if (!fs.existsSync(SNAPSHOT_PATH)) {
            // First run — create initial snapshot
            fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(currentMatrix, null, 2) + '\n');
            console.log(`[SNAPSHOT] Created initial snapshot at: ${SNAPSHOT_PATH}`);
            console.log('[SNAPSHOT] Review and commit this file to lock the matrix.');
            return; // Pass on first run
        }

        const storedSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

        // Deep comparison
        const currentJSON = JSON.stringify(currentMatrix, null, 2);
        const storedJSON = JSON.stringify(storedSnapshot, null, 2);

        if (currentJSON !== storedJSON) {
            // Show diff
            console.error('\n[ROLE MATRIX DRIFT DETECTED]');
            console.error('The platform role matrix has changed since the last snapshot.');
            console.error('');
            console.error('Current matrix:');
            console.error(currentJSON);
            console.error('');
            console.error('Stored snapshot:');
            console.error(storedJSON);
            console.error('');
            console.error('If this change is intentional, update the snapshot:');
            console.error(`  node -e "const m = require('./tests/platformRoleMatrix.test.js'); /* or run: */"`);
            console.error(`  Delete ${SNAPSHOT_PATH} and re-run tests to regenerate.`);
        }

        expect(currentMatrix).toEqual(storedSnapshot);
    });

    test('all capabilities in contract are assigned to at least one role', () => {
        const allCaps = new Set(Object.values(PLATFORM_CAPABILITIES));
        const assignedCaps = new Set();

        for (const role of Object.keys(PLATFORM_ROLES)) {
            for (const cap of PLATFORM_ROLES[role]) {
                assignedCaps.add(cap);
            }
        }

        const unassigned = [...allCaps].filter(c => !assignedCaps.has(c));

        if (unassigned.length > 0) {
            console.warn(`[WARNING] Capabilities not assigned to any role: ${unassigned.join(', ')}`);
        }

        // All capabilities should be assigned to at least one role
        expect(unassigned).toEqual([]);
    });

    test('superadmin has all capabilities', () => {
        const allCaps = Object.values(PLATFORM_CAPABILITIES);
        const superadminCaps = new Set(PLATFORM_ROLES.superadmin);

        const missing = allCaps.filter(c => !superadminCaps.has(c));

        expect(missing).toEqual([]);
    });
});
