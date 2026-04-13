/**
 * landmarks.controller.js — Landmark detection API endpoint.
 * Moved from orthodonticDomain/ → orthodontics/controllers/ (Phase 4 domain merge)
 *
 * Endpoints
 * ---------
 *   GET /api/v1/org/case/:caseId/landmarks
 *       → Runs Stage 3 landmark detection on the scan, returns per-type
 *         landmark coordinates for 3D viewer rendering.
 *
 *   GET /api/v1/org/case/:caseId/patches
 *       → Returns patch metadata (bounding boxes, centroids) for debug
 *         visualisation in the 3D viewer.
 *
 * Auth
 * ----
 *   Both routes use the existing `orgProtect` + `organizationContext`
 *   middleware applied at the router level in orgV1Routes.js.
 *
 * Python bridge
 * -------------
 *   Spawns `python-ai-engine/meshnet/landmarks/cli_runner.py` as a child
 *   process, passing the scan directory path and returning its stdout as
 *   structured JSON.
 *
 * @module orthodontics/controllers/landmarks
 */

const { spawn } = require('child_process');
const path = require('path');
// ✅ Model path updated: orthodonticDomain → orthodontics/models
const OrthodonticCaseDef = require('../models/orthodonticCase.model');
const getModel = require('@core/db/getModel');
const { authorize } = require('../../../utils/authorize');

function _getSecureOrthoCase(req) {
    return getModel(req.dbConnection, OrthodonticCaseDef);
}

const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const AI_ENGINE_ROOT = path.resolve(__dirname, '../../../../python-ai-engine');
const LANDMARK_CLI = path.join(AI_ENGINE_ROOT, 'meshnet', 'landmarks', 'landmark_cli.py');
const TIMEOUT_MS = 90_000;   // 90 s — landmark detection is heavier than FDI

// ── Landmark colours matching Python LandmarkType enum ──────────────────────
const LANDMARK_COLORS = {
    CUSP_TIP: [0, 120, 255],
    INCISAL_EDGE: [0, 220, 80],
    CENTRAL_GROOVE: [255, 200, 0],
    MESIAL_CONTACT: [255, 100, 0],
    DISTAL_CONTACT: [220, 0, 200],
    GINGIVAL_MARGIN: [180, 180, 180],
};

// ── Run Python landmark CLI ───────────────────────────────────────────────────
function _runLandmarkCli(scanPath, { threshold = 0.5, mode = 'geometry' } = {}) {
    return new Promise((resolve, reject) => {
        const args = [
            LANDMARK_CLI,
            '--scan', scanPath,
            '--mode', mode,
            '--threshold', String(threshold),
        ];

        const env = {
            ...process.env,
            PYTHONPATH: AI_ENGINE_ROOT,
        };

        const proc = spawn(PYTHON_BIN, args, { env, cwd: AI_ENGINE_ROOT });

        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error('Landmark CLI timeout'));
        }, TIMEOUT_MS);

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                return reject(new Error(
                    `Landmark CLI exited ${code}: ${stderr.slice(0, 500)}`
                ));
            }
            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(new Error('Landmark CLI output is not valid JSON'));
            }
        });
    });
}

// ── Build empty landmark structure (unanalysed state) ────────────────────────
function _emptyLandmarks() {
    return Object.fromEntries(
        Object.entries(LANDMARK_COLORS).map(([type, color]) => [
            type,
            { points: [], count: 0, color },
        ])
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Controller: GET /case/:caseId/landmarks
// ────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/org/case/:caseId/landmarks
 * @desc    Detect dental landmarks for an orthodontic case
 * @access  Org members (orgProtect + organizationContext)
 */
exports.getLandmarks = async (req, res) => {
    authorize(req, "orthodontics.read");
    const t0 = Date.now();
    const { caseId } = req.params;
    const { threshold = 0.5, mode = 'geometry' } = req.query;

    try {
        // ── Resolve case (RLS-enforced via org dbConnection) ──────────────────
        const orthoCase = await _getSecureOrthoCase(req).findOne(
            { _id: caseId }
        ).lean();

        if (!orthoCase) {
            return res.status(404).json({
                success: false, message: 'Orthodontic case not found',
            });
        }

        // ── Check scan link ───────────────────────────────────────────────────
        if (!orthoCase.scanFilePath) {
            return res.status(200).json({
                success: true,
                data: {
                    caseId,
                    analysed: false,
                    landmarks: _emptyLandmarks(),
                    patches: [],
                    meta: { n_total_landmarks: 0, elapsed_ms: Date.now() - t0 },
                    message: 'No scan file linked to this case.',
                },
            });
        }

        // ── Run landmark CLI ──────────────────────────────────────────────────
        let result;
        try {
            result = await _runLandmarkCli(orthoCase.scanFilePath, {
                threshold: parseFloat(threshold),
                mode: String(mode),
            });
        } catch (cliErr) {
            const isTimeout = cliErr.message?.includes('timeout');
            return res.status(isTimeout ? 503 : 500).json({
                success: false,
                message: isTimeout
                    ? 'Landmark detection timed out'
                    : `Landmark CLI error: ${cliErr.message}`,
            });
        }

        // ── Augment with colours ──────────────────────────────────────────────
        const landmarks = {};
        for (const [type, color] of Object.entries(LANDMARK_COLORS)) {
            const raw = result.landmarks?.[type] || {};
            landmarks[type] = {
                points: raw.points || [],
                count: raw.count ?? (raw.points?.length || 0),
                color: raw.color || color,
                description: raw.description || '',
            };
        }

        const nTotal = Object.values(landmarks)
            .reduce((s, v) => s + v.count, 0);

        return res.status(200).json({
            success: true,
            data: {
                caseId,
                analysed: true,
                landmarks,
                patches: result.patches || [],
                meta: {
                    n_total_landmarks: nTotal,
                    elapsed_ms: Date.now() - t0,
                    mode: String(mode),
                    threshold: parseFloat(threshold),
                },
            },
        });

    } catch (err) {
        console.error('[getLandmarks] Error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// ────────────────────────────────────────────────────────────────────────────
// Controller: GET /case/:caseId/patches
// ────────────────────────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/org/case/:caseId/patches
 * @desc    Return patch metadata (bounding boxes, centroids) for debug viz
 * @access  Org members (orgProtect + organizationContext)
 */
exports.getPatches = async (req, res) => {
    authorize(req, "orthodontics.read");
    const { caseId } = req.params;

    try {
        const orthoCase = await _getSecureOrthoCase(req).findOne(
            { _id: caseId }
        ).lean();

        if (!orthoCase) {
            return res.status(404).json({ success: false, message: 'Case not found' });
        }

        if (!orthoCase.scanFilePath) {
            return res.status(200).json({
                success: true,
                data: { caseId, patches: [], message: 'No scan linked' },
            });
        }

        let result;
        try {
            result = await _runLandmarkCli(orthoCase.scanFilePath, { mode: 'patches' });
        } catch (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        return res.status(200).json({
            success: true,
            data: {
                caseId,
                patches: result.patches || [],
            },
        });

    } catch (err) {
        console.error('[getPatches] Error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
