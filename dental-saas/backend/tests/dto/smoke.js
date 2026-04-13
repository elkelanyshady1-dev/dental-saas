// Quick smoke test for patient.dto.js
"use strict";
const dto = require("../../src/dto/patient.dto");

let pass = 0, fail = 0;
function assert(name, val) {
    if (val) { pass++; console.log("  ✓ " + name); }
    else { fail++; console.log("  ✗ FAIL: " + name); }
}

console.log("\n=== resolveDisplayName ===");
assert("nameEnglish priority", dto.resolveDisplayName({nameEnglish: "John"}) === "John");
assert("nameArabic fallback", dto.resolveDisplayName({nameArabic: "أحمد"}) === "أحمد");
assert("empty returns dash", dto.resolveDisplayName({}) === "—");
assert("trims whitespace", dto.resolveDisplayName({nameEnglish: "  J  "}) === "J");

console.log("\n=== buildPatientListDTO ===");
const list = dto.buildPatientListDTO({nameEnglish: "John", _id: "1"});
assert("has displayName", list.displayName === "John");
assert("is frozen", Object.isFrozen(list));
assert("empty patient works", dto.buildPatientListDTO({}).displayName === "—");

console.log("\n=== buildPatientSearchDTO ===");
const search = dto.buildPatientSearchDTO({nameArabic: "Ahmed"}, "name");
assert("has displayName", search.displayName === "Ahmed");
assert("is frozen", Object.isFrozen(search));
assert("has matchType", search._matchType === "name");

console.log("\n=== buildPatientCoreDTO ===");
const core = dto.buildPatientCoreDTO({nameEnglish: "Sarah"});
assert("has displayName", core.displayName === "Sarah");
assert("is frozen", Object.isFrozen(core));
assert("insurance frozen", Object.isFrozen(core.insurance));
assert("emergencyContact frozen", Object.isFrozen(core.emergencyContact));

console.log("\n=== buildPatientSummaryDTO ===");
const summary = dto.buildPatientSummaryDTO({nameEnglish: "Test", _id: "x"});
assert("has displayName", summary.displayName === "Test");
assert("is frozen", Object.isFrozen(summary));

console.log("\n=== Mutation Safety ===");
try { list.displayName = "hacked"; assert("mutation blocked", false); }
catch(e) { assert("mutation blocked", true); }

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
