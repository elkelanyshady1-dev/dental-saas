/**
 * otpController.js
 * Public Plane — OTP-Based Phone Verification for Signup Geo Routing
 * v3.0 — Unified Verification Engine (single source of truth)
 *
 * Endpoints:
 *   POST /public/request-otp   → sends OTP to phone (via Verification Engine fallback chain)
 *   POST /public/verify-otp    → validates OTP, extracts country, returns pricingToken
 *
 * Flow:
 *   1. Visitor enters email + phone
 *   2. Server extracts country from phone, generates 6-digit OTP
 *   3. OTP stored in VerificationToken via Verification Engine
 *   4. OTP delivered via Verification Engine: SMS → WhatsApp → email
 *   5. Visitor submits OTP
 *   6. Server validates via VerificationEngine.verifyToken()
 *   7. Returns { country, region, pricingToken }
 *
 * Migration complete: PhoneVerificationToken dual-write removed (v3.0).
 * VerificationEngine is the sole source of truth for OTP tokens.
 *
 * Sentinel §4: ISO country codes only.
 * PLANE: Shared / Public
 *
 * @swagger
 * tags:
 *   - name: Public OTP
 *     description: Phone-based OTP verification for signup geo routing
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const {
  parsePhoneNumberFromString
} = require("libphonenumber-js");
// PhoneVerificationToken import removed — VerificationEngine is now sole SSOT (v3.0)
const verificationEngine = require("@core/auth/verificationEngine.service");
const {
  extractCountryFromPhone
} = require("@core/geo/phoneCountryExtractor");
const {
  resolveRegionCode
} = require("@billing/pricing/pricingRegionResolver");
const logger = require("@utils/logger");
const {
  DEV_AUTH_MODE
} = require("@config/authConfig");

// ─── Phone normalization helper ───────────────────────────────────────────────
// Normalizes phone to E.164 format before storage and lookup.
// Prevents OTP lookup miss when frontend sends slightly different formats.
function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return phone;
  const normalized = phone.startsWith("+") ? phone : `+${phone}`;
  const parsed = parsePhoneNumberFromString(normalized);
  if (!parsed) return phone;
  return parsed.number; // E.164 format
}

// ─── Configuration ────────────────────────────────────────────────────────────
const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const PRICING_TOKEN_TTL_S = 600; // 10 minutes
const MAX_OTP_REQUESTS_PER_PHONE = 5; // per OTP_EXPIRY window

// v24.0 — Phase 6 cleanup (Redis backing removed).
// Pricing tokens live in a per-process in-memory Map with a periodic
// sweep. Multi-instance caveat: a token issued on instance A is NOT
// visible on instance B — pricing-token exchange must hit the same
// instance. Acceptable for the current deployment; revisit if the
// OTP flow starts crossing load-balanced instances.
const _memFallback = new Map();
// ALLOWED_POLLING: CLEANUP
const _memCleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of _memFallback) {
    if (data.expiresAt < now) _memFallback.delete(token);
  }
}, 60_000);
_memCleanup.unref();

/**
 * Internal helpers for pricing token CRUD (in-memory, TTL-swept).
 */
async function _storePricingToken(token, data, ttlSeconds) {
  data.expiresAt = Date.now() + ttlSeconds * 1000;
  _memFallback.set(token, data);
}
async function _getPricingToken(token) {
  const data = _memFallback.get(token);
  if (!data) return null;
  if (data.expiresAt < Date.now()) {
    _memFallback.delete(token);
    return null;
  }
  return data;
}
async function _deletePricingToken(token) {
  _memFallback.delete(token);
}

/**
 * @swagger
 * /api/public/request-otp:
 *   post:
 *     tags: [Public OTP]
 *     summary: Request OTP for phone verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, email]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+201234567890"
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Invalid phone number
 *       429:
 *         description: Too many OTP requests
 */
exports.requestOtp = async (req, res) => {
  try {
    // ── Accept both 'phone' and 'phoneNumber' field names ─────────────────
    const rawPhone = req.body.phone || req.body.phoneNumber;
    const phone = normalizePhone(rawPhone);
    const {
      email
    } = req.body;
    logger.debug({
      phone: phone ? phone.slice(0, 6) + "****" : "MISSING",
      DEV_AUTH_MODE
    }, "[OTP] request-otp received");
    if (!phone || !email) {
      return res.status(400).json({
        success: false,
        message: "phone and email are required"
      });
    }

    // ── Validate phone and extract country ────────────────────────────────
    const {
      country,
      isValid
    } = extractCountryFromPhone(phone);
    if (!isValid || !country) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number. Please use international format (e.g. +201234567890)."
      });
    }

    // ── DEV MODE: OTP bypass for local development ────────────────────────
    // Requires NODE_ENV=development AND DEV_AUTH_MODE=true.
    // Skip MongoDB + SMS entirely. Enter "123456" on the next step.
    if (DEV_AUTH_MODE) {
      logger.warn({
        phone: phone.slice(0, 6) + "****"
      }, "[OTP] DEV_AUTH_MODE: request-otp bypassed — no DB write, no SMS");
      return res.status(200).json({
        success: true,
        devBypass: true,
        message: "DEV_AUTH_MODE: Enter OTP code 123456 to continue.",
        expiresInSeconds: 600
      });
    }
    // ── END DEV MODE BYPASS ───────────────────────────────────────────────

    // ── Rate limit: handled by VerificationEngine.requestVerification() ────
    // The engine enforces MAX_OTP_REQUESTS_PER_PHONE internally via
    // VerificationToken.countDocuments() + purpose-based rate limiting.

    // ── v2.0: Use Verification Engine (primary) with legacy dual-write ──
    // The Verification Engine handles:
    //   1. OTP generation (crypto.randomInt)
    //   2. bcrypt hashing
    //   3. VerificationToken storage
    //   4. Event emission → listener → SMS → WhatsApp → email fallback chain
    let engineResult;
    try {
      engineResult = await verificationEngine.requestVerification({
        purpose: "PHONE_OTP",
        identifier: phone,
        metadata: {
          email,
          name: email.split("@")[0],
          country
        }
      });
    } catch (engineErr) {
      // If engine call itself failed (e.g. rate limit), propagate
      if (engineErr.statusCode === 429) {
        return res.status(429).json({
          success: false,
          message: engineErr.message
        });
      }
      logger.error({
        err: engineErr.message,
        phone
      }, "[OTP] Verification engine requestVerification failed");
      return res.status(500).json({
        success: false,
        message: "Unable to send verification code."
      });
    }

    // Legacy dual-write to PhoneVerificationToken removed (v3.0).
    // VerificationEngine is the sole source of truth.

    logger.info({
      phone: phone.slice(0, 6) + "****",
      country,
      channel: engineResult.channel
    }, "[OTP] OTP requested via Verification Engine");
    return res.status(200).json({
      success: true,
      message: "Verification code sent. Check your phone or email.",
      expiresInSeconds: Math.floor(OTP_EXPIRY_MS / 1000)
    });
  } catch (error) {
    logger.error({
      err: error,
      service: "OTPController",
      action: "request_otp"
    }, "OTP request failed");
    return res.status(500).json({
      success: false,
      message: "Unable to send verification code."
    });
  }
};

/**
 * @swagger
 * /api/public/verify-otp:
 *   post:
 *     tags: [Public OTP]
 *     summary: Verify OTP and receive pricing token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+201234567890"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified — returns pricing token + country + region
 *       400:
 *         description: Invalid or expired OTP
 *       429:
 *         description: Too many failed attempts
 */
exports.verifyOtp = async (req, res) => {
  try {
    // ── Accept both 'phone' and 'phoneNumber' field names ─────────────────
    const rawPhone = req.body.phone || req.body.phoneNumber;
    const phone = normalizePhone(rawPhone);
    const {
      otp
    } = req.body;
    logger.debug({
      phone: phone ? phone.slice(0, 6) + "****" : "MISSING",
      otpLength: otp ? otp.length : 0,
      DEV_AUTH_MODE
    }, "[OTP] verify-otp request received");
    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "phone and otp are required"
      });
    }

    // ── DEV MODE: OTP bypass for local development ────────────────────────
    // Requires NODE_ENV=development AND DEV_AUTH_MODE=true.
    // Accepts fixed code "123456". No DB lookup, no bcrypt, no SMS.
    // pricingToken TTL is 24h in dev so restarts don't expire it.
    if (DEV_AUTH_MODE && otp === "123456") {
      const {
        country
      } = extractCountryFromPhone(phone);
      const region = resolveRegionCode(country || "US");
      const DEV_TOKEN_TTL_S = 60 * 60 * 24; // 24 hours in dev
      const pricingToken = crypto.randomBytes(32).toString("hex");
      await _storePricingToken(pricingToken, {
        phone,
        country: country || "US",
        region,
        verified: true
      }, DEV_TOKEN_TTL_S);
      logger.warn({
        phone: phone.slice(0, 6) + "****",
        country,
        region
      }, "[OTP] DEV_AUTH_MODE: verify-otp bypassed — pricingToken issued (24h TTL)");

      // v30.1: Send Email OTP even in DEV mode
      const devEmail = req.body.email;
      let emailOtpSent = false;
      if (devEmail) {
        try {
          const bcryptDev = require("bcryptjs");
          // @rls-public-plane — pre-signup public endpoint, no org context exists yet
          const VerificationTokenDef = require("@shared/models/VerificationToken.model");
          const VerificationToken = getPlatformModel(VerificationTokenDef);
          const {
            dispatch: sendComm
          } = require("@infra/communication/communication.dispatcher");
          const emailOtp = crypto.randomInt(100000, 999999).toString();
          const emailOtpHash = await bcryptDev.hash(emailOtp, 10);
          await VerificationToken.updateMany({
            purpose: "EMAIL_VERIFY",
            identifier: devEmail.toLowerCase().trim(),
            isUsed: false
          }, {
            $set: {
              isUsed: true
            }
          });
          await VerificationToken.create({
            purpose: "EMAIL_VERIFY",
            identifier: devEmail.toLowerCase().trim(),
            tokenHash: emailOtpHash,
            channel: "email",
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            attempts: 0,
            maxAttempts: 5,
            isUsed: false,
            metadata: {
              name: devEmail.split("@")[0],
              phone
            }
          });
          await sendComm({
            channel: "email",
            type: "EMAIL_OTP",
            payload: {
              email: devEmail.toLowerCase().trim(),
              otp: emailOtp,
              name: devEmail.split("@")[0],
              subject: "Verify Your Email — OrthoNoe"
            }
          });
          emailOtpSent = true;
          logger.warn({
            email: devEmail.slice(0, 4) + "****",
            otp: emailOtp
          }, "[OTP] DEV_AUTH_MODE: Email OTP sent (logged for dev convenience)");
        } catch (emailErr) {
          logger.warn({
            err: emailErr.message
          }, "[OTP] DEV_AUTH_MODE: Email OTP send failed (non-blocking)");
        }
      }
      return res.status(200).json({
        success: true,
        devMode: true,
        verified: true,
        phoneNumber: phone,
        country: country || "US",
        region,
        pricingToken,
        pricingTokenExpiresIn: DEV_TOKEN_TTL_S,
        emailOtpSent
      });
    }
    // ── END DEV MODE BYPASS ───────────────────────────────────────────────

    // ── v3.0: Verify via Verification Engine (sole SSOT) ──────────────────
    let verified = false;
    try {
      const engineResult = await verificationEngine.verifyToken({
        purpose: "PHONE_OTP",
        identifier: phone,
        rawToken: otp
      });
      verified = engineResult.valid;
    } catch (engineErr) {
      if (engineErr.statusCode === 429) {
        return res.status(429).json({
          success: false,
          message: engineErr.message
        });
      } else if (engineErr.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: engineErr.message,
          attemptsRemaining: engineErr.attemptsRemaining
        });
      } else {
        logger.error({
          err: engineErr.message
        }, "[OTP] Verification Engine verify failed");
        return res.status(500).json({
          success: false,
          message: "Verification failed. Please try again."
        });
      }
    }

    // ── Extract country and resolve region ───────────────────────────────
    const {
      country
    } = extractCountryFromPhone(phone);
    const region = resolveRegionCode(country || "US");

    // ── Generate pricing token ───────────────────────────────────────────
    const pricingToken = crypto.randomBytes(32).toString("hex");
    await _storePricingToken(pricingToken, {
      phone,
      country: country || "US",
      region,
      verified: true
    }, PRICING_TOKEN_TTL_S);
    logger.info({
      phone: phone.slice(0, 6) + "****",
      country,
      region
    }, "[OTP] Phone verified — pricing token issued");

    // ── v30.0: Send Email OTP immediately after phone verification ────────
    // Email comes from the verify-otp request body (frontend passes it along).
    const email = req.body.email;
    let emailOtpSent = false;
    if (email) {
      try {
        const bcryptEmail = require("bcryptjs");
        // @rls-public-plane — pre-signup public endpoint, no org context exists yet
        const VerificationTokenDef = require("@shared/models/VerificationToken.model");
        const VerificationToken = getPlatformModel(VerificationTokenDef);
        const {
          dispatch: sendComm
        } = require("@infra/communication/communication.dispatcher");
        const emailOtp = crypto.randomInt(100000, 999999).toString();
        const emailOtpHash = await bcryptEmail.hash(emailOtp, 10);

        // Invalidate any previous EMAIL_VERIFY tokens for this email
        await VerificationToken.updateMany({
          purpose: "EMAIL_VERIFY",
          identifier: email.toLowerCase().trim(),
          isUsed: false
        }, {
          $set: {
            isUsed: true
          }
        });
        await VerificationToken.create({
          purpose: "EMAIL_VERIFY",
          identifier: email.toLowerCase().trim(),
          tokenHash: emailOtpHash,
          channel: "email",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 0,
          maxAttempts: 5,
          isUsed: false,
          metadata: {
            name: email.split("@")[0],
            phone
          }
        });
        await sendComm({
          channel: "email",
          type: "EMAIL_OTP",
          payload: {
            email: email.toLowerCase().trim(),
            otp: emailOtp,
            name: email.split("@")[0],
            subject: "Verify Your Email — OrthoNoe"
          }
        });
        emailOtpSent = true;
        logger.info({
          email: email.slice(0, 4) + "****"
        }, "[OTP] Email OTP sent immediately after phone verification");
      } catch (emailErr) {
        logger.warn({
          err: emailErr.message
        }, "[OTP] Email OTP send failed after phone verification (non-blocking)");
      }
    }
    return res.status(200).json({
      success: true,
      verified: true,
      phoneNumber: phone,
      country: country || "US",
      region,
      pricingToken,
      pricingTokenExpiresIn: PRICING_TOKEN_TTL_S,
      emailOtpSent
    });
  } catch (error) {
    logger.error({
      err: error,
      service: "OTPController",
      action: "verify_otp"
    }, "OTP verification failed");
    return res.status(500).json({
      success: false,
      message: "Verification failed."
    });
  }
};

/**
 * validatePricingToken
 * Validates a pricing token and returns the associated data.
 *
 * @param {string} token
 * @returns {{ valid: boolean, data?: { phone, country, region } }}
 */
exports.validatePricingToken = async token => {
  if (!token) return {
    valid: false
  };
  const data = await _getPricingToken(token);
  if (!data) return {
    valid: false
  };
  return {
    valid: true,
    data: {
      phone: data.phone,
      country: data.country,
      region: data.region
    }
  };
};

/**
 * consumePricingToken
 * Validates AND removes a pricing token (one-time use for signup).
 *
 * @param {string} token
 * @returns {Promise<{ valid: boolean, data?: { phone, country, region } }>}
 */
exports.consumePricingToken = async token => {
  const result = await exports.validatePricingToken(token);
  if (result.valid) {
    await _deletePricingToken(token);
  }
  return result;
};

// ────────────────────────────────────────────────────────────────────────────
// v30.0: PUBLIC Email OTP Verification (pre-signup — user doesn't exist yet)
// ────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/public/verify-email-otp:
 *   post:
 *     summary: Verify email OTP during signup flow (pre-account creation)
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired OTP
 */
exports.verifyEmailOtpPublic = async (req, res) => {
  try {
    const {
      email,
      otp
    } = req.body;
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required."
      });
    }

    // DEV MODE: accept 123456 as valid email OTP
    if (DEV_AUTH_MODE && otp === "123456") {
      logger.warn({
        email: email.slice(0, 4) + "****"
      }, "[OTP] DEV_AUTH_MODE: Email OTP bypassed with 123456");
      return res.status(200).json({
        success: true,
        emailVerified: true,
        devMode: true,
        message: "Email verified successfully (dev bypass)."
      });
    }
    const bcryptLib = require("bcryptjs");
    // @rls-public-plane — pre-signup public endpoint, no org context exists yet
    const VerificationTokenDef = require("@shared/models/VerificationToken.model");
    const VerificationToken = getPlatformModel(VerificationTokenDef);
    const normalizedEmail = email.toLowerCase().trim();

    // @rls-public-plane — pre-auth public endpoint, no JWT context available
    const tokenDoc = await VerificationToken.findOne({
      purpose: "EMAIL_VERIFY",
      identifier: normalizedEmail,
      isUsed: false,
      expiresAt: {
        $gt: new Date()
      }
    }).sort({
      createdAt: -1
    });
    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        message: "No valid verification code found. Please request a new one."
      });
    }

    // Max attempts guard
    if (tokenDoc.attempts >= (tokenDoc.maxAttempts || 5)) {
      tokenDoc.isUsed = true;
      await tokenDoc.save();
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please request a new code."
      });
    }
    const isMatch = await bcryptLib.compare(otp, tokenDoc.tokenHash);
    tokenDoc.attempts += 1;
    if (!isMatch) {
      await tokenDoc.save();
      return res.status(400).json({
        success: false,
        message: "Invalid verification code.",
        attemptsRemaining: (tokenDoc.maxAttempts || 5) - tokenDoc.attempts
      });
    }

    // OTP matched — mark used (no User update since user doesn't exist yet)
    tokenDoc.isUsed = true;
    await tokenDoc.save();
    logger.info({
      email: normalizedEmail.slice(0, 4) + "****"
    }, "[OTP] Email OTP verified (pre-signup)");
    return res.status(200).json({
      success: true,
      emailVerified: true,
      message: "Email verified successfully."
    });
  } catch (error) {
    logger.error({
      err: error.message
    }, "[OTP] verifyEmailOtpPublic error");
    return res.status(500).json({
      success: false,
      message: "Verification failed."
    });
  }
};

/**
 * @swagger
 * /api/public/resend-email-otp:
 *   post:
 *     summary: Resend email verification OTP during signup flow
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification code sent
 *       429:
 *         description: Too many requests
 */
exports.resendEmailOtpPublic = async (req, res) => {
  try {
    const {
      email
    } = req.body;
    const bcryptLib = require("bcryptjs");
    // @rls-public-plane — pre-signup public endpoint, no org context exists yet
    const VerificationTokenDef = require("@shared/models/VerificationToken.model");
    const VerificationToken = getPlatformModel(VerificationTokenDef);
    const {
      dispatch: sendComm
    } = require("@infra/communication/communication.dispatcher");
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }
    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 3 per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // @rls-public-plane — pre-auth public endpoint, no JWT context available
    const recentCount = await VerificationToken.countDocuments({
      purpose: "EMAIL_VERIFY",
      identifier: normalizedEmail,
      createdAt: {
        $gte: oneHourAgo
      }
    });
    if (recentCount >= 3) {
      return res.status(429).json({
        success: false,
        message: "Too many verification requests. Please try again later."
      });
    }

    // Invalidate previous
    await VerificationToken.updateMany({
      purpose: "EMAIL_VERIFY",
      identifier: normalizedEmail,
      isUsed: false
    }, {
      $set: {
        isUsed: true
      }
    });
    const emailOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcryptLib.hash(emailOtp, 10);
    await VerificationToken.create({
      purpose: "EMAIL_VERIFY",
      identifier: normalizedEmail,
      tokenHash: otpHash,
      channel: "email",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
      maxAttempts: 5,
      isUsed: false,
      metadata: {
        name: normalizedEmail.split("@")[0]
      }
    });
    await sendComm({
      channel: "email",
      type: "EMAIL_OTP",
      payload: {
        email: normalizedEmail,
        otp: emailOtp,
        name: normalizedEmail.split("@")[0],
        subject: "Verify Your Email — DentalSaaS"
      }
    });
    logger.info({
      email: normalizedEmail.slice(0, 4) + "****"
    }, "[OTP] Email OTP resent (pre-signup)");
    return res.json({
      success: true,
      message: "Verification code sent."
    });
  } catch (error) {
    logger.error({
      err: error.message
    }, "[OTP] resendEmailOtpPublic error");
    return res.status(500).json({
      success: false,
      message: "Failed to send code."
    });
  }
};