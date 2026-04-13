/**
 * portalAuth.controller.js
 * Phase 2 — secureModel Migration: Auth Controller
 *
 * All controller methods pass `req` to the auth service for secureModel
 * tenant isolation enforcement. organizationId is derived from req.rls.
 *
 * @per-org-public-access — auth controller passes req for tenant isolation enforcement
 */

"use strict";

const authService = require("../services/portalAuth.service");

async function loginWithPassword(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "email and password are required." } });
        const result = await authService.loginWithPassword({ req, email, password });
        return res.json({ success: true, data: { token: result.token } });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "AUTH_ERROR", message: err.message } });
    }
}

async function requestMagicLink(req, res) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "email is required." } });
        await authService.requestMagicLink({ req, email });
        return res.json({ success: true, message: "If this email is registered, a magic link has been sent." });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "MAGIC_LINK_ERROR", message: err.message } });
    }
}

async function generateMagicLink(req, res) {
    try {
        const { patientId } = req.body;
        if (!patientId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "patientId is required." } });
        const result = await authService.generateMagicLink({ req, patientId });
        return res.json({ success: true, data: { magicLink: result.magicLink } });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "MAGIC_LINK_ERROR", message: err.message } });
    }
}

async function verifyMagicLink(req, res) {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "token is required." } });
        const result = await authService.verifyMagicLink({ req, token });
        return res.json({ success: true, data: { token: result.token } });
    } catch (err) {
        return res.status(err.statusCode || 401).json({ success: false, error: { code: "MAGIC_LINK_INVALID", message: err.message } });
    }
}

async function requestOtp(req, res) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "email is required." } });
        await authService.requestOtp({ req, email });
        return res.json({ success: true, message: "If this email is registered, an OTP has been sent." });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: { code: "OTP_ERROR", message: err.message } });
    }
}

async function verifyOtp(req, res) {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "email and otp are required." } });
        const result = await authService.verifyOtp({ req, email, otp });
        return res.json({ success: true, data: { token: result.token } });
    } catch (err) {
        return res.status(err.statusCode || 401).json({ success: false, error: { code: "OTP_INVALID", message: err.message } });
    }
}

async function logout(req, res) {
    try {
        await authService.logout({
            patientId: req.patientId
        });
        return res.json({ success: true, message: "Logged out." });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "LOGOUT_ERROR", message: err.message } });
    }
}

module.exports = { loginWithPassword, requestMagicLink, generateMagicLink, verifyMagicLink, requestOtp, verifyOtp, logout };
