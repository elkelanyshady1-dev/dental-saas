import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Frontend Governance Freeze Test
 * 
 * This test enforces architectural purity by scanning the frontend codebase
 * for patterns that violate governance rules, such as hardcoded plan strings,
 * role-based UI branching, and unauthorized API mutations.
 */

const SRC_PATH = path.resolve(__dirname, '../src');

const RULES = [
    {
        pattern: /"basic"|"enterprise"|"superadmin"|"operations_admin"|"finance_admin"|"analyst"/,
        message: "Hardcoded role or plan strings detected. Use PlatformMetadataContext or capabilities.",
        exceptions: ['setup.js', 'governance.freeze.test.js']
    },
    {
        pattern: /role\s*===|role\s*!==|user\.role/,
        message: "Hardcoded role check detected. Use capability-driven rendering via usePlatformCapabilities.",
        exceptions: []
    },
    {
        pattern: /"superadmin"/,
        message: "Hardcoded 'superadmin' string detected. Use capability-based checks.",
        exceptions: ['setup.js', 'governance.freeze.test.js']
    },
    {
        pattern: /import\s+Stripe/,
        message: "Stripe logic detected in frontend. Payments must be abstracted or handled via sovereign backend endpoints.",
        exceptions: []
    },
    {
        pattern: /api\.patch\("\(platform\/org|api\.patch\('\(platform\/org/,
        message: "Unauthorized direct platform organization patch detected. Use sovereign hooks/services or POST change-plan.",
        exceptions: []
    },
    {
        pattern: /[\*\+\-\/]\s*price|[\*\+\-\/]\s*total|[\*\+\-\/]\s*amount/,
        message: "Financial math detected in UI. All calculations must be performed by the backend service layer.",
        exceptions: []
    },
    {
        pattern: /\.toFixed\(/,
        message: "Floating point formatting detected. Backend must return pre-formatted or integer-based currency values.",
        exceptions: []
    }
];

function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles || [];

    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            if (file.endsWith('.js') || file.endsWith('.jsx')) {
                arrayOfFiles.push(fullPath);
            }
        }
    });

    return arrayOfFiles;
}

const targetFiles = getAllFiles(SRC_PATH);

describe("Frontend Governance Freeze Compliance", () => {
    if (targetFiles.length === 0) {
        test("No platform files found to scan", () => {
            // Just a placeholder to avoid empty suite warning
        });
        return;
    }

    test.each(targetFiles)("File %s should comply with governance rules", (filePath) => {
        const fileName = path.basename(filePath);
        const content = fs.readFileSync(filePath, 'utf8');

        RULES.forEach(rule => {
            if (rule.pattern.test(content)) {
                // Check exceptions
                const isException = rule.exceptions.some(ex => fileName.includes(ex));

                if (!isException) {
                    throw new Error(`
            GOVERNANCE VIOLATION:
            File: ${filePath}
            Rule: ${rule.message}
            Pattern: ${rule.pattern}
          `);
                }
            }
        });
    });
});
