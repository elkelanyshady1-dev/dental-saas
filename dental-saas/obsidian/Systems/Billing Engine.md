# Billing Engine

> **Enterprise-grade financial infrastructure** — four formal engines orchestrated through a centralized billing orchestrator.

## Overview
The billing system manages the full financial lifecycle of SaaS subscriptions: from plan selection through checkout, invoicing, payment processing, and ledger reconciliation.

## The Four Engines

### 1. Subscription Engine
- Manages subscription lifecycle (create, upgrade, downgrade, cancel)
- Supersedence chain for plan changes
- Atomic upgrade pipeline (v22.2)
- **Pattern**: Activate-Before-Invoice

### 2. Invoice Engine
- Generates invoices from subscription events
- Proration handling (NO_PRORATION policy)
- Invoice state machine: draft → issued → paid → void

### 3. Payment Engine
- Payment processing and gateway integration
- Partial refund support with cumulative validation
- Financial retry queues with priority

### 4. Ledger Engine
- Double-entry bookkeeping
- Financial state versioning across all mutations
- Integrity audit trails

## Orchestrator Layer
- **Location**: `backend/src/platform/billing/orchestrator/BillingOrchestrator.service.js`
- Coordinates all four engines
- Session-aware transaction management
- Circuit breaker pattern (granular, operation-based)
- Transactional outbox for guaranteed event delivery

## Pricing System (v3)
- **Location**: `backend/src/platform/billing/pricing/`
- Global base pricing
- Regional pricing overrides
- Country-level price overrides
- Currency validation per region
- Revenue-protective guardrails (discount limits, anomaly detection)
- See: [[Plan Builder]]

## Key Models
| Model | Purpose |
|-------|---------|
| `OrgContract` | Active contract between platform and org |
| `Subscription` | Subscription state and plan binding |
| `Invoice` | Invoice records with line items |
| `Payment` | Payment transactions |
| `LedgerEntry` | Double-entry financial records |

## Safety Invariants
- No money movement without ledger entry
- No plan activation without valid contract
- Circuit breaker prevents cascade failures
- Session isolation for all financial mutations

## Related
- [[Plan Builder]]
- [[Platform Plane]]
- [[Organization Management]]

---
#billing #financial #platform
