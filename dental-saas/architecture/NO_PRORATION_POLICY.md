# NO-PRORATION POLICY
## Deterministic Renewal Billing Model

**Effective from:** Phase Y Hardening  
**Status:** ENFORCED

---

## Architecture Decision

This system uses a **deterministic renewal billing model**.  
Mid-cycle plan changes do **NOT** trigger financial adjustments.

### Behavior on Plan Change

| Field | Modified? | Purpose |
|-------|:---------:|---------|
| `org.planId` | ✅ | New plan reference |
| `subscription.planVersion` | ✅ | Snapshot to new plan version |
| `subscription.basePriceAtSubscription` | ✅ → `null` | Re-resolves from new plan at next renewal |
| `subscription.lastPlanChangeAt` | ✅ | Rate limit enforcement |
| `subscription.currentPeriodStart` | ❌ | **INVARIANT** |
| `subscription.currentPeriodEnd` | ❌ | **INVARIANT** |
| `subscription.creditBalance` | ❌ | **INVARIANT** |

### What Does NOT Happen

- No PRORATION invoice is created
- No credit for unused time is calculated
- No charge for remaining time on new plan
- No Stripe proration behavior used
- No mid-cycle billing mutation of any kind

### Pricing Reconciliation

Price reconciliation occurs **only at renewal**:

```
Renewal → resolvePlan(orgId)
       → resolveRegionalPrice(plan, countryCode)
       → region.monthly / region.yearly
       → Apply customPricing override if exists
       → Apply inflation if applicable
       → Create RENEWAL BillingInvoice
```

### Rate Limiting

Plan changes are limited to **once per 24 hours** per organization.  
Enforced in `planAggregateService.assignPlan()`.

### Reasoning

1. **Ledger Integrity** — Single invoice type (RENEWAL) simplifies reconciliation
2. **Stripe Isolation** — No Stripe proration flags; internal DB is billing authority
3. **Determinism** — Renewal engine has single, predictable pricing path
4. **Complexity Reduction** — Eliminates partial-period financial calculations
5. **Audit Clarity** — Each invoice maps to exactly one billing cycle

### Prohibited Patterns

```javascript
// ❌ NEVER
calculateProration(...)
invoice.type = "PRORATION"
subscription.creditBalance += prorationCredit
currentPeriodEnd = recalculatedDate

// ✅ ALWAYS
planAggregateService.assignPlan(...)  // Immediate swap
// → Renewal engine reconciles at next cycle
```
