# DentalSaaS — Developer Makefile

.PHONY: audit plan tasks spec docs spec-audit help

# ─────────────────────────────────────────────────────────────────────────────
# Specification Workflow — AI-assisted TDS management
# ─────────────────────────────────────────────────────────────────────────────

## audit — Run full system architecture and compliance audit
##          Output: specs/architecture_audit_report.md
audit:
	codex exec - < prompts/audit-system.md

## plan — Generate implementation plan from spec
##         Output: specs/plan.md
plan:
	codex exec - < prompts/generate-plan.md

## tasks — Break plan into developer tasks
##          Output: specs/tasks.md
tasks:
	codex exec - < prompts/generate-tasks.md

## spec — Update system specification from codebase
##         Output: updated specs/spec.md
spec:
	codex exec - < prompts/update-spec.md

## spec-audit — Run codebase-level SPEC-KIT enforcement scan (developer)
##               Validates G1/G2/G3 gates + B1-B5 block conditions
##               Exit 1 (CI blocking) if violations found
spec-audit:
	node scripts/spec-audit.js

## ci:audit — Run CI-grade spec enforcement (matches GitHub Actions exactly)
##             Uses auditSpecFlow.js — same script as the CI pipeline
ci\:audit:
	node scripts/auditSpecFlow.js

## docs — Full spec cycle: spec → audit → plan → tasks → spec-audit
docs: spec audit plan tasks spec-audit

# ─────────────────────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────────────────────

## help — Show available commands
help:
	@echo ""
	@echo "DentalSaaS Specification Workflow"
	@echo "══════════════════════════════════"
	@grep -E '^## ' Makefile | sed 's/## /  make /'
	@echo ""
	@echo "Run 'make docs' to regenerate all spec documents in sequence."
	@echo ""
