/**
 * unsafeModelAccess.test.js
 *
 * Regression guard for C0 — no file in backend/src/ may call Mongoose
 * methods directly on a model-definition require result. The scanner at
 * scripts/scan-unsafe-models.js is the authoritative check; this test
 * wraps it so CI blocks merges that reintroduce the pattern.
 */

"use strict";

const path = require("path");
const { execFileSync } = require("child_process");

describe("Unsafe model access scanner", () => {
    test("backend source has zero unsafe model-access sites", () => {
        const scriptPath = path.resolve(__dirname, "../../scripts/scan-unsafe-models.js");
        let output = "";
        let exitCode = 0;
        try {
            output = execFileSync("node", [scriptPath], {
                encoding: "utf8",
                cwd: path.resolve(__dirname, "../.."),
            });
        } catch (err) {
            exitCode = err.status || 1;
            output = (err.stdout || "") + (err.stderr || "");
        }

        if (exitCode !== 0) {
            throw new Error(
                "scan-unsafe-models.js found violations — run `npm run check:models` to see the list.\n\n" +
                output
            );
        }
        expect(exitCode).toBe(0);
        expect(output).toMatch(/no unsafe model access/i);
    });
});
