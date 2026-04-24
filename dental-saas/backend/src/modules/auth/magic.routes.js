"use strict";

const express = require("express");
const router  = express.Router();
const { requestMagicLink, consumeMagicLink } = require("./magic.controller");

/**
 * @swagger
 * /api/auth/magic-link:
 *   post:
 *     summary: Request a passwordless magic login link via email
 *     tags: [Authentication]
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
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: >
 *           Always returns 200 when the request is well-formed, regardless of
 *           whether the email maps to an account — prevents enumeration.
 *       400:
 *         description: Invalid email format
 *       429:
 *         description: Rate-limited (1 link per 60 seconds per email)
 */
router.post("/magic-link", requestMagicLink);

/**
 * @swagger
 * /api/auth/magic-login:
 *   get:
 *     summary: Consume a magic-link token and issue an org session
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *         description: Raw token from the emailed link
 *     responses:
 *       200:
 *         description: >
 *           Returns SINGLE_ORG with accessToken + refreshToken, or MULTI_ORG
 *           with an org selector list.
 *       400:
 *         description: Missing token
 *       401:
 *         description: Invalid, expired, or already-used token
 *       404:
 *         description: No account found for the verified email
 *       423:
 *         description: Account locked
 */
router.get("/magic-login", consumeMagicLink);

module.exports = router;
