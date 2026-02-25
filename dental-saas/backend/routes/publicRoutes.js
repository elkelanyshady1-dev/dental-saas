const express = require("express");
const router = express.Router();

const {
    signup,
    verifyPhone,
    getSiteContent,
    submitWhatsAppLead
} = require("../controllers/publicController");

// Native In-Memory Rate Limiter avoiding external dependencies for robust demo execution
const memoryRateLimit = (windowMs, max) => {
    const hits = new Map();
    return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        const record = hits.get(ip) || { count: 0, resetTime: now + windowMs };

        if (now > record.resetTime) {
            record.count = 1;
            record.resetTime = now + windowMs;
        } else {
            record.count++;
        }

        hits.set(ip, record);

        if (record.count > max) {
            return res.status(429).json({ message: "Too many requests, please try again later." });
        }
        next();
    };
};

const defaultLimiter = memoryRateLimit(15 * 60 * 1000, 100);
const signupLimiter = memoryRateLimit(60 * 60 * 1000, 5);
const leadLimiter = memoryRateLimit(60 * 60 * 1000, 10);

router.use(defaultLimiter);

router.post("/signup", signupLimiter, signup);
router.post("/verify-phone", verifyPhone);
router.get("/site-content", getSiteContent);
router.post("/whatsapp-lead", leadLimiter, submitWhatsAppLead);

module.exports = router;
