/**
 * supervisorAuth.controller.js — Supervisor Authentication Controller
 *
 * Endpoints:
 *   POST /supervisor/auth/register — Create supervisor account
 *   POST /supervisor/auth/login    — Authenticate and get token
 *   GET  /supervisor/auth/me       — Get current supervisor profile
 *   PATCH /supervisor/auth/me      — Update profile
 *
 * PLANE: Supervisor only.
 */

"use strict";

const supervisorAuthService = require("../services/supervisorAuth.service");
const logger = require("@utils/logger");

/**
 * POST /supervisor/auth/register
 */
async function register(req, res) {
    try {
        const { email, password, name, title, institution } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: "email, password, and name are required.",
            });
        }

        const result = await supervisorAuthService.register({
            email,
            password,
            name,
            title,
            institution,
        });

        res.status(201).json({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error({
            event: "SUPERVISOR_REGISTER_ERROR",
            error: error.message,
        });

        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * POST /supervisor/auth/login
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "email and password are required.",
            });
        }

        const result = await supervisorAuthService.login({ email, password });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error({
            event: "SUPERVISOR_LOGIN_ERROR",
            error: error.message,
            email: req.body?.email,
        });

        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * GET /supervisor/auth/me
 * Requires: supervisorProtect
 */
async function getProfile(req, res) {
    try {
        const supervisor = await supervisorAuthService.getProfile(
            req.supervisor.supervisorId
        );

        res.json({
            success: true,
            data: supervisor,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

/**
 * PATCH /supervisor/auth/me
 * Requires: supervisorProtect
 */
async function updateProfile(req, res) {
    try {
        const supervisor = await supervisorAuthService.updateProfile(
            req.supervisor.supervisorId,
            req.body
        );

        res.json({
            success: true,
            data: supervisor,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            error: error.message,
        });
    }
}

module.exports = {
    register,
    login,
    getProfile,
    updateProfile,
};
