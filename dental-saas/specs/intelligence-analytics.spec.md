# INTELLIGENCE & ANALYTICS DOMAIN SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.0
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/modules/intelligenceDomain/engines/riskScoring.engine.js`
- `backend/src/modules/intelligenceDomain/engines/clinicalEfficiency.engine.js`
- `backend/src/modules/intelligenceDomain/engines/doctorPerformance.engine.js`
- `backend/src/modules/intelligenceDomain/config/` (derived from directory structure)
- `backend/src/modules/intelligenceDomain/projections/` (derived from directory structure)
- `backend/src/modules/analyticsDomain/` (derived from directory structure)
- `backend/src/platform/controllers/platformAnalyticsController.js`
- `backend/src/platform/controllers/monitoringController.js`
- `backend/src/platform/controllers/communicationMetricsController.js`

---

## SECTION 1 — PURPOSE

The Intelligence & Analytics domain provides data-driven decision support for both system planes:

**Organization Plane (Intelligence Domain):**
- **Risk Scoring Engine** — Computes a composite risk score (0–100) for an organization from multiple financial and operational signals. Used for early warning on at-risk clinic accounts.
- **Clinical Efficiency Engine** — Measures treatment throughput, average appointment duration, stage completion rates, and chair utilization.
- **Doctor Performance Engine** — Aggregates per-doctor appointment volumes, completion rates, patient satisfaction indicators, and revenue generated.

**Platform Plane (Analytics Domain):**
- **Platform Analytics** — Aggregated SaaS metrics: MRR, ARR, new signups, churn rate, trial conversion, subscription plan distribution.
- **System Monitoring** — Infrastructure health metrics: API response times, error rates, queue depths, Redis connectivity.
- **Communication Metrics** — Email/SMS/WhatsApp delivery rates, bounce rates, and retry volumes across all tenants.

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- Risk scoring computation (pure function, projection-only, no DB mutations)
- Clinical efficiency aggregation queries
- Doctor performance aggregation queries
- Platform-level revenue and subscription analytics
- System monitoring data aggregation
- Communication delivery metrics

**Receives signals from:**
- AppointmentDomain — appointment records (for efficiency, performance engines)
- BillingDomain — invoice/payment records (for risk scoring, org financial health)
- InventoryDomain — case cost snapshots (for inventory cost ratio)
- CommunicationDomain — delivery logs (for communication metrics)
- Prometheus metrics endpoint — infrastructure observability

**Emits events to:**
- No domain events emitted (read-only / projection domain)
- Provides `riskScore`, `riskSeverity`, `recommendedActions` to callers

**Does NOT own:**
- Actual billing mutations (delegated to BillingEngine)
- Appointment scheduling (delegated to AppointmentEngine)
- Patient record mutation (delegated to PatientDomain)

---

## SECTION 3 — DATA MODELS

### RevenueSnapshotProjection (platform/billing/models/)
```
RevenueSnapshotProjection {
  _id              ObjectId
  period           String (YYYY-MM)
  mrr              Number (Monthly Recurring Revenue)
  arr              Number (Annual Run Rate = MRR × 12)
  newSubscriptions Number
  churned          Number
  netNewMRR        Number
  activeContracts  Number
  trialContracts   Number
  createdAt        Date
}
```

> All other intelligence domain outputs are computed on-the-fly from existing domain data. No separate analytics collections required for org-plane engines (pure computation).

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### RiskScoring Engine (`engines/riskScoring.engine.js`)

**`calculateRisk({ outstandingBalance, margin, delayRatio, inventoryCostRatio, cancellationRate })`**

Pure function — zero DB operations, zero side effects. Projection-only.

**Inputs:**
| Signal | Type | Description |
|--------|------|-------------|
| `outstandingBalance` | Number | Total unpaid patient invoices (in org currency) |
| `margin` | Number | Revenue minus direct costs (signed — negative = loss) |
| `delayRatio` | Number (0–1) | Ratio of delayed-stage cases to total cases |
| `inventoryCostRatio` | Number (0–1) | Material cost as proportion of revenue |
| `cancellationRate` | Number (0–1) | Appointment cancellation rate (cancelled / scheduled) |

**Risk Signal Thresholds:**
| Signal | Threshold | Risk Points | Category |
|--------|-----------|------------|---------|
| `outstandingBalance > 5000` | Hard-coded (should be org-configurable ideally) | +30 | Financial |
| `margin < 0` | Zero crossing | +40 | Profitability |
| `delayRatio > 0.3` | 30% of cases delayed | +15 | Operational |
| `inventoryCostRatio > 0.4` | Materials > 40% of revenue | +15 | Inventory |
| `cancellationRate > 0.2` | 20%+ cancellations | +15 | Patient Engagement |

**Output:**
```
{
  riskScore        Number (0–100, capped)
  severity         Enum: Low | Medium | High
  riskCategories   Array<String> (which risk categories triggered)
  recommendedActions Array<String> (actionable text per triggered category)
}
```

**Severity Thresholds:**
- `riskScore >= 70` → High
- `riskScore >= 40` → Medium
- `riskScore < 40` → Low

---

### ClinicalEfficiency Engine (`engines/clinicalEfficiency.engine.js`)
Aggregates org-level clinical throughput metrics:
- Average appointment duration vs. scheduled duration
- Stage completion rate per month
- Chair utilization rate (occupied hours / working hours)
- Patient visit frequency

### DoctorPerformance Engine (`engines/doctorPerformance.engine.js`)
Aggregates per-doctor performance metrics:
- Total appointments per doctor per period
- Completion rate (completed / scheduled)
- Average waiting duration per patient per doctor
- Treatment case volume (new, ongoing, completed)
- Revenue attributed per doctor (from completed appointments → billed invoices)

### PlatformAnalyticsController (`platformAnalyticsController.js`)
- **getMetrics** — Returns platform-wide SaaS KPIs:
  - Active organization count (by status)
  - New organizations in period
  - Churned organizations
  - MRR, ARR from active contracts
  - Trial conversion rate
  - Plan distribution breakdown

### MonitoringController (`monitoringController.js`)
- **getSystemHealth** — Returns:
  - API latency percentiles (p50, p95, p99) from Prometheus
  - Error rate (5xx / total requests) per endpoint group
  - Queue depths (waiting, active, failed) per BullMQ queue
  - Redis memory usage and connection status
  - MongoDB connection pool status

### CommunicationMetricsController (`communicationMetricsController.js`)
- **getMetrics** — Delivery metrics by channel (email, SMS, WhatsApp):
  - Sent, failed, delivered, bounced counts
  - Retry volume and resolution rate
  - DLQ (dead-letter queue) current depth
- **getRetryLogs** — Lists recent delivery failures with error classifications

---

## SECTION 5 — API CONTRACTS

### Organization Intelligence Routes (Derived from code structure)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/v1/org/analytics/risk` | Get risk score for current org | `orgProtect` + `ACCOUNTING_READ` |
| GET  | `/api/v1/org/analytics/efficiency` | Clinical efficiency metrics | `orgProtect` + `ACCOUNTING_READ` |
| GET  | `/api/v1/org/analytics/doctors` | Doctor performance metrics | `orgProtect` + `ACCOUNTING_READ` |
| GET  | `/api/v1/org/analytics/overview` | Combined analytics dashboard data | `orgProtect` + `ACCOUNTING_READ` |

### Platform Analytics Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/analytics` | Platform-wide SaaS KPIs | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |
| GET  | `/api/platform/analytics/revenue` | Revenue analytics (MRR, ARR, churn) | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |
| GET  | `/api/platform/monitoring` | System health and infrastructure metrics | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |
| GET  | `/api/platform/communication/metrics` | Communication delivery metrics | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |

---

## SECTION 6 — SECURITY RULES

- **Read-only engines:** All Intelligence Domain engines are projection-only. They perform no DB mutations, emit no events, and hold no state. They are safe to call from any context without authorization concern beyond the route guard.
- **Org isolation:** All org-plane analytics queries are always scoped to `organizationId` from the JWT.
- **Platform analytics access:** Platform analytics require `VIEW_PLATFORM_ANALYTICS` capability — available to `superadmin`, `finance_admin`, `operations_admin`, `analyst` roles.
- **Risk score data sources:** The input signals to `calculateRisk()` are computed from org-scoped queries before being passed to the pure function — the engine itself never touches the database.
- **No analytics PII in platform layer:** Platform-level analytics use aggregate counts and financial totals only. No patient-identifiable data crosses the org/platform boundary.

---

## SECTION 7 — EVENTS

The Intelligence Domain emits **no events**. It is a pure read/projection layer.

**Events consumed (indirectly via data reads):**
- Appointment records (from completed appointments)
- Invoice records (from billing domain)
- InventoryCostSnapshot (from inventory domain)
- Communication delivery logs (from communication domain)

---

## SECTION 8 — INVARIANTS

- `calculateRisk()` is a pure function — given the same inputs, it always returns the same output. It must not be modified to perform DB reads or emit events.
- `riskScore` is always clamped to the range [0, 100] — `Math.min(riskScore, 100)`.
- Severity thresholds: High ≥ 70, Medium ≥ 40, Low < 40.
- Platform analytics display aggregate data only — no per-patient or per-user identifiable data.
- Organization intelligence queries are always filtered by `organizationId` from the authenticated JWT.
- `outstandingBalance` threshold of 5000 is currently hard-coded — this should be made org-configurable in a future release (noted in source code).

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Behavior |
|-----------|-------------|---------|
| No data for analytics period | 200 | Returns zero-value metrics (not 404) |
| Org has no appointments | 200 | Returns empty arrays / zero metrics |
| Platform analytics DB query timeout | 500 | Error response with message |
| Risk score input missing | 200 | Missing signals default to 0 (function parameters default to 0) |
| Monitoring — Redis unreachable | 200 | Redis status: `{ connected: false }` in response |
| Communication metrics — no data | 200 | Returns empty/zero metrics |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

### Query Complexity
- **Risk scoring inputs:** Requires aggregation queries on Appointment, Invoice, CaseCostSnapshot, and Patient collections. Each query should use covered indexes.
- **Doctor performance:** Uses MongoDB `$group` aggregation on Appointment collection filtered by `organizationId + dentistId`. An index on `{ organizationId: 1, dentistId: 1, status: 1, completedAt: 1 }` is recommended.
- **Clinical efficiency:** Uses `$group` on `{ organizationId, branchId }` across appointment date ranges. Index: `{ organizationId: 1, branchId: 1, status: 1, startTime: 1 }`.

### Caching Strategy
- **RevenueSnapshotProjection:** Platform revenue analytics should be pre-computed and cached in `RevenueSnapshotProjection` documents by a scheduled job (e.g., daily cron). This avoids real-time aggregation over large contract/invoice collections on every API request.
- **Risk score:** Computed on-demand per request. For organizations above 500 appointments/month, consider a 1-hour TTL cache in Redis keyed by `{organizationId}:riskScore`.
- **Doctor performance:** Compute on-demand with a short cache (5-15 minutes) for dashboard display. Heavy aggregation queries; avoid computed on every page load.

### Prometheus Integration
- System monitoring metrics are read from the Prometheus registry populated by `src/infrastructure/metrics/metrics.js`.
- Custom histograms track: HTTP request duration, queue job processing time, database operation duration.
- `/metrics` endpoint is rate-limited and returns 404 if `METRICS_ENABLED !== "true"`.
