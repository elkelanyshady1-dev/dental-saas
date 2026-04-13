---
description: SPEC-KIT MODE — Force all development to follow spec.md → plan.md → tasks.md → implementation
---

# 🛡 SPEC-KIT MODE — DentalSaaS Enforced Development Workflow

// turbo-all

## MANDATORY GATE CHECKS

Before writing ANY code, the agent MUST verify:

1. Does `specs/spec.md` exist and contain the domain being changed?
   - YES → proceed to Step 1
   - NO  → **BLOCKED** — run `make spec` first, then create a spec section for this domain

2. Does `specs/plan.md` reference this feature/change?
   - YES → proceed to Step 2
   - NO  → **BLOCKED** — run `make plan` first

3. Does `specs/tasks.md` contain a task for this work?
   - YES → proceed to implementation
   - NO  → **BLOCKED** — run `make tasks` first

---

## STEP 0 — GATE: Verify Spec Alignment

Before any implementation, open and verify:

```
specs/spec.md      → does the domain/section exist?
specs/plan.md      → is this change in the plan?
specs/tasks.md     → is there a task card for this work?
```

If any file is missing or the domain is undocumented:
```
⚠️ SPEC-KIT GATE FAILURE

Missing:
  □ spec.md section for [domain]
  □ plan.md entry for [feature]
  □ tasks.md task card for [work item]

Required action: Run the blocked step before proceeding.
```

---

## STEP 1 — Update Spec from Codebase

// turbo
Run:
```
codex exec - < prompts/update-spec.md
```
Or: `make spec`

**Output:** Updated `specs/spec.md` (version bumped)

**When required:**
- After any architecture change
- When adding a new domain, model, or service
- Before creating a plan for a new feature

---

## STEP 2 — Generate Implementation Plan

// turbo
Run:
```
codex exec - < prompts/generate-plan.md
```
Or: `make plan`

**Output:** `specs/plan.md`

**When required:**
- After spec is updated with new requirements
- At the start of a new development cycle
- After an audit identifies gaps

---

## STEP 3 — Generate Developer Tasks

// turbo
Run:
```
codex exec - < prompts/generate-tasks.md
```
Or: `make tasks`

**Output:** `specs/tasks.md`

**When required:**
- After `plan.md` is current
- When sprint planning from the roadmap

---

## STEP 4 — Implementation

Only after Steps 1–3 are complete and verified may implementation begin.

Rules during implementation:
- Every file modified MUST correspond to a task in `specs/tasks.md`
- Every new model, route, or service MUST be traceable to `specs/spec.md`
- Every architectural decision MUST be traceable to `specs/plan.md`

---

## STEP 5 — Post-Implementation Spec Sync (AUTOMATIC)

After completing any implementation task:

// turbo
```
codex exec - < prompts/update-spec.md
```
Or: `make spec`

This is **not optional**. Per Rule 20 of the Rules Engine, the spec MUST be updated automatically on completion.

---

## BLOCK CONDITIONS

The agent MUST stop and show the gate failure message if:

- [ ] Implementation is requested with no spec coverage
- [ ] A new domain is introduced without a spec section
- [ ] A feature is built that is not in `plan.md`
- [ ] Code is written that has no corresponding task in `tasks.md`
- [ ] `update-spec.md` has not been run after the last implementation

---

## FULL SPEC-KIT CYCLE (Reference)

```
New Feature Request
      ↓
[GATE] Check spec.md, plan.md, tasks.md
      ↓
make spec          (sync spec with codebase)
      ↓
make plan          (generate implementation plan)
      ↓
make tasks         (generate developer task cards)
      ↓
Implementation     (code against task cards)
      ↓
make spec          (auto-sync spec on completion)
      ↓
Done ✅
```

---

## QUICK REFERENCE

| Command | Purpose | Output |
|---------|---------|--------|
| `make spec` | Sync spec with codebase | `specs/spec.md` (version bumped) |
| `make audit` | Architecture + compliance audit | `specs/architecture_audit_report.md` |
| `make plan` | Generate implementation plan | `specs/plan.md` |
| `make tasks` | Generate developer tasks | `specs/tasks.md` |
| `make docs` | Run all four in sequence | All outputs |
