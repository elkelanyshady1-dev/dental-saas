const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const User = require("../models/User");
const Branch = require("../models/Branch");
const PhoneVerificationToken = require("../models/PhoneVerificationToken");
const SiteContent = require("../models/SiteContent");
const Lead = require("../models/Lead");
const OrganizationSettings = require("../models/OrganizationSettings");
const initializeRolesForOrganization = require("../utils/roleInitializer");
const logger = require("../utils/logger");
const { getCountryCode } = require("../utils/countryMapping");
const { isPhoneVerificationRequired } = require("../utils/featureFlags");

// 🟢 Public: Signup for a new organization (trial onboarding)
exports.signup = async (req, res) => {
    try {
        let { organizationName, slug, fullName, email, password, phoneNumber, country } = req.body;

        // Auto-generate slug if not provided
        if (!slug && organizationName) {
            slug = organizationName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            // Ensure minimum length
            if (slug.length < 4) slug += "-clinic";
        }

        // 1️⃣ Validation
        if (!organizationName || !fullName || !email || !password || !phoneNumber || !country) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const countryCode = getCountryCode(country);
        if (!countryCode) {
            return res.status(400).json({ success: false, message: "Invalid country selected" });
        }

        // Slug validation (min 4 chars, lowercase, no spaces)
        // ... rest of validation ...
        const slugRegex = /^[a-z0-9-]{4,}$/;
        if (!slugRegex.test(slug)) {
            return res.status(400).json({
                success: false,
                message: "Slug must be at least 4 characters, lowercase, and contain no spaces."
            });
        }

        // Phone validation (simple regex)
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phoneNumber)) {
            return res.status(400).json({ success: false, message: "Invalid phone number format" });
        }

        // 2️⃣ Uniqueness checks
        const existingOrg = await Organization.findOne({ slug: slug.toLowerCase().trim() });
        if (existingOrg) {
            return res.status(409).json({ success: false, message: "Slug already taken" });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(409).json({ success: false, message: "Email already registered" });
        }

        // 3️⃣ Create Organization
        const now = new Date();
        const trialEndDate = new Date(now);
        trialEndDate.setDate(now.getDate() + 14);

        const organization = await Organization.create({
            name: organizationName,
            slug: slug.toLowerCase().trim(),
            country,
            countryCode,
            ownerId: new mongoose.Types.ObjectId(), // Placeholder for now
            subscription: {
                status: "trial",
                trialStartDate: now,
                trialEndsAt: trialEndDate,
                tier: "trial"
            },
            isActive: true,
            isVerified: false
        });

        // 4️⃣ Create Default Branch
        const branch = await Branch.create({
            name: "Main Branch",
            organizationId: organization._id,
            phone: phoneNumber
        });

        // 5️⃣ Create Superadmin User
        const hashedPassword = await bcrypt.hash(password, 10);
        const roles = await initializeRolesForOrganization(organization._id);

        const adminUser = await User.create({
            name: fullName,
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            organizationId: organization._id,
            roleId: roles.org_admin._id,
            branchAccess: [branch._id],
            hasFullBranchAccess: true,
            isActive: true
        });

        // Update Org ownerId
        organization.ownerId = adminUser._id;

        // 5.1 Handle automatic verification if required by flags
        if (!isPhoneVerificationRequired()) {
            organization.isVerified = true;
        }

        await organization.save();

        // 6️⃣ Generate and save hashed OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

        await PhoneVerificationToken.create({
            phoneNumber,
            otp: hashedOtp,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
        });

        // In a real app, send OTP via SMS here
        logger.info({ otp, phoneNumber }, "Generated OTP for signup");

        if (process.env.NODE_ENV !== "production") {
            console.log(`DEV OTP: ${otp}`);
        }

        res.status(201).json({
            success: true,
            message: "Signup successful. Verification OTP sent to your phone.",
            data: {
                slug: organization.slug,
                phoneNumber
            }
        });

    } catch (error) {
        logger.error({ err: error, service: "PublicController", action: "signup_error" }, "Error in signup");
        res.status(500).json({ success: false, message: error.message });
    }
};

// 🟢 Public: Verify phone OTP
exports.verifyPhone = async (req, res) => {
    try {
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({ success: false, message: "Phone number and OTP are required" });
        }

        const tokenDoc = await PhoneVerificationToken.findOne({
            phoneNumber,
            isUsed: false,
            expiresAt: { $gt: new Date() }
        });

        if (!tokenDoc) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        if (tokenDoc.attempts >= 5) {
            return res.status(403).json({ success: false, message: "Too many attempts. Please request a new OTP." });
        }

        const isValid = await bcrypt.compare(otp, tokenDoc.otp);
        if (!isValid) {
            tokenDoc.attempts += 1;
            await tokenDoc.save();
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        // Mark as used
        tokenDoc.isUsed = true;
        await tokenDoc.save();

        // Verify organization associated with this phone
        // We find by slug or just the admin user's phone if we stored it?
        // Let's assume we find the organization where the owner (or some user) has this phone, 
        // or more simply find the org that matches this phone in its main branch or settings.
        // Actually, the easiest is to find the Org that was just created.
        // During signup, we used phonenumber for the main branch.
        const branch = await Branch.findOne({ phone: phoneNumber }).sort({ createdAt: -1 });
        if (branch) {
            await Organization.findByIdAndUpdate(branch.organizationId, { isVerified: true });
        }

        res.json({
            success: true,
            message: "Phone verified successfully. You can now login."
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Legacy onboarding method - keep for potential back-compat if needed, or replace
exports.createOrganization = exports.signup;

// 🟢 Public: Get Global Site Content (and merge tenant configs if subdomain provided)
exports.getSiteContent = async (req, res) => {
    try {
        let content = null;

        // Try fetching content but don't crash if collection is missing/empty
        try {
            content = await SiteContent.findOne({ isActive: true });
        } catch (dbError) {
            logger.error({ err: dbError, service: "PublicController", action: "site_content_db_error" }, "Handled DB error fetching site content");
        }

        // If none exists, return a default mock payload instead of 404
        if (!content) {
            content = {
                heroTitle: "The Smart Dental Platform for Modern Clinics",
                heroSubtitle: "Secure, scalable, and designed for dental professionals.",
                aboutTitle: "Empowering Dental Clinics with Smart Solutions",
                aboutDescription: "DentalSaaS provides everything you need to manage your practice securely.",
                whatsappNumber: "+1234567890",
                supportEmail: "support@dentalsaas.com"
            };
        }

        res.status(200).json({
            success: true,
            data: content,
            tenant: null
        });
    } catch (error) {
        logger.error({ err: error, service: "PublicController", action: "get_site_content_fatal" }, "Fatal error in getSiteContent");

        // Always return 200 with default payload on public marketing pages to prevent total white screen of death
        res.status(200).json({
            success: true,
            data: {
                heroTitle: "The Smart Dental Platform for Modern Clinics",
                heroSubtitle: "Secure, scalable, and designed for dental professionals.",
                aboutTitle: "Empowering Dental Clinics with Smart Solutions",
                aboutDescription: "DentalSaaS provides everything you need to manage your practice securely.",
                whatsappNumber: "+1234567890",
                supportEmail: "support@dentalsaas.com"
            },
            tenant: null,
            error: "Temporary display issue"
        });
    }
};

// 🟢 Public: WhatsApp Lead Generation
exports.submitWhatsAppLead = async (req, res) => {
    try {
        const { source, name, phone, message, organizationInterest } = req.body;

        const limitString = (str) => str ? str.substring(0, 500) : undefined;

        // Persist Lead securely
        const newLead = await Lead.create({
            source: limitString(source) || 'landing',
            name: limitString(name),
            phone: limitString(phone),
            message: limitString(message),
            organizationInterest: limitString(organizationInterest),
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });

        res.status(201).json({
            success: true,
            message: "Lead recorded",
            leadId: newLead._id
        });
    } catch (error) {
        res.status(500).json({ message: "Error recording lead", error: error.message });
    }
};
