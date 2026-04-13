const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended
const AUTH_TAG_LENGTH = 16;
const KEY = process.env.TOTP_ENCRYPTION_KEY;

/**
 * Encrypts plain text using AES-256-GCM.
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Base64 encoded payload: iv.content.authTag
 */
const encrypt = (text) => {
    if (!KEY) throw new Error("TOTP_ENCRYPTION_KEY not set");

    // Ensure key is 32 bytes
    const secretKey = crypto.createHash("sha256").update(String(KEY)).digest();

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, secretKey, iv);

    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag().toString("base64");

    // Format: iv.content.authTag (base64)
    return `${iv.toString("base64")}.${encrypted}.${authTag}`;
};

/**
 * Decrypts AES-256-GCM encrypted payload.
 * @param {string} encryptedPayload - Format: iv.content.authTag
 * @returns {string} - Decrypted plain text
 */
const decrypt = (encryptedPayload) => {
    if (!KEY) throw new Error("TOTP_ENCRYPTION_KEY not set");
    if (!encryptedPayload) return "";

    const secretKey = crypto.createHash("sha256").update(String(KEY)).digest();

    const [ivBase64, contentBase64, authTagBase64] = encryptedPayload.split(".");

    if (!ivBase64 || !contentBase64 || !authTagBase64) {
        throw new Error("Invalid encrypted payload format");
    }

    const iv = Buffer.from(ivBase64, "base64");
    const content = Buffer.from(contentBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, secretKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(content, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
};

module.exports = { encrypt, decrypt };
