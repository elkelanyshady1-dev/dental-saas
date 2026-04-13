# 🦷 DentalSaaS — Knowledge Hub

> **The definitive Source of Truth for the Dental SaaS Architecture, Engineering, and Governance.**
> *Documentation defines behavior. Code follows documentation.*

---

## 🏛️ [[SystemOverview|System Overview]]
*Primary entry point for the Multi-Tenant architecture and system-wide planes.*

---

## 📂 Navigation (Knowledge Base)

### 01 — [[PlaneArchitecture|Architecture]]
- [[PlaneArchitecture|Planes & Isolation]]
- [[MultiTenancy|Multi-Tenancy (per-org DB)]]
- [[RLSEngine|RLS Engine (Defense-in-Depth)]]
- [[EventDrivenArchitecture|Event-Driven Architecture (Outbox)]]

### 02 — [[AuthSystem|Backend Systems]]
- [[AuthSystem|Auth System (Multi-Plane Identity)]]
- [[AuthMiddleware|Auth Middleware]]
- [[SecurityArchitecture|Security Architecture (RBAC → PBAC → RLS)]]
- [[EntitlementSystem|Entitlement & Quota System]]
- [[DBConnectionManager|Database Connection Manager]]
- [[AuditSystem|Audit System (Forensic logging)]]
- [[EmailSystem|Email System (BullMQ)]]
- [[StorageSystem|Storage & Quota System]]
- [[PricingResolver|Pricing Resolver]]

### 03 — [[PlanBuilder|Frontend Systems]]
- [[PlanBuilder|Plan Builder Page]]
- [[RegionCard|Region Card Component]]
- [[Auto UI Engine|Auto UI Engine (v1.0 SSOT)]]

### 04 — [[PricingEngine|Pricing Logic]]
- [[PricingEngine|Pricing Engine v3]]
- [[RegionMapping|Region & Country Mapping]]

### 05 — [[AuthorityBridge|Authentication]]
- [[AuthorityBridge|Authority Bridge (Cross-Plane Authority)]]

### 06 — [[BillingSystem|Billing]]
- [[BillingSystem|Billing Engines (v3 Support)]]

### 07 — [[PricingAudit|Audit & Quality]]
- [[PricingAudit|Pricing & Schema Audit]]

### 08 — [[SystemRules|System Rules]]
- [[SystemRules|Source of Truth Enforcement]]

---

## 🔗 Planning & Roadmap
- [[Plan Management]] — Legacy planning (refactoring)
- [[Feature Registry]] — Feature flags v2
- [[Roadmap]] — Current implementation status

---

*Last updated: 2026-03-29 — Phase 4.1 Entitlements Hardening Complete*
