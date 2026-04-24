"use strict";

const express = require("express");
const router = express.Router();
const { initiateGoogleAuth, handleGoogleCallback } = require("./google.strategy");

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth 2.0 login
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: redirect
 *         schema: { type: string }
 *         description: Post-login redirect path (default /org/dashboard)
 *     responses:
 *       302:
 *         description: Redirects to Google consent screen
 */
router.get("/google", initiateGoogleAuth);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback — handles token exchange and session issuance
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to frontend with token or error
 */
router.get("/google/callback", handleGoogleCallback);

module.exports = router;
