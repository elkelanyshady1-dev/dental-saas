/**
 * Quick Phase F.6 verification — tests ONLY systemContext.js
 * No queryScoper, no secureModel, no Mongoose
 */
"use strict";
process.env.INTERNAL_SYSTEM_SECRET = "test-hmac-secret-for-ci-pipeline-2024";

const path = require("path");
const ctxPath = path.resolve(__dirname, "../src/core/rls/systemContext.js");

// Intercept logger require
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
    if (request.endsWith("utils/logger") || request === "../../utils/logger") {
        // Return a mock logger path - inline mock
        return require.resolve("./mock-logger-inline.js");
    }
    if (request.includes("RLSViolation.model")) {
        return require.resolve("./mock-rls-violation-inline.js");
    }
    return origResolve.call(this, request, parent, isMain, options);
};

// Create inline mock files
const fs = require("fs");
const mockLoggerPath = path.resolve(__dirname, "mock-logger-inline.js");
const mockViolationPath = path.resolve(__dirname, "mock-rls-violation-inline.js");

fs.writeFileSync(mockLoggerPath, `module.exports = {
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {}
};`);
fs.writeFileSync(mockViolationPath, `module.exports = {
    recordViolation: () => Promise.resolve()
};`);

try {
    const {
        createSystemContext,
        verifySystemContext,
        isSystemContext,
        SYSTEM_CONTEXT_MARKER,
    } = require(ctxPath);

    let p = 0, f = 0;
    const ok = (c, n) => { if (c) { p++; console.log(`  \u2713 ${n}`); } else { f++; console.error(`  \u2717 FAIL: ${n}`); } };
    const thr = (fn, n) => { try { fn(); f++; console.error(`  \u2717 FAIL (no throw): ${n}`); } catch(_) { p++; console.log(`  \u2713 ${n}`); } };

    console.log("\n--- 1. Input Validation ---");
    thr(() => createSystemContext({ source: "test" }), "throws if orgId missing");
    thr(() => createSystemContext({ organizationId: "o1" }), "throws if source missing");
    thr(() => createSystemContext({ organizationId: "", source: "t" }), "throws if orgId empty");
    thr(() => createSystemContext({ organizationId: null, source: "t" }), "throws if orgId null");

    console.log("\n--- 2. Valid Creation ---");
    const ctx = createSystemContext({ organizationId: "org_001", source: "test.job" });
    ok(ctx.organizationId === "org_001", "orgId set");
    ok(ctx.source === "test.job", "source set");
    ok(/^[a-f0-9]{64}$/.test(ctx.signature), "sig is 64-char hex");
    ok(typeof ctx.issuedAt === "number", "issuedAt is number");
    ok(ctx[SYSTEM_CONTEXT_MARKER] === true, "has marker");
    ok(ctx.rls != null, "has .rls");
    ok(ctx.rls.organizationId === "org_001", ".rls.orgId");
    ok(Object.isFrozen(ctx), "ctx frozen");
    ok(Object.isFrozen(ctx.rls), "ctx.rls frozen");

    console.log("\n--- 3. Signature Verification ---");
    ok(verifySystemContext(ctx).valid === true, "valid ctx passes");
    ok(verifySystemContext(null).valid === false, "null rejected");
    ok(verifySystemContext({}).valid === false, "empty obj rejected");

    console.log("\n--- 4. ATTACK: Forged Signature ---");
    const forged = { ...ctx, rls: ctx.rls, signature: "a".repeat(64) };
    const fr = verifySystemContext(forged);
    ok(fr.valid === false, "forged sig rejected");
    ok(fr.error === "SIGNATURE_INVALID", "error = SIGNATURE_INVALID");

    console.log("\n--- 5. ATTACK: Tampered orgId ---");
    const tampered = { ...ctx, rls: ctx.rls, organizationId: "org_HACKED" };
    ok(verifySystemContext(tampered).valid === false, "tampered orgId rejected");

    console.log("\n--- 6. ATTACK: TTL Expiry ---");
    const expired = { ...ctx, rls: ctx.rls, issuedAt: Date.now() - 7200000 };
    ok(verifySystemContext(expired).error === "EXPIRED", "expired ctx rejected");

    console.log("\n--- 7. ATTACK: Future Timestamp ---");
    const future = { ...ctx, rls: ctx.rls, issuedAt: Date.now() + 3600000 };
    ok(verifySystemContext(future).error === "FUTURE_TIMESTAMP", "future timestamp rejected");

    console.log("\n--- 8. isSystemContext ---");
    ok(isSystemContext(ctx) === true, "identifies system ctx");
    ok(isSystemContext(null) === false, "rejects null");
    ok(isSystemContext({}) === false, "rejects plain obj");
    ok(isSystemContext({ [SYSTEM_CONTEXT_MARKER]: "true" }) === false, "rejects string marker");

    console.log("\n--- 9. Cross-Tenant Isolation ---");
    const ctxA = createSystemContext({ organizationId: "org_A", source: "t" });
    const ctxB = createSystemContext({ organizationId: "org_B", source: "t" });
    ok(ctxA.signature !== ctxB.signature, "different orgs different sigs");
    const swapped = { ...ctxA, rls: ctxA.rls, signature: ctxB.signature };
    ok(verifySystemContext(swapped).valid === false, "swapped sig detected");

    console.log("\n--- 10. Sig Length ---");
    const trunc = { ...ctx, rls: ctx.rls, signature: ctx.signature.substring(0, 32) };
    ok(verifySystemContext(trunc).error === "SIGNATURE_LENGTH_MISMATCH", "truncated rejected");
    const ext = { ...ctx, rls: ctx.rls, signature: ctx.signature + "deadbeef" };
    ok(verifySystemContext(ext).error === "SIGNATURE_LENGTH_MISMATCH", "extended rejected");

    console.log("\n--- 11. Deterministic Signing ---");
    const now = Date.now();
    const orig = Date.now;
    Date.now = () => now;
    const c1 = createSystemContext({ organizationId: "org_d", source: "d" });
    const c2 = createSystemContext({ organizationId: "org_d", source: "d" });
    Date.now = orig;
    ok(c1.signature === c2.signature, "same inputs same time = same sig");

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  RESULTS: ${p} passed, ${f} failed, ${p + f} total`);
    console.log(`${"=".repeat(60)}`);
    if (f > 0) process.exit(1);
    else { console.log("\n  ALL PHASE F.6 SECURITY INVARIANTS VERIFIED\n"); process.exit(0); }

} finally {
    // Cleanup inline mocks
    try { fs.unlinkSync(mockLoggerPath); } catch(_) {}
    try { fs.unlinkSync(mockViolationPath); } catch(_) {}
}
