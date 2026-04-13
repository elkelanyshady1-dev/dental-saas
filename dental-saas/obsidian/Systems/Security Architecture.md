# Security Architecture

> **Zero-trust, defense-in-depth security** — layered enforcement across platform, organization, and data access.

## Security Layers

### Layer 1: Authentication
- Platform Users (`PlatformUser` model) — superadmin access
- Organization Users (`User` model) — clinic staff
- Patient Portal auth — separate authentication context
- Supervisor auth — isolated plane authentication
- **Pattern**: Strict identity separation between planes

### Layer 2: RBAC (Role-Based Access Control)
- Platform RBAC: superadmin, admin, viewer
- Organization RBAC: admin, dentist, assistant, receptionist
- Role seeding on org provisioning
- Permission-based route guards

### Layer 3: PBAC (Policy-Based Access Control)
- **Location**: `backend/src/platform/policies/`
- Field-level access control
- Context-aware policy evaluation
- Threshold-based alerting for high-denial rates
- Anomaly detection for suspicious access patterns

### Layer 4: Database Isolation (RLS / Per-Org DB)
- See: [[Database Isolation]]

## Cross-Layer Integrity
- Entitlement (platform) → RBAC (org) → PBAC (context)
- No cross-layer bypass allowed
- Features only accessible when ALL layers allow

## Audit & Monitoring
- **Sequential Audit Logging**: High-integrity append-only audit trail using BullMQ (`concurrency: 1`) to ensure hash-chain continuity per organization.
- **Atomic Hash Chain**: Each audit record contains a cryptographic hash of the previous record, preventing tampering.
- **Self-Healing Recovery**: Inline collision handling in workers to resolve race conditions during high-concurrency log events.
- Forensic trail support with boot-time index repair.
- Security alerting on anomalous patterns.
- Event-driven cache invalidation for policies.
- Policy versioning with history storage.
- System metrics for SLO tracking.

## Request Tracing
- `X-Request-ID` propagation from frontend
- W3C `traceparent` header support
- AsyncLocalStorage for context propagation
- Correlation across logs, errors, and audit entries

## Related
- [[Platform Plane]]
- [[Organization Plane]]
- [[Database Isolation]]

---
#security #rbac #pbac #architecture
