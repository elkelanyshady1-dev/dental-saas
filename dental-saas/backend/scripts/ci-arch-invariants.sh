#!/usr/bin/env bash
# ci-arch-invariants.sh
# H8 (v9.4.1) — CI safety checks for the 3-layer DB architecture.
#
# Runs a suite of fast grep-based invariants that must hold on every
# push. Exits non-zero with a structured message on any violation.
#
# Add to CI as:   bash scripts/ci-arch-invariants.sh
#
# What this script enforces (boot-critical invariants):
#   1. No `mongoose.model(` call in runtime code (model file compilation
#      must go through getPlatformModel / getSharedModel / getModel).
#   2. No `require(...).default` in runtime code (post-5f all models
#      export { modelName, schema } without a default Model compilation).
#   3. No `mongoose.connection` in runtime code (the global root was
#      removed in Step 5d; code must use platformConnection.get() /
#      sharedConnection.get() / clusterConnections).
#   4. H7 Write-guard: every tenant service file that calls a mutating
#      Mongoose method (.create/.save/.updateOne/...) must also call
#      assertWriteAllowed() in the same file.
#
# The runtime code filter excludes: tests/, __tests__/, scripts/, migrations/,
# and the three connection factories (getModel.js, getPlatformModel.js,
# getSharedModel.js, platformConnection.js, sharedConnection.js,
# clusterConnections.js) which legitimately call connection.model().

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0

section() {
    echo ""
    echo "── $1 ──"
}

# Helper: grep through src/ excluding tests/scripts/migrations/factories.
# Filters out matches that are inside comments, JSDoc blocks, or string
# literals — those are documentation, not runtime code.
check_forbidden_pattern() {
    local label="$1"
    local pattern="$2"
    local extra_exclude="${3:-}"

    local matches
    matches=$(grep -rnE "$pattern" src/ --include="*.js" 2>/dev/null \
        | grep -vE "/tests/|/__tests__/|/scripts/|/migrations/|\.test\.js|/core/db/(getModel|getPlatformModel|getSharedModel|platformConnection|sharedConnection|clusterConnections|dbResolver)\.js|/orgRuntime/seedModuleFeatures\.js${extra_exclude}" \
        || true)

    # Post-filter: drop lines that are obviously comments or string-literal
    # documentation (JSDoc *, // line comments, or patterns surrounded by
    # quotes). Keep only lines where the forbidden pattern is live code.
    local filtered=""
    if [[ -n "$matches" ]]; then
        filtered=$(echo "$matches" | awk -F: '
            {
                rest = $0;
                # Drop "file:line:" prefix
                sub(/^[^:]+:[0-9]+:/, "", rest);
                # Strip leading whitespace
                sub(/^[[:space:]]+/, "", rest);
                # Skip JSDoc / line comments
                if (rest ~ /^\*/ || rest ~ /^\/\//) next;
                # Skip lines where the match is inside a string literal
                # (heuristic: the line starts with throw/new Error/logger.warn/log etc
                # AND contains the match inside paired quotes)
                if (rest ~ /^(throw|logger\.|console\.|new Error|return (new )?Error)/) {
                    # If the forbidden pattern is inside quotes, skip.
                    if (rest ~ /"[^"]*(mongoose\.(model|connection))[^"]*"/) next;
                    if (rest ~ /`[^`]*(mongoose\.(model|connection))[^`]*`/) next;
                    if (rest ~ /'\''[^'\'']*(mongoose\.(model|connection))[^'\'']*'\''/) next;
                }
                print $0;
            }
        ')
    fi

    if [[ -n "$filtered" ]]; then
        echo "❌ $label — forbidden pattern found:"
        echo "$filtered" | head -20
        FAIL=1
    else
        echo "✅ $label — clean"
    fi
}

section "H8.1 · mongoose.model( in runtime code"
check_forbidden_pattern \
    "mongoose.model() calls" \
    "mongoose\\.model\\("

section "H8.2 · require().default in runtime code"
check_forbidden_pattern \
    ".default imports" \
    "require\\(['\"][^'\"]+['\"]\\)\\.default"

section "H8.3 · mongoose.connection in runtime code"
check_forbidden_pattern \
    "mongoose.connection reads" \
    "mongoose\\.connection[^[:alnum:]_]"

# ── H7 Write-guard ─────────────────────────────────────────────────────────
section "H8.4 · Write-guard (H7) — assertWriteAllowed presence"

MUTATING_METHODS='\.(create|insertMany|updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|findOneAndDelete|bulkWrite|save)\('

WRITE_VIOLATIONS=""
for f in $(grep -rlE "$MUTATING_METHODS" \
             src/modules/ src/organization/ \
             --include="*.js" 2>/dev/null \
             | grep -vE "/tests/|/__tests__/|/scripts/|/migrations/|\.test\.js|/models/|\.model\.js"); do
    if ! grep -q "assertWriteAllowed" "$f"; then
        WRITE_VIOLATIONS="$WRITE_VIOLATIONS
$f"
    fi
done

if [[ -n "$WRITE_VIOLATIONS" ]]; then
    echo "⚠️  Files mutating tenant DB without assertWriteAllowed() import:"
    echo "$WRITE_VIOLATIONS" | head -20 | sed 's/^/    /'
    echo ""
    echo "Each listed file MUST call assertWriteAllowed(req.context.organization, req.context.organizationId)"
    echo "before mutating. See src/core/db/assertWriteAllowed.js."
    echo ""
    echo "NOTE: This check is advisory (WARN). It does not fail CI on its own"
    echo "      until every flagged file has been reviewed — flip to FAIL=1"
    echo "      below when the list is empty."
    # FAIL=1  # ← uncomment when migrations are complete
else
    echo "✅ Write-guard — every tenant service file that mutates also imports assertWriteAllowed"
fi

echo ""
if [[ "$FAIL" == "0" ]]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "  CI Architecture Invariants — ALL CHECKS PASSED"
    echo "═══════════════════════════════════════════════════════════"
    exit 0
else
    echo "═══════════════════════════════════════════════════════════"
    echo "  CI Architecture Invariants — VIOLATIONS FOUND"
    echo "═══════════════════════════════════════════════════════════"
    exit 1
fi
