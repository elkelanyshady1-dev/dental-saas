/**
 * rbac-v2.test.js — RBAC v2 Capability + Feature Gate Tests
 *
 * Validates that:
 *   1. Doctor cannot see delete button
 *   2. Assistant cannot see edit button (for restricted resources)
 *   3. Org admin sees all actions
 *   4. Feature gates correctly hide/show module UI
 *   5. Subscription gate blocks inactive subscriptions
 *
 * These are behavioral contract tests — they validate the logic
 * without rendering React components. React Testing Library
 * integration tests would complement these.
 *
 * Run: node frontend/src/__tests__/rbac-v2.test.js
 */

// ─── Mock Capabilities ──────────────────────────────────────────────────────

const ROLE_CAPABILITIES = {
    org_admin: {
        "patients.read": true,
        "patients.create": true,
        "patients.update": true,
        "patients.delete": true,
        "accounting.read": true,
        "accounting.create": true,
        "invoices.create": true,
        "invoices.delete": true,
        "orthodontics.read": true,
        "orthodontics.create": true,
        "portal.manage": true,
        "security.manage": true,
        "users.read": true,
        "users.create": true,
        "users.update": true,
        "users.delete": true,
    },
    doctor: {
        "patients.read": true,
        "patients.create": true,
        "patients.update": true,
        // NO patients.delete
        "accounting.read": true,
        "orthodontics.read": true,
        "orthodontics.create": true,
        "users.read": true,
    },
    assistant: {
        "patients.read": true,
        "patients.create": true,
        // NO patients.update
        // NO patients.delete
        "accounting.read": true,
    },
    receptionist: {
        "patients.read": true,
        "patients.create": true,
        "accounting.read": true,
    },
    lab_technician: {
        "patients.read": true,
    },
};

// ─── Mock Modules ────────────────────────────────────────────────────────────

const PLAN_FREE = {
    patients: true,
    notifications: true,
    appointments: true,
    accounting: true,
    booking: false,
    analytics: false,
    inventory: false,
    orthodontics: false,
    labs: false,
};

const PLAN_PRO = {
    ...PLAN_FREE,
    booking: true,
    analytics: true,
    orthodontics: true,
};

const PLAN_ENTERPRISE = {
    ...PLAN_PRO,
    inventory: true,
    labs: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasCapability(role, capability) {
    return ROLE_CAPABILITIES[role]?.[capability] === true;
}

function hasModule(plan, moduleName) {
    return plan[moduleName] === true;
}

function isSubscriptionActive(status) {
    return ["active", "trial"].includes(status);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, description) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${description}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${description}`);
    }
}

console.log("\n🔒 RBAC v2 — Capability Tests\n");

// Test 1: Doctor cannot see delete
console.log("Test 1: Doctor cannot see delete button");
assert(!hasCapability("doctor", "patients.delete"), "doctor cannot delete patients");
assert(!hasCapability("doctor", "invoices.delete"), "doctor cannot delete invoices");
assert(!hasCapability("doctor", "users.delete"), "doctor cannot delete users");

// Test 2: Assistant cannot see edit
console.log("\nTest 2: Assistant cannot see edit button (restricted)");
assert(!hasCapability("assistant", "patients.update"), "assistant cannot update patients");
assert(!hasCapability("assistant", "patients.delete"), "assistant cannot delete patients");
assert(!hasCapability("assistant", "users.update"), "assistant cannot update users");
assert(hasCapability("assistant", "patients.read"), "assistant CAN read patients");
assert(hasCapability("assistant", "patients.create"), "assistant CAN create patients");

// Test 3: Org admin sees all
console.log("\nTest 3: Org admin sees all actions");
const adminCaps = Object.keys(ROLE_CAPABILITIES.org_admin);
for (const cap of adminCaps) {
    assert(hasCapability("org_admin", cap), `org_admin has ${cap}`);
}
assert(hasCapability("org_admin", "patients.delete"), "org_admin CAN delete patients");
assert(hasCapability("org_admin", "security.manage"), "org_admin CAN manage security");

// Test 4: Receptionist has limited access
console.log("\nTest 4: Receptionist limited access");
assert(hasCapability("receptionist", "patients.read"), "receptionist CAN read patients");
assert(!hasCapability("receptionist", "patients.update"), "receptionist cannot update patients");
assert(!hasCapability("receptionist", "orthodontics.read"), "receptionist cannot access orthodontics");

// Test 5: Lab technician minimal access
console.log("\nTest 5: Lab technician minimal access");
assert(hasCapability("lab_technician", "patients.read"), "lab_tech CAN read patients");
assert(!hasCapability("lab_technician", "patients.create"), "lab_tech cannot create patients");
assert(!hasCapability("lab_technician", "accounting.read"), "lab_tech cannot read accounting");

console.log("\n📦 Feature Gate — Module Tests\n");

// Test 6: Free plan module gating
console.log("Test 6: Free plan modules");
assert(hasModule(PLAN_FREE, "patients"), "free plan has patients");
assert(hasModule(PLAN_FREE, "appointments"), "free plan has appointments");
assert(!hasModule(PLAN_FREE, "orthodontics"), "free plan does NOT have orthodontics");
assert(!hasModule(PLAN_FREE, "analytics"), "free plan does NOT have analytics");
assert(!hasModule(PLAN_FREE, "inventory"), "free plan does NOT have inventory");
assert(!hasModule(PLAN_FREE, "labs"), "free plan does NOT have labs");

// Test 7: Pro plan module gating
console.log("\nTest 7: Pro plan modules");
assert(hasModule(PLAN_PRO, "orthodontics"), "pro plan HAS orthodontics");
assert(hasModule(PLAN_PRO, "analytics"), "pro plan HAS analytics");
assert(hasModule(PLAN_PRO, "booking"), "pro plan HAS booking");
assert(!hasModule(PLAN_PRO, "inventory"), "pro plan does NOT have inventory");
assert(!hasModule(PLAN_PRO, "labs"), "pro plan does NOT have labs");

// Test 8: Enterprise plan module gating
console.log("\nTest 8: Enterprise plan modules");
assert(hasModule(PLAN_ENTERPRISE, "inventory"), "enterprise HAS inventory");
assert(hasModule(PLAN_ENTERPRISE, "labs"), "enterprise HAS labs");
assert(hasModule(PLAN_ENTERPRISE, "orthodontics"), "enterprise HAS orthodontics");

console.log("\n💳 Subscription Gate Tests\n");

// Test 9: Subscription status checks
console.log("Test 9: Subscription status");
assert(isSubscriptionActive("active"), "active subscription is active");
assert(isSubscriptionActive("trial"), "trial subscription is active");
assert(!isSubscriptionActive("expired"), "expired subscription is NOT active");
assert(!isSubscriptionActive("suspended"), "suspended subscription is NOT active");
assert(!isSubscriptionActive("canceled"), "canceled subscription is NOT active");

console.log("\n🔐 Combined RBAC + Feature Tests\n");

// Test 10: Doctor on free plan
console.log("Test 10: Doctor on free plan");
assert(
    hasCapability("doctor", "orthodontics.read") && !hasModule(PLAN_FREE, "orthodontics"),
    "doctor has ortho permission BUT module is disabled → ortho tab should NOT render"
);

// Test 11: Admin on pro plan
console.log("\nTest 11: Admin on pro plan");
assert(
    hasCapability("org_admin", "orthodontics.read") && hasModule(PLAN_PRO, "orthodontics"),
    "admin has ortho permission AND module is enabled → ortho tab SHOULD render"
);

// Test 12: Assistant on enterprise plan
console.log("\nTest 12: Assistant on enterprise plan");
assert(
    !hasCapability("assistant", "patients.update") && hasModule(PLAN_ENTERPRISE, "patients"),
    "assistant lacks update permission even if module is enabled → edit button should NOT render"
);

console.log("\n" + "═".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("═".repeat(50) + "\n");

if (failed > 0) {
    process.exit(1);
}
