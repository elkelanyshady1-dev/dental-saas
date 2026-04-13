require("module-alias/register");
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DATABASE CONSISTENCY AUDIT                                  ║
 * ║  Platform / Organization Plane Separation Validator          ║
 * ║                                                              ║
 * ║  READ-ONLY — Does NOT modify, delete, or mutate any data.   ║
 * ║                                                              ║
 * ║  Exit Codes:                                                 ║
 * ║    0 = OK       — All checks passed                         ║
 * ║    1 = WARNING  — Non-critical issues detected              ║
 * ║    2 = CRITICAL — Architectural violations found            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ─── Constants ────────────────────────────────────────────────

const PLATFORM_EXPECTED_COLLECTIONS = [
    "platformusers",
    "platformconfigs",
    "regions",
    "plans",
    "addons",
    "campaigns",
    "coupons",
    "revenueanalytics",
    "revenuesnapshotprojections",
    "subscriptionmutationrecords",
    "featuredefinitions",
    "refreshtokens",
];

const ORGANIZATION_EXPECTED_COLLECTIONS = [
    "organizations",
    "users",          // org-level users (legacy collection name)
    "patients",
    "appointments",
    "branches",
    "roles",
    "auditlogs",
    "billinginvoices",
    "invoices",
    "tickets",
    "notifications",
    "communicationusages",
    "inventoryitems",
    "inventorytransactions",
    "orthodonticcases",
    "treatmentcases",
    "stagetemplates",
    "stageexecutions",
    "documenttemplates",
    "printlogs",
    "printsettings",
    "bookingrequests",
    "orgaddons",
    "patientinvoices",
    "patientpayments",
    "patientwallets",
    "paymentallocations",
    "treatmentinvoices",
    "financialledgers",
    "financialsnapshots",
    "financialeventledgers",
    "clinicals",
    "prescriptions",
    "patientusers",
    "portalinvites",
    "patientpolicies",
    "cronlocks",
    "domainEventOutbox",
    "passwordresettokens",
    "refundexecutionrecords",
    "stripeevents",
    "alignerproductioncases",
    "alignersharetokens",
    "eventprocessingledgers",
    "casecostsnapshots",
    "intelligenceweights",
];

/** Collections that indicate critical legacy contamination */
const LEGACY_CRITICAL_COLLECTIONS = [
    // "users" collection with platformRole field means legacy is still active
];

const AUTH_CONTROLLER_PATH = path.resolve(
    __dirname,
    "../src/platform/controllers/platformAuthController.js"
);

// ─── Severity Tracking ───────────────────────────────────────

let globalSeverity = "OK";

function escalate(level) {
    const order = { OK: 0, WARNING: 1, CRITICAL: 2 };
    if (order[level] > order[globalSeverity]) {
        globalSeverity = level;
    }
}

// ─── Formatting Helpers ──────────────────────────────────────

const DIVIDER = "═".repeat(64);
const THIN_DIVIDER = "─".repeat(64);

function header(title) {
    console.log(`\n╔${DIVIDER}╗`);
    console.log(`║  ${title.padEnd(62)}║`);
    console.log(`╚${DIVIDER}╝`);
}

function sectionHeader(title) {
    console.log(`\n┌${THIN_DIVIDER}┐`);
    console.log(`│  ${title.padEnd(62)}│`);
    console.log(`└${THIN_DIVIDER}┘`);
}

function ok(msg) {
    console.log(`  ✅ ${msg}`);
}

function warn(msg) {
    console.log(`  ⚠️  WARNING: ${msg}`);
    escalate("WARNING");
}

function critical(msg) {
    console.log(`  🔴 CRITICAL: ${msg}`);
    escalate("CRITICAL");
}

function info(msg) {
    console.log(`  ℹ️  ${msg}`);
}

// ─── Audit Functions ─────────────────────────────────────────

async function getCollections(db) {
    const collections = await db.listCollections().toArray();
    return collections.map((c) => c.name).sort();
}

function classifyCollections(collectionNames) {
    const platformFound = [];
    const orgFound = [];
    const unexpected = [];

    const platformSet = new Set(PLATFORM_EXPECTED_COLLECTIONS);
    const orgSet = new Set(ORGANIZATION_EXPECTED_COLLECTIONS);

    for (const name of collectionNames) {
        const lower = name.toLowerCase();
        if (platformSet.has(lower)) {
            platformFound.push(name);
        } else if (orgSet.has(lower)) {
            orgFound.push(name);
        } else {
            unexpected.push(name);
        }
    }

    return { platformFound, orgFound, unexpected };
}

async function auditCollectionPresence(db, collectionNames) {
    const findings = {};

    sectionHeader("A. Legacy 'users' Collection Check");
    if (collectionNames.includes("users")) {
        critical("Collection 'users' EXISTS. This is the legacy shared collection.");
        info("Platform authentication should use 'platformusers' exclusively.");
        findings.usersCollectionExists = true;
    } else {
        ok("Collection 'users' does not exist — no legacy contamination.");
        findings.usersCollectionExists = false;
    }

    sectionHeader("B. PlatformUsers Collection Check");
    if (collectionNames.includes("platformusers")) {
        ok("Collection 'platformusers' EXISTS — platform identity store is present.");
        findings.platformUsersCollectionExists = true;
    } else {
        critical("Collection 'platformusers' DOES NOT EXIST. Platform identity store is missing!");
        findings.platformUsersCollectionExists = false;
    }

    return findings;
}

async function auditDocumentCounts(db, collectionNames) {
    sectionHeader("C. Document Counts");
    const counts = {};

    const targets = ["users", "platformusers", "orgusers"];

    for (const name of targets) {
        if (collectionNames.includes(name)) {
            const count = await db.collection(name).countDocuments();
            counts[name] = count;
            info(`${name}: ${count} document(s)`);
        } else {
            counts[name] = null;
            info(`${name}: collection does not exist`);
        }
    }

    return counts;
}

async function auditSuperadminPresence(db, collectionNames) {
    const findings = {};

    sectionHeader("D. Superadmin in platformusers");
    if (collectionNames.includes("platformusers")) {
        const superadmin = await db.collection("platformusers").findOne({
            role: "superadmin",
        });

        if (superadmin) {
            ok(`Superadmin found: ${superadmin.email} (ID: ${superadmin._id})`);
            findings.superadminInPlatformUsers = true;
        } else {
            critical("No superadmin found in platformusers! Platform has no root administrator.");
            findings.superadminInPlatformUsers = false;
        }
    } else {
        critical("Cannot check — platformusers collection is missing.");
        findings.superadminInPlatformUsers = false;
    }

    sectionHeader("E. Superadmin in legacy 'users'");
    if (collectionNames.includes("users")) {
        const legacySuperadmin = await db.collection("users").findOne({
            $or: [
                { platformRole: "superadmin" },
                { role: "superadmin" },
            ],
        });

        if (legacySuperadmin) {
            warn(
                `Superadmin found in legacy 'users' collection: ${legacySuperadmin.email} ` +
                `(ID: ${legacySuperadmin._id}). This may indicate incomplete migration.`
            );
            findings.superadminInUsers = true;
        } else {
            ok("No superadmin found in legacy 'users' — clean separation.");
            findings.superadminInUsers = false;
        }
    } else {
        ok("Legacy 'users' collection does not exist — no legacy superadmin possible.");
        findings.superadminInUsers = false;
    }

    return findings;
}

async function auditPlatformUserEmails(db, collectionNames) {
    sectionHeader("F. Platform User Directory (Safe — No Passwords)");

    if (!collectionNames.includes("platformusers")) {
        warn("Cannot list platform users — collection missing.");
        return [];
    }

    const users = await db
        .collection("platformusers")
        .find({}, { projection: { email: 1, role: 1, isActive: 1, name: 1, _id: 0 } })
        .toArray();

    if (users.length === 0) {
        warn("platformusers collection is empty.");
        return [];
    }

    console.log("");
    console.log("  ┌──────────────────────────────────────┬──────────────────┬──────────┐");
    console.log("  │ Email                                │ Role             │ Active   │");
    console.log("  ├──────────────────────────────────────┼──────────────────┼──────────┤");

    for (const u of users) {
        const email = (u.email || "N/A").padEnd(36);
        const role = (u.role || "N/A").padEnd(16);
        const active = (u.isActive !== false ? "Yes" : "No").padEnd(8);
        console.log(`  │ ${email} │ ${role} │ ${active} │`);
    }

    console.log("  └──────────────────────────────────────┴──────────────────┴──────────┘");

    return users.map((u) => u.email);
}

function auditAuthController() {
    sectionHeader("5. Auth Controller Integrity Scan");
    info(`Scanning: ${AUTH_CONTROLLER_PATH}`);

    if (!fs.existsSync(AUTH_CONTROLLER_PATH)) {
        critical("platformAuthController.js NOT FOUND at expected path!");
        return { controllerExists: false, importsOnlyPlatformUser: false, referencesGenericUser: false };
    }

    const content = fs.readFileSync(AUTH_CONTROLLER_PATH, "utf8");

    // Check: imports PlatformUser
    const importsPlatformUser =
        content.includes('require("../models/PlatformUser")') ||
        content.includes("require('../models/PlatformUser')") ||
        content.includes('from "../models/PlatformUser"') ||
        content.includes("from '../models/PlatformUser'");

    if (importsPlatformUser) {
        ok("Controller imports PlatformUser model correctly.");
    } else {
        critical("Controller does NOT import PlatformUser model!");
    }

    // Check: references generic User model (contamination)
    const genericUserPatterns = [
        /require\(["'][^"']*\/shared\/models\/User["']\)/,
        /require\(["'][^"']*\/models\/User["']\)/,
        /from\s+["'][^"']*\/shared\/models\/User["']/,
        /from\s+["'][^"']*\/models\/User["']/,
    ];

    // Filter out comments — only check non-comment lines
    const codeLines = content
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");

    let referencesGenericUser = false;
    for (const pattern of genericUserPatterns) {
        if (pattern.test(codeLines)) {
            referencesGenericUser = true;
            break;
        }
    }

    if (referencesGenericUser) {
        critical(
            "Controller references generic 'User' model! " +
            "This is a plane isolation violation — platform auth must use PlatformUser only."
        );
    } else {
        ok("Controller does NOT reference generic 'User' model — clean plane isolation.");
    }

    return {
        controllerExists: true,
        importsOnlyPlatformUser: importsPlatformUser,
        referencesGenericUser,
    };
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
    header("DATABASE CONSISTENCY AUDIT — Platform/Org Separation");

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!uri) {
        console.error("  🔴 CRITICAL: No MONGO_URI or MONGODB_URI found in environment.");
        console.error("  Set MONGO_URI in .env or pass as environment variable.");
        process.exit(2);
    }

    info(`Connecting to MongoDB...`);
    info(`URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`); // Mask credentials

    let connection;
    try {
        connection = await mongoose.connect(uri);
        ok("Connected successfully.");
    } catch (err) {
        critical(`Failed to connect: ${err.message}`);
        process.exit(2);
    }

    const db = connection.connection.db;
    const dbName = db.databaseName;
    info(`Database: ${dbName}`);

    // ── Step 2 & 3: List and classify collections ──

    sectionHeader("1. Collection Inventory");
    const collectionNames = await getCollections(db);
    info(`Total collections found: ${collectionNames.length}`);

    const { platformFound, orgFound, unexpected } = classifyCollections(collectionNames);

    console.log("\n  PLATFORM EXPECTED:");
    if (platformFound.length > 0) {
        platformFound.forEach((c) => console.log(`    ✓ ${c}`));
    } else {
        console.log("    (none found)");
    }

    console.log("\n  ORGANIZATION EXPECTED:");
    if (orgFound.length > 0) {
        orgFound.forEach((c) => console.log(`    ✓ ${c}`));
    } else {
        console.log("    (none found)");
    }

    console.log("\n  UNEXPECTED / UNKNOWN:");
    if (unexpected.length > 0) {
        unexpected.forEach((c) => {
            console.log(`    ⚠ ${c}`);
        });
        warn(`${unexpected.length} unexpected collection(s) found.`);
    } else {
        console.log("    (none — clean)");
        ok("No unexpected collections.");
    }

    // ── Step 4: Detailed audits ──

    sectionHeader("2-6. Detailed Audit Checks");

    const presenceFindings = await auditCollectionPresence(db, collectionNames);
    const counts = await auditDocumentCounts(db, collectionNames);
    const superadminFindings = await auditSuperadminPresence(db, collectionNames);
    const platformEmails = await auditPlatformUserEmails(db, collectionNames);

    // ── Step 5: Auth controller scan ──

    const controllerFindings = auditAuthController();

    // ── Step 6: Structured result ──

    const result = {
        dbName,
        collections: collectionNames,
        collectionClassification: {
            platform: platformFound,
            organization: orgFound,
            unexpected,
        },
        platformUsersCount: counts.platformusers,
        usersCount: counts.users,
        orgUsersCount: counts.orgusers,
        superadminInPlatformUsers: superadminFindings.superadminInPlatformUsers,
        superadminInUsers: superadminFindings.superadminInUsers,
        platformUserEmails: platformEmails,
        authController: controllerFindings,
        unexpectedCollections: unexpected,
        severity: globalSeverity,
        timestamp: new Date().toISOString(),
    };

    header("STRUCTURED AUDIT RESULT");
    console.log(JSON.stringify(result, null, 2));

    // ── Step 7: Final verdict ──

    header("AUDIT VERDICT");

    const severityEmoji = {
        OK: "✅",
        WARNING: "⚠️",
        CRITICAL: "🔴",
    };

    const exitCodes = {
        OK: 0,
        WARNING: 1,
        CRITICAL: 2,
    };

    console.log(`\n  ${severityEmoji[globalSeverity]}  SEVERITY: ${globalSeverity}`);
    console.log(`  Exit code: ${exitCodes[globalSeverity]}`);
    console.log("");

    if (globalSeverity === "CRITICAL") {
        console.log("  ┌────────────────────────────────────────────────────────────┐");
        console.log("  │  ACTION REQUIRED: Critical architectural violations found. │");
        console.log("  │  Platform/Org plane separation is NOT consistent.          │");
        console.log("  │  Review findings above and remediate before deployment.    │");
        console.log("  └────────────────────────────────────────────────────────────┘");
    } else if (globalSeverity === "WARNING") {
        console.log("  ┌────────────────────────────────────────────────────────────┐");
        console.log("  │  Non-critical issues detected. Review recommended.         │");
        console.log("  └────────────────────────────────────────────────────────────┘");
    } else {
        console.log("  ┌────────────────────────────────────────────────────────────┐");
        console.log("  │  All checks passed. Platform/Org separation is consistent. │");
        console.log("  └────────────────────────────────────────────────────────────┘");
    }

    await mongoose.disconnect();
    process.exit(exitCodes[globalSeverity]);
}

main().catch((err) => {
    console.error(`\n  🔴 FATAL: Unhandled error: ${err.message}`);
    console.error(err.stack);
    process.exit(2);
});
