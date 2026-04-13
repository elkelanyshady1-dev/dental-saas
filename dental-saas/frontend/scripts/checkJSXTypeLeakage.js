import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, "../src");

const TS_PATTERNS = [
    /:\s*any\b/,
    /:\s*string\b/,
    /:\s*number\b/,
    /:\s*boolean\b/,
    /:\s*object\b/,
    /\binterface\s+\w+/,
    /\btype\s+\w+\s*=/,
    /\bReact\.FC\b/,
    /<\w+>\s*\(/, // Generic function pattern
];

let violationCount = 0;

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith(".js") || file.endsWith(".jsx")) {
            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");

            let inBlockComment = false;

            lines.forEach((line, index) => {
                let trimmedLine = line.trim();

                // Handle block comments
                if (trimmedLine.startsWith("/*")) inBlockComment = true;

                if (!inBlockComment && !trimmedLine.startsWith("//") && !trimmedLine.startsWith("*")) {
                    TS_PATTERNS.forEach((pattern) => {
                        if (pattern.test(line)) {
                            console.error(
                                `❌ TypeScript syntax detected in JS(X) file:\nFile: ${fullPath}\nLine: ${index + 1
                                }\nContent: ${line.trim()}`
                            );
                            violationCount++;
                            process.exitCode = 1;
                        }
                    });
                }

                if (trimmedLine.endsWith("*/")) inBlockComment = false;
            });
        }
    }
}

scanDir(SRC_DIR);

if (violationCount === 0) {
    console.log("✅ No TypeScript syntax leakage detected in JSX files.");
} else {
    console.log(`\nFound ${violationCount} violations.`);
}
