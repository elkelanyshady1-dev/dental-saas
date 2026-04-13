ROLE
You are a senior engineering lead responsible for breaking implementation plans into concrete developer tasks for the DentalSaaS platform.

---

INPUT DOCUMENT

Read the full implementation plan from:
  specs/plan.md

Also read the system specification for architectural context:
  specs/spec.md

---

OBJECTIVE

Generate a complete, granular developer task list saved to:

  specs/tasks.md

---

TASK STRUCTURE

Organize all tasks into the following categories:

BACKEND TASKS
  - Node.js / Express controllers, services, middleware
  - Mongoose models and migrations
  - Route definitions and Swagger annotations
  - BullMQ queue and worker changes
  - EventBus subscriber additions
  - Cron jobs

FRONTEND TASKS
  - React component implementations
  - Page / route additions
  - API client integration
  - Context / state management updates
  - Design system usage

AI ENGINE TASKS
  - Python model and pipeline changes
  - FastAPI inference server
  - Dataset pipeline changes (consent enforcement, versioning)
  - Training automation scripts

INFRASTRUCTURE TASKS
  - Redis configuration (Sentinel, caching layer)
  - S3 encryption and bucket policies
  - Docker / Kubernetes changes
  - Environment variable and secrets management updates
  - Monitoring and alerting configuration

DEVOPS TASKS
  - CI/CD pipeline changes
  - Health check and readiness probe updates
  - DR setup (MongoDB snapshots, S3 CRR, Redis AOF)
  - Deployment documentation

---

TASK FORMAT

For each task, include:

  - ID: TASK-{category}-{number}   (e.g. TASK-BE-001, TASK-FE-012, TASK-AI-003)
  - Title: One-line description
  - Priority: P0 / P1 / P2 / P3
  - Status: TODO
  - Effort: X days
  - File(s): Exact path(s) to create or modify
  - Depends on: List of TASK-IDs this task requires first
  - Acceptance Criteria: Bullet list of what "done" means
    - Tests written and passing
    - Swagger annotation added (if applicable)
    - AuditLog entry produced (if applicable)
    - Sentinel pre-check passed (if applicable)

---

ADDITIONAL REQUIREMENTS

1. SENTINEL PRE-CHECKS
   For every backend task that introduces:
   - A new API route → ensure Swagger annotation added
   - A new capability → ensure PLATFORM_CAPABILITIES contract updated
   - A new middleware → ensure plane isolation respected
   Mark those tasks with [SENTINEL REQUIRED] tag.

2. TESTING REQUIREMENTS
   Every backend task must include:
   - Unit test file path (e.g. backend/tests/unit/services/anonymizePatient.test.js)
   - Integration test path where relevant

3. DATABASE TASKS
   For every Mongoose model change, include:
   - Migration script path (backend/scripts/migrations/)
   - Backfill requirements if existing documents are affected

4. COMPLETION TRACKING
   End the file with a summary table:

   | Category | Total Tasks | P0 | P1 | P2 | P3 | Effort (days) |
   |----------|------------|----|----|----|----|--------------|
   | Backend  | ...        | .. | .. | .. | .. | ...           |
   | Frontend | ...        | .. | .. | .. | .. | ...           |
   | AI Engine| ...        | .. | .. | .. | .. | ...           |
   | Infra    | ...        | .. | .. | .. | .. | ...           |
   | DevOps   | ...        | .. | .. | .. | .. | ...           |
   | TOTAL    | ...        | .. | .. | .. | .. | ...           |

Use TDS formatting throughout.
