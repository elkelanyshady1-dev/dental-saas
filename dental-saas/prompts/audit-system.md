ROLE
You are a senior SaaS architecture auditor and distributed systems engineer.

Your task is to perform a FULL SYSTEM ARCHITECTURE AND COMPLIANCE AUDIT of this repository.

This is an enterprise-grade dental SaaS platform with:
- Node.js / Express backend
- React / Vite frontend
- MongoDB database
- Redis + BullMQ queues
- Python AI engine (orthodontic STL analysis)
- Multi-tenant architecture
- RBAC (Platform Plane + Organization Plane)
- Event-driven system (EventBus, BullMQ)
- Object storage for medical files
- Hybrid Billing engine with OrgContract / PlanVersion

---

REPOSITORY SCOPE

Analyze the following directories:

  backend/
  frontend/
  packages/
  python-ai-engine/
  specs/

---

AUDIT TOPICS

Evaluate the following dimensions. Be exhaustive. Do not summarize.

1. ARCHITECTURE INTEGRITY
   - Dual-plane isolation (Platform vs Organization)
   - Domain boundaries and bounded contexts
   - SovereignGuard boot invariants
   - Middleware chain correctness
   - Router topology conflicts

2. SECURITY MODEL
   - JWT signing strategy (HS256 vs RS256, per-plane keys)
   - CSRF protection
   - Token type isolation
   - Rate limiting coverage
   - NoSQL injection protection
   - PII in logs

3. REDIS USAGE
   - BullMQ queue configuration and retry policies
   - Dynamic worker scaling (workerScaler.js)
   - Rate limiter Redis store
   - Subscription state caching (planned)
   - Redis SPOF risk

4. QUEUE SYSTEM
   - emailQueue, smsQueue, whatsappQueue, notificationQueue, inferenceQueue
   - Dead letter queues
   - Worker concurrency
   - Idempotency patterns

5. AI PIPELINE
   - Child process vs dedicated inference server
   - GPU memory management
   - Model registry and versioning
   - Dataset anonymization and consent enforcement
   - Training pipeline maturity

6. TENANT ISOLATION
   - organizationId injection model
   - Query-level filtering
   - Branch-level scoping
   - Cross-tenant leak vectors

7. BILLING SYSTEM
   - Subscription Guard architecture (legacy vs new guard)
   - OrgContract / PlanVersion entitlement chain
   - Subscription state cache
   - Invoice immutability
   - Refund state machine

8. REFUND SYSTEM
   - Refund state machine (refund_requested → refund_completed)
   - Policy engine (window, thresholds, velocity)
   - Compensating financial entries
   - BillingLedger integrity

9. DATA RETENTION POLICIES
   - AuditLog hash chain and archival plan
   - Financial record immutability
   - Patient data retention periods
   - AI scan data retention
   - RefundExecutionRecord TTL

10. COMPLIANCE GAPS
    - GDPR Article 17 (patient anonymization)
    - GDPR Article 22 / EU AI Act (AI training consent)
    - SOC 2 (audit trails, access controls)
    - Object storage encryption

---

OUTPUT

Generate a full architecture audit report saved to:

  specs/architecture_audit_report.md

The report must contain these sections:

  SECTION 1  — Repository Structure
  SECTION 2  — Backend Architecture
  SECTION 3  — Multi-Tenant Security
  SECTION 4  — Authentication
  SECTION 5  — RBAC System
  SECTION 6  — Event System
  SECTION 7  — Infrastructure
  SECTION 8  — API Design
  SECTION 9  — Data Storage
  SECTION 10 — File Storage
  SECTION 11 — AI Engine
  SECTION 12 — Frontend Architecture
  SECTION 13 — Performance and Scalability
  SECTION 14 — Security Review
  SECTION 15 — Compliance Review
  SECTION 16 — Architecture Score (X/10 per dimension)
  SECTION 17 — Critical Fixes (Top 10, prioritized P0/P1/P2)
  SECTION 18 — Optional Improvements

Use Technical Design Specification (TDS) format.
Use tables, diagrams, code blocks.
Do not summarize. Be exhaustive and specific.
