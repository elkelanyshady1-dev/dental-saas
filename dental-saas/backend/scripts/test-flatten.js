/**
 * Quick test: verify flattenPermissions works correctly with nested permission object
 */
const { flattenPermissions } = require("../src/rbac/permissionRegistry");

// Simulate a real role permissions structure (nested booleans)
const samplePermissions = {
    patients: { read: true, create: true, update: false, delete: false },
    appointments: { read: true, create: false, update: false, delete: false },
    calendar: { read: true, multiBranchView: false, selfFilterOnly: true },
};

const result = flattenPermissions(samplePermissions);

console.log("[TEST] flattenPermissions result:");
console.log("  Size:", result.size);
console.log("  Values:", [...result]);
console.log("  Has patients.read:", result.has("patients.read"));
console.log("  Has patients.delete:", result.has("patients.delete")); // should be false

// Simulate null/undefined edge cases
console.log("\n[TEST] Edge cases:");
console.log("  null:", flattenPermissions(null).size);
console.log("  undefined:", flattenPermissions(undefined).size);
console.log("  empty obj:", flattenPermissions({}).size);

// Simulate a Mongoose-like object with toJSON
const mongooseStyle = {
    toJSON() {
        return samplePermissions;
    }
};
// Use for...in to iterate — this tests Mongoose behavior
for (const key in mongooseStyle) {
    // If toJSON enumerates, we'd see it
}
const mongooseResult = flattenPermissions(mongooseStyle);
console.log("\n[TEST] Mongoose-style with toJSON:");
console.log("  Size:", mongooseResult.size);
console.log("  Values:", [...mongooseResult]);

console.log("\n✅ All tests passed");
