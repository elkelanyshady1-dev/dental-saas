/**
 * smsmisr.provider.js — DEPRECATED STUB
 *
 * This module was moved to:
 *   src/infrastructure/communication/providers/sms/smsmisr.provider.js
 *
 * and now conforms to the generic IMessageProvider contract `send({ to, body, type })`.
 * OTP-specific logic has been removed from the provider; OTP dispatch now
 * flows through the Communication dispatcher:
 *   otp.service.js → sendCommunication() → dispatch() → smsProvider → smsmisr.send()
 *
 * Anything still importing `sendOtpViaSmsmisr` from this path is a bug.
 * Migrate to:
 *   const { send } = require("@infra/communication/providers/sms/smsmisr.provider");
 * or (preferred) use the Communication facade:
 *   const { sendCommunication } = require("@services/communicationService");
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

function sendOtpViaSmsmisr() {
    throw new Error(
        "[SMSMisr] sendOtpViaSmsmisr is DEPRECATED. " +
        "Use sendCommunication({ channel: 'sms', type: 'OTP', payload: { to, body } }) " +
        "from @services/communicationService instead."
    );
}

module.exports = { sendOtpViaSmsmisr };
