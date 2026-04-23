/**
 * orthodonticTeeth.controller.js
 * Moved from orthodonticDomain/ → orthodontics/controllers/ (Phase 4 domain merge)
 * ═══════════════════════════════
 * GET /api/v1/org/case/:caseId/teeth
 *
 * Returns the FDI tooth chart for a given orthodontic case scan.
 *
 * The endpoint calls the Python AI engine (tooth_numbering pipeline) to
 * analyse the 3-D scan associated with the treatment case and returns a
 * structured JSON payload with:
 *   - Per-FDI status (present | missing)
 *   - Orthodontic measurements (widths, Bolton, Spee, overjet, overbite)
 *   - Arch summary (upper / lower tooth counts)
 *
 * @module orthodontics/controllers/orthodonticTeeth
 */

"use strict";

const path = require("path");
const { spawn } = require("child_process");
const logger = require("@utils/logger");
const getModel = require("@core/db/getModel");
// ✅ Model path updated: orthodonticDomain → orthodontics/models
const OrthoCaseDef = require("../models/orthodonticCase.model");
const { authorize } = require("../../../utils/authorize");

// Path to the Python AI engine root
const AI_ENGINE_ROOT = path.resolve(
    __dirname,
    "../../../../python-ai-engine"
);
const CLI_RUNNER = path.join(AI_ENGINE_ROOT, "meshnet", "tooth_numbering", "cli_runner.py");

// FDI slot lists (mirrors Python fdi_assignment.py)
const FDI_MAXILLARY = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_MANDIBULAR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const ALL_FDI = [...FDI_MAXILLARY, ...FDI_MANDIBULAR];

// ─── Mock response for cases with no scan yet ────────────────────────────────

function buildUnanalysedResponse() {
    const teeth = {};
    for (const fdi of ALL_FDI) {
        teeth[String(fdi)] = "unanalysed";
    }
    return teeth;
}

// ─── Python subprocess bridge ─────────────────────────────────────────────────

/**
 * Run the Python tooth numbering CLI and parse its JSON output.
 * @param {string} scanPath  — absolute path to the scan file
 * @param {number} timeoutMs — kill after this many milliseconds (default 60 s)
 * @returns {Promise<object>} — parsed JSON output from the CLI runner
 */
function runPythonNumbering(scanPath, timeoutMs = 60_000) {
    return new Promise((resolve, reject) => {
        const pyBin = process.env.PYTHON_BIN || "python";
        const args = [CLI_RUNNER, "--scan", scanPath, "--output-json"];

        logger.info({ cliRunner: CLI_RUNNER, scanPath }, "[teeth] Spawning Python numbering CLI");

        const proc = spawn(pyBin, args, {
            cwd: AI_ENGINE_ROOT,
            env: { ...process.env, PYTHONPATH: AI_ENGINE_ROOT },
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
            proc.kill("SIGTERM");
            reject(new Error(`Python CLI timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        proc.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                logger.error({ code, stderr }, "[teeth] Python CLI exited with error");
                return reject(new Error(`Python CLI failed (exit ${code}): ${stderr.slice(0, 500)}`));
            }
            try {
                const result = JSON.parse(stdout.trim());
                resolve(result);
            } catch (parseErr) {
                reject(new Error(`Failed to parse Python output: ${parseErr.message}`));
            }
        });

        proc.on("error", (err) => {
            clearTimeout(timer);
            reject(new Error(`Failed to spawn Python: ${err.message}`));
        });
    });
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/org/case/:caseId/teeth
 */
async function getTeethChart(req, res) {
    authorize(req, "orthodontics.read");
    const { caseId } = req.params;
    const includeWisdom = req.query.includeWisdom === "true";

    try {
        // ── 1. Resolve orthodontic case (RLS-enforced via org dbConnection) ──
        const OrthoCase = getModel(req.dbConnection, OrthoCaseDef);
        const orthoCase = await OrthoCase.findOne(
            { _id: caseId, }
        ).lean();

        if (!orthoCase) {
            return res.status(404).json({
                success: false,
                message: "Orthodontic case not found",
            });
        }

        // ── 2. Resolve scan file path ─────────────────────────────────────────
        const scanPath = orthoCase.scanFilePath || null;

        if (!scanPath) {
            logger.info({ caseId }, "[teeth] No scan file — returning unanalysed chart");
            return res.json({
                success: true,
                data: {
                    caseId,
                    analysed: false,
                    teeth: buildUnanalysedResponse(),
                    summary: { upper: 0, lower: 0, missing: 0, total: 0 },
                    measurements: null,
                },
            });
        }

        // ── 3. Run Python numbering pipeline ──────────────────────────────────
        const pyResult = await runPythonNumbering(scanPath);

        // ── 4. Filter wisdom teeth if not requested ───────────────────────────
        const WISDOM = ["18", "28", "38", "48"];
        const teethStatus = pyResult.teeth || {};
        const filteredTeeth = includeWisdom
            ? teethStatus
            : Object.fromEntries(
                Object.entries(teethStatus).filter(([k]) => !WISDOM.includes(k))
            );

        // ── 5. Build summary counts ───────────────────────────────────────────
        const upperFdi = new Set(FDI_MAXILLARY.map(String));
        let upperPresent = 0, lowerPresent = 0, totalMissing = 0;

        for (const [fdi, status] of Object.entries(filteredTeeth)) {
            if (status === "present") {
                upperFdi.has(fdi) ? upperPresent++ : lowerPresent++;
            } else if (status === "missing") {
                totalMissing++;
            }
        }

        return res.json({
            success: true,
            data: {
                caseId,
                analysed: true,
                teeth: filteredTeeth,
                summary: {
                    upper: upperPresent,
                    lower: lowerPresent,
                    missing: totalMissing,
                    total: upperPresent + lowerPresent,
                },
                measurements: pyResult.measurements || null,
            },
        });

    } catch (err) {
        logger.error({ err: err.message, caseId }, "[teeth] Error computing tooth chart");

        if (err.message.includes("Python CLI") || err.message.includes("spawn")) {
            return res.status(503).json({
                success: false,
                message: "AI engine temporarily unavailable",
                detail: process.env.NODE_ENV === "production" ? undefined : err.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

module.exports = { getTeethChart };
