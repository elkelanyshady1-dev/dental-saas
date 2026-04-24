"use strict";

const express = require("express");
const router  = express.Router();
const { sendOtp, verifyOtp } = require("./otp.controller");

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send a 6-digit OTP to the given phone via SMSMisr
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "201XXXXXXXXX"
 *                 description: >
 *                   Accepts 010XXXXXXXX, 10XXXXXXXX, +2010XXXXXXXX, or 2010XXXXXXXX.
 *                   Always normalized to 2010XXXXXXXX internally.
 *     responses:
 *       200:
 *         description: OTP sent
 *       400:
 *         description: Invalid phone format
 *       429:
 *         description: Rate limited — 1 OTP per 60 seconds per phone
 *       502:
 *         description: SMS gateway error
 */
router.post("/send-otp", sendOtp);

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify a 6-digit OTP for the given phone
 *     tags: [Authentication]
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
 *                 example: "201XXXXXXXXX"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Phone verified successfully
 *       400:
 *         description: Invalid or expired OTP
 *       429:
 *         description: Max attempts exceeded
 */
router.post("/verify-otp", verifyOtp);

module.exports = router;
