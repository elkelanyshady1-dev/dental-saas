ROLE
You are a Principal SaaS Architect and Compliance Engineer responsible for producing an execution roadmap for the DentalSaaS platform.

---

INPUT DOCUMENTS

1. System specification:
   specs/spec.md

2. Architecture audit report (if available):
   specs/architecture_audit_report.md

---

OBJECTIVE

Generate a complete implementation plan in TDS format saved to:

  specs/plan.md

The plan must address:
  - Compliance audit gaps (P0/P1/P2/P3 priority)
  - Security improvements
  - Infrastructure hardening
  - Organization-plane feature completion
  - AI pipeline productionization
  - Observability and operations

---

PLAN STRUCTURE

The output must contain the following sections:

SECTION 1 — GAP REMEDIATION PLAN
  - P0: Patient Anonymization Service (GDPR Art. 17)
  - P0: AI Training Consent Flag (GDPR Art. 22, EU AI Act)
  - P1: AuditLog Archival Cron (12-month retention, archive collection)
  - P1: Configurable Data Retention (RetentionPolicy model, per regionCode)
  - P1: Object Storage Encryption (SSE-S3 / SSE-KMS)
  - P2: Patient Data Export API (GDPR Art. 15/20)

SECTION 2 — SECURITY HARDENING PLAN
  - JWT migration from HS256 to RS256 with JWKS endpoint
  - Secrets management (AWS Secrets Manager / HashiCorp Vault)
  - Platform login rate limiter (5 attempts / 15 minutes)
  - PII masking middleware

SECTION 3 — DATA GOVERNANCE IMPLEMENTATION
  - PII masking in structured logs (Pino serializer)
  - Patient record read auditing (AuditLog on GET /patients/:id)

SECTION 4 — ORGANIZATION PLANE FEATURE COMPLETION
  - Patient Portal (treatment progress, scan upload, document download)
  - Orthodontic Module (stage progression, aligner tracking, 3D comparison)
  - Inventory Engine (stock alerts, auto-deduction, expiry tracking)
  - Treatment Protocol Engine (protocol templates, stage workflows)
  - Clinical Imaging (image gallery, DICOM viewer)

SECTION 5 — AI PIPELINE PRODUCTIONIZATION
  - FastAPI inference server deployment (replaces CLI child process)
  - ONNX Runtime GPU workers with memory management
  - BullMQ inferenceQueue integration
  - Model registry and versioning
  - Dataset versioning and training automation

SECTION 6 — INFRASTRUCTURE HARDENING
  - Disaster recovery plan (RTO: 30 min, RPO: 5 min)
  - Redis Sentinel / cluster failover
  - Search infrastructure (MongoDB text → OpenSearch phase plan)
  - Webhook delivery system (invoice.paid, appointment.created, analysis.completed)

SECTION 7 — OBSERVABILITY AND OPERATIONS
  - Distributed tracing (OpenTelemetry + Jaeger / Grafana Tempo)
  - Custom Prometheus metrics (AI inference latency, anonymization, refunds)
  - Alerting rules

SECTION 8 — RELEASE ROADMAP
  Phase 1 (2–4 weeks): Compliance Stabilization
  Phase 2 (4–6 weeks): Security Hardening
  Phase 3 (6–8 weeks): Org Plane Completion
  Phase 4 (8–12 weeks): AI Production Deployment

---

FORMAT REQUIREMENTS

For each task, include:
  - Priority (P0/P1/P2/P3)
  - Implementation files (exact backend/frontend/python-ai-engine paths)
  - Architecture diagram where relevant
  - Guard rules and invariants
  - Dependencies
  - Estimated effort (days)

End the plan with:
  - Total effort summary table
  - Risk register (risk, impact, probability, mitigation)
  - Gantt-style timeline chart (ASCII)

Use TDS formatting: section headers, tables, code blocks, architecture diagrams.
