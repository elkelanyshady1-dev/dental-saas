# DentalSaaS — Specification Workflow

**Document Type:** Developer Operations Guide
**Version:** 1.0
**Last Updated:** 2026-03-12

---

## Overview

This document describes how to run the DentalSaaS AI-assisted specification workflow.

The workflow consists of four repeatable prompts that can be executed directly from the repository using `codex exec`. All prompt files live in the `prompts/` directory at the repository root.

```
dental-saas/
├── prompts/
│   ├── audit-system.md      ← Full architecture + compliance audit
│   ├── generate-plan.md     ← Implementation plan from spec
│   ├── generate-tasks.md    ← Developer task list from plan
│   └── update-spec.md       ← Sync spec with codebase
├── specs/
│   ├── spec.md              ← Root system specification (TDS)
│   ├── plan.md              ← Implementation roadmap
│   ├── tasks.md             ← Developer task list
│   └── architecture_audit_report.md
└── docs/
    └── spec-workflow.md     ← This file
```

---

## Prerequisites

- `codex` CLI installed and authenticated
- Run commands from the **repository root** (`dental-saas/`)

---

## Workflow Commands

### Run Architecture Audit

Performs a full system audit covering architecture, security, tenant isolation, billing, refunds, data retention, and compliance gaps.

**Output:** `specs/architecture_audit_report.md`

```bash
codex exec - < prompts/audit-system.md
```

**When to run:**
- After significant backend architecture changes
- Before a release milestone
- When a compliance review is required
- When onboarding a new engineer to the codebase

---

### Generate Implementation Plan

Reads `specs/spec.md` and produces a prioritized implementation plan with effort estimates, architecture diagrams, and risk register.

**Output:** `specs/plan.md`

```bash
codex exec - < prompts/generate-plan.md
```

**When to run:**
- After the spec is updated with new requirements
- At the start of a new development cycle
- After an audit identifies gaps

---

### Generate Developer Tasks

Reads `specs/plan.md` and breaks it into granular, categorized developer tasks with acceptance criteria, file paths, and dependency chains.

**Output:** `specs/tasks.md`

```bash
codex exec - < prompts/generate-tasks.md
```

**When to run:**
- After `generate-plan.md` has been run and `specs/plan.md` is up to date
- When sprint planning from the roadmap

---

### Update System Specification

Scans the repository codebase and updates `specs/spec.md` to reflect the current implementation. Preserves all existing sections; adds new sections and corrects outdated content.

**Output:** Updated `specs/spec.md` (version incremented)

```bash
codex exec - < prompts/update-spec.md
```

**When to run:**
- After implementing a significant architectural change
- When new domains, models, or middleware are added
- When the spec is out of sync with the codebase
- After each sprint to keep the spec current

---

## Recommended Workflow Order

```
1. Update Spec (sync with codebase)
   codex exec - < prompts/update-spec.md

2. Run Architecture Audit (identify gaps)
   codex exec - < prompts/audit-system.md

3. Generate Implementation Plan (prioritized roadmap)
   codex exec - < prompts/generate-plan.md

4. Generate Developer Tasks (granular task list)
   codex exec - < prompts/generate-tasks.md
```

Or use the Makefile shortcuts:

```bash
make spec     # Update spec from codebase
make audit    # Run architecture and compliance audit
make plan     # Generate implementation plan
make tasks    # Generate developer task list
```

---

## Makefile Reference

| Command | Prompt | Output |
|---------|--------|--------|
| `make audit` | `prompts/audit-system.md` | `specs/architecture_audit_report.md` |
| `make plan` | `prompts/generate-plan.md` | `specs/plan.md` |
| `make tasks` | `prompts/generate-tasks.md` | `specs/tasks.md` |
| `make spec` | `prompts/update-spec.md` | updated `specs/spec.md` |
| `make docs` | runs all four in order | all outputs |

---

## Prompt Design Principles

All prompts in `prompts/` are designed to be:

| Principle | Description |
|-----------|-------------|
| **Self-contained** | No external path references. Runs in any environment. |
| **Repository-relative** | All file references use paths relative to the repo root |
| **Idempotent** | Running the same prompt twice produces consistent results |
| **Non-destructive** | `update-spec.md` and `generate-plan.md` never remove existing content without justification |
| **TDS-formatted** | All outputs follow Technical Design Specification format |

---

## Adding a New Prompt

1. Create a new file in `prompts/`:
   ```bash
   touch prompts/my-new-prompt.md
   ```

2. Follow the prompt format:
   ```markdown
   ROLE
   You are a [role description].

   ---

   OBJECTIVE
   [What the prompt produces]

   ---

   INPUT
   [What files or directories the prompt reads]

   ---

   OUTPUT
   [What file is generated, with exact path]

   ---

   [Detailed instructions...]
   ```

3. Add a Makefile target in the root `Makefile`:
   ```makefile
   my-task:
   	codex exec - < prompts/my-new-prompt.md
   ```

4. Document the command in this file under a new heading.

---

## Troubleshooting

### `codex exec` reports "file not found"

Ensure you are running the command from the **repository root** (`dental-saas/`), not from a subdirectory:

```bash
# Correct — from repo root
cd path/to/dental-saas
codex exec - < prompts/audit-system.md

# Wrong — from subdirectory
cd path/to/dental-saas/backend
codex exec - < ../prompts/audit-system.md   # may fail in some environments
```

### Prompt runs but output file is not created

The prompt instructs Codex to write to a specific path. If the output is missing, check:
- The `specs/` directory exists at the repo root
- You have write permissions to the `specs/` directory
- The prompt completed without error (check the last few lines of output)

### Spec version is not incrementing

After running `update-spec.md`, open `specs/spec.md` and verify the **Version** field in the document header was updated. If not, re-run the prompt and explicitly ask it to "increment the version number to X.Y".
