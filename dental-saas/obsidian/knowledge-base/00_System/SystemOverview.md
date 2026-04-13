# System Overview — DentalSaaS

## Type
Multi-Tenant SaaS (database-per-organization)

## Platform Identity
Enterprise-grade dental clinic management, orthodontic workflows, and AI-powered diagnostics.

## Architecture
```
┌──────────────────────────────────────────────────────────┐
│                    PLATFORM PLANE                        │
│  (Superadmin, billing, org lifecycle, plan management)   │
├──────────────────────────────────────────────────────────┤
│                  ORGANIZATION PLANE                      │
│  (Clinic operations, patients, treatments, finance)      │
├──────────────────────────────────────────────────────────┤
│              SUPERVISOR PLANE (OrthoSupervise)           │
│  (Remote case review, clinical collaboration)            │
├──────────────────────────────────────────────────────────┤
│                   PATIENT PORTAL                         │
│  (Patient-facing login, records, booking)                │
├──────────────────────────────────────────────────────────┤
│                     AI ENGINE                            │
│  (STL processing, ML segmentation, measurements)         │
└──────────────────────────────────────────────────────────┘
```

## Core Systems
- [[AuthSystem]] — JWT authentication, multi-plane identity
- [[PricingEngine]] — Region-based pricing v3 with country overrides
- [[BillingSystem]] — Subscription, invoicing, payments, ledger (4 engines)
- [[PlanManagement]] — Immutable versioned plan builder
- [[EntitlementSystem]] — Module gating, seat limits, storage quotas
- [[SecurityArchitecture]] — RBAC → PBAC → RLS pipeline
- [[DatabaseIsolation]] — Per-org DB, connection binding
- [[EventSystem]] — BullMQ queues, event bus, transactional outbox

## Clinical Domains
- [[PatientDomain]] — Records, demographics, medical history, intake
- [[AppointmentDomain]] — Scheduling, booking, calendar
- [[TreatmentDomain]] — Treatment plans, procedures, clinical protocols
- [[OrthodonticDomain]] — Case management, STL processing, staging
- [[FinanceDomain]] — Clinic-level invoicing, payments, insurance

## Infrastructure
- [[DBConnectionManager]] — Per-org connection pooling
- [[AuditSystem]] — Forensic audit logging
- [[EmailSystem]] — BullMQ + Handlebars template delivery
- [[StorageSystem]] — File uploads, quota management

## Architecture Modes
| Mode | Value | Description |
|------|-------|-------------|
| DB_MODE | `per-org` | Separate DB per organization |
| PRICING_ENGINE | `v3` | Region-based pricing with country overrides |
| RLS_STRICT_BOOT | `true` | Zero-trust database isolation |
| ENTITLEMENT_AUDIT_MODE | `false` | Warn-only entitlement violations |

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | React + Vite |
| Database | MongoDB (per-org) |
| Queue | BullMQ + Redis |
| AI | Python + PyTorch |
| Email | Nodemailer + Handlebars |
| CSS | Tailwind CSS v4 |

## Source of Truth Policy
> This vault defines system behavior. Code must follow documentation.
> All modules must be linked. Breaking changes require migration plans.

## Status
**ACTIVE** — Production-grade, all core systems hardened through Phase 4.1

---
#system #overview #architecture
