/**
 * smsmisr.provider.js
 * Platform Infrastructure — SMS Provider (SMSMisr)
 * v2.0 — conforms to generic IMessageProvider contract: send({ to, body, type })
 *
 * SMSMisr is a template-based SMS gateway. The `body` argument carries the
 * values that are substituted into the pre-approved SMSMisr template
 * referenced by SMSMISR_TEMPLATE. For OTP delivery, `body` is the OTP code
 * (e.g. "123456") and the template is configured as "Your OTP is {#OTP#}".
 *
 * This provider is channel-agnostic — no OTP-specific logic lives here.
 * The OTP module calls the Communication dispatcher, which in turn calls
 * the SMS provider router (smsProvider.js), which routes to this module
 * when SMS_PROVIDER=smsmisr.
 *
 * Required env:
 *   SMSMISR_USERNAME, SMSMISR_PASSWORD, SMSMISR_SENDER, SMSMISR_TEMPLATE
 *   SMSMISR_LANGUAGE  (optional — "1" Arabic / "2" English, default "2")
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const https       = require("https");
const querystring = require("querystring");
const logger      = require("@utils/logger");

const SMSMISR_SUCCESS_CODE = "4901";
const MAX_ATTEMPTS         = 3;      // 1 initial + 2 retries (network-level only)
const REQUEST_TIMEOUT_MS   = 8000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskRecipient(phone) {
    if (typeof phone !== "string" || phone.length < 4) return "***";
    return phone.slice(0, -2).replace(/\d/g, "*") + phone.slice(-2);
}

function httpsPost(body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "smsmisr.com",
            path: "/api/SMS/",
            method: "POST",
            headers: {
                "Content-Type":   "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let raw = "";
            res.on("data", (chunk) => { raw += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(raw));
                } catch {
                    // SMSMisr sometimes returns bare code strings on error paths
                    resolve({ code: raw.trim() });
                }
            });
        });

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error("SMSMisr request timed out after 8s"));
        });

        req.on("error", reject);
        req.write(body);
        req.end();
    });
}

function assertCode(response) {
    const code = String(response?.code ?? response?.Code ?? "");
    if (code !== SMSMISR_SUCCESS_CODE) {
        const err = new Error(`SMSMisr rejected the request (code: ${code})`);
        err.gatewayCode = code;
        err.statusCode  = 502;
        err.errorCode   = "SMS_GATEWAY_ERROR";
        throw err;
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * send — generic provider interface (IMessageProvider-compatible).
 *
 * @param {Object} opts
 * @param {string} opts.to    - Recipient phone in E.164 digits (e.g. "2010XXXXXXXX")
 * @param {string} opts.body  - Template values string — substituted into SMSMISR_TEMPLATE
 * @param {string} [opts.type="GENERIC"] - Message classification for logging only
 * @returns {Promise<{ messageId: string, provider: string, gatewayCode: string }>}
 */
async function send({ to, body, type = "GENERIC" } = {}) {
    if (!to || !body) {
        throw new Error("[SMSMisr] 'to' and 'body' are required");
    }

    const username = process.env.SMSMISR_USERNAME;
    const password = process.env.SMSMISR_PASSWORD;
    const sender   = process.env.SMSMISR_SENDER;
    const template = process.env.SMSMISR_TEMPLATE;
    const language = process.env.SMSMISR_LANGUAGE || "2";

    if (!username || !password || !sender || !template) {
        throw new Error(
            "[SMSMisr] Not fully configured — check SMSMISR_USERNAME, SMSMISR_PASSWORD, " +
            "SMSMISR_SENDER, SMSMISR_TEMPLATE"
        );
    }

    const payload = querystring.stringify({
        username,
        password,
        sender,
        mobiles:  to,
        language,
        template,
        values:   body,   // template variable(s)
    });

    const masked = maskRecipient(to);
    let lastErr;
    let lastCode;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await httpsPost(payload);
            lastCode = String(response?.code ?? response?.Code ?? "");

            logger.debug(
                { to: masked, type, template, code: lastCode, attempt },
                "[SMSMisr] Gateway response"
            );

            assertCode(response);

            logger.info({ to: masked, type, attempt }, "[SMSMisr] Message sent successfully");
            return {
                messageId: `smsmisr-${Date.now()}-${attempt}`,
                provider: "smsmisr",
                gatewayCode: lastCode,
            };

        } catch (err) {
            lastErr = err;

            logger.warn(
                { to: masked, type, attempt, gatewayCode: err.gatewayCode, msg: err.message },
                `[SMSMisr] Send attempt ${attempt}/${MAX_ATTEMPTS} failed`
            );

            // Gateway rejections (4xxx codes) are deterministic — retrying won't help.
            // Only retry on network-level errors (timeout, ECONNRESET, etc.).
            if (err.gatewayCode) break;
        }
    }

    logger.error(
        { to: masked, type, gatewayCode: lastErr?.gatewayCode },
        "[SMSMisr] Delivery failed"
    );
    throw lastErr;
}

module.exports = { send };
