import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORM_DIR = path.join(__dirname, "../src/platform");

function scanDir(dir) {
    if (!fs.existsSync(dir)) {
        console.warn(`⚠️ Warning: Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else if (file.endsWith(".js") || file.endsWith(".jsx")) {
            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");

            lines.forEach((line, index) => {
                if (
                    line.includes("../services/") ||
                    line.includes("../../services/") ||
                    line.includes("./services/")
                ) {
                    console.error(
                        `❌ Relative service import found:\nFile: ${fullPath}\nLine: ${index + 1
                        }\n${line.trim()}`
                    );
                    process.exitCode = 1;
                }
            });
        }
    }
}

scanDir(PLATFORM_DIR);

if (!process.exitCode) {
    console.log("✅ No relative service imports detected.");
}
