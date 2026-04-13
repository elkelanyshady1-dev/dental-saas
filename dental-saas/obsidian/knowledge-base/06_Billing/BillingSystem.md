# Billing System

## Architecture
Comprehensive multi-tier billing infrastructure consisting of four core engines:
1. **Subscription Engine**: Manages plan lifecycle (trial, active, past_due).
2. **Invoice Engine**: Generates tax-compliant invoices.
3. **Payment Engine**: Integrates with Stripe/Paymob.
4. **Ledger Engine**: Immutable record of all financial transactions.

## State Classification (orgSubscriptionGuard)
To ensure consistent access control, the system classifies every organization's subscription into one of five states:
- **`active`**: Valid `contractStatus: "active"` (Platform Plane) or legacy `status: "active"` (Org Plane).
- **`trial`**: Within the valid `trialEndDate` period.
- **`grace`**: Contract is expired but within the technical grace window (allows degraded access).
- **`expired`**: Blocked — requires payment for access (`402 Payment Required`).
- **`unknown`**: Fallback/Undefined — defaults to `402 Payment Required`.

## Core Invariant: Activate-Before-Invoice
The `BillingOrchestrator` strictly enforces that a subscription is **activated** in the platform ledger *before* a Stripe/Paymob invoice is finalized. This prevents "phantom subscriptions" where a user is billed but doesn't receive system access.

## Dependencies
- [[PricingEngine]] — Source of pricing truths.
- [[EntitlementSystem]] — Triggered upon successful subscription validation.
- [[OrgContractModel]] — Primary source of commercial truth.

## Status
**PENDING v3 SUPPORT** — Full automated sync between v3 Region pricing and Stripe Price IDs is in progress.
