# APPOINTMENT ENGINE SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.0
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/modules/appointmentDomain/appointment.controller.js`
- `backend/src/modules/appointmentDomain/services/appointment.service.js`
- `backend/src/modules/appointmentDomain/services/slot.service.js`
- `backend/src/modules/appointmentDomain/utils/overlapDetection.js`
- `backend/src/modules/appointmentDomain/utils/statusTransitions.js`
- `backend/src/routes/appointmentRoutes.js`
- `backend/src/organization/appointment/models/appointment.model.js`
- `backend/src/projections/appointment/appointment.projection.js`
- `backend/src/core/domainEvents.js`

---

## SECTION 1 — PURPOSE

The Appointment Engine manages the full lifecycle of clinic appointments. It is responsible for:

- **Slot Grid Generation:** Computing available time slots per branch/chair/dentist based on organization working hours and configured slot duration.
- **Overlap Detection:** Preventing double-booking of dentists (org-wide, cross-branch) and chairs (branch-scoped) simultaneously.
- **Status State Machine:** Enforcing legal status transitions through a defined FSM.
- **Billing Integration:** Triggering diagnostic invoice creation upon appointment completion.
- **Calendar Views:** Building multi-branch calendar day views with branch/chair/doctor grouping.

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- Appointment record lifecycle (create, read, update, cancel, complete)
- Slot grid calculation per branch/chair/dentist
- Dual overlap detection (dentist + chair conflict detection)
- Status transition state machine
- Appointment visibility scoping by RBAC (branch, role, scope)
- Calendar day view aggregation

**Receives signals from:**
- Organization appointment settings (`slotDuration`, `workingHours`) — pulled from `Organization.appointmentSettings`
- Branch and Chair models — for validating resource assignments
- Patient portal booking integration — `PATIENT_BOOKING_REQUESTED` events
- RBAC / permissionMatrix — for scoped query building

**Emits events to:**
- EventBus: `APPOINTMENT_CREATED`, `APPOINTMENT_UPDATED`, `APPOINTMENT_STATUS_CHANGED`
- BillingService: calls `createDiagnosticInvoice` on status transition to `completed`
- NotificationEngine: receives `appointment.created` → triggers "Appointment Scheduled" notification

**Does NOT own:**
- Patient record management (owned by PatientDomain)
- Invoice creation logic (delegated to BillingService)
- Inventory deduction on treatment (owned by InventoryDomain via stageDomain triggers)
- Online booking portal request management (owned by booking module)

---

## SECTION 3 — DATA MODELS

### Appointment (organization/appointment/models/appointment.model.js)
```
Appointment {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required — tenant isolation)
  branchId         ObjectId (ref: Branch, required)
  patientId        ObjectId (ref: Patient, required)
  dentistId        ObjectId (ref: User, required — treating doctor)
  chairId          ObjectId (ref: Chair, required)

  date             Date (appointment date — YYYY-MM-DD portion)
  startTime        Date (full DateTime for range queries)
  endTime          Date (computed: startTime + duration * 60000)
  duration         Number (minutes, must be multiple of slotDuration)

  status           Enum: open | checked-in | in-progress | completed | cancelled | no-show
  statusHistory    Array<{
    status      String
    changedBy   ObjectId (ref: User)
    changedAt   Date
  }>

  checkedInAt      Date | null (set when status → checked-in)
  startedAt        Date | null (set when status → in-progress)
  completedAt      Date | null (set when status → completed)
  cancelledAt      Date | null (set when status → cancelled)
  waitingDuration  Number (minutes, computed: startedAt - checkedInAt)

  notes            String

  createdAt        Date
  updatedAt        Date
}
```

### Organization Appointment Settings (embedded in Organization)
```
Organization.appointmentSettings {
  slotDuration   Number (minutes, default: 15)
  workingHours {
    start   String (HH:MM, default: "08:00")
    end     String (HH:MM, default: "20:00")
  }
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### AppointmentController (`appointment.controller.js`) — Primary CRUD Handler
- **getAvailability** — Generates a slot grid for a given date/branch/chair/dentist, marking each slot occupied or free based on active appointment queries.
- **createAppointment** — Full validation pipeline: branch access → chair validation → org settings → slot alignment → dual overlap detection → appointment create → event emit.
- **getAppointments** — Returns calendar view for a date range, scoped by RBAC (branch/doctor/chair filters supported). Pagination supported.
- **getAppointment** — Returns single appointment with RBAC visibility check.
- **updateAppointment** — Updates appointment fields. Re-validates overlap if time/dentist/chair changed. Respects completion lock on `LOCKED_FIELDS`.
- **updateAppointmentStatus** — PATCH endpoint. Enforces FSM transition validation. Sets timestamps per status. Triggers billing on completion.
- **deleteAppointment** — Soft-delete via transition to `cancelled`. Rejects if status doesn't allow cancellation.
- **getCalendarDay** — Multi-branch calendar day view. Auto-resolves branches based on user role. Returns branches + chairs + appointments grid.

### SlotService (`services/slot.service.js`)
- Generates slot grid arrays from working hours and slot duration configuration
- Pure utility — no DB mutations

### AppointmentService (`services/appointment.service.js`)
- Supporting service for complex appointment read/write operations not handled in the controller directly.

### OverlapDetection (`utils/overlapDetection.js`)
- **detectOverlaps** — Performs two independent overlap queries:
  1. Dentist overlap: checks `dentistId` appointments org-wide (cross-branch) that intersect the requested time window
  2. Chair overlap: checks `chairId` appointments within the same branch that intersect the time window
- Returns `{ hasConflict, dentist, chair }` with full appointment detail for conflict display
- `ACTIVE_STATUSES` constant defines which statuses block scheduling (non-cancelled, non-completed)

### StatusTransitions (`utils/statusTransitions.js`)
- **validateTransition** — Returns `{ valid, message, normalizedStatus }` for a given `fromStatus → toStatus` pair
- Encodes the legal FSM adjacency matrix. Invalid transitions return an error message.

### AppointmentProjection (`projections/appointment/appointment.projection.js`)
- **buildCalendarView** — Aggregation pipeline that populates patient, dentist, branch, chair references for calendar display
- **buildAppointmentView** — Full single-appointment projection with all populated fields for detail view

---

## SECTION 5 — API CONTRACTS

| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/appointments/availability` | Get slot grid for given date/branch/chair/dentist | `orgProtect` + `appointments.read` + `requireFeature("calendar")` |
| GET    | `/api/appointments/calendar` | Get calendar day view (multi-branch) | `orgProtect` + `calendar.read` + `requireFeature("calendar")` |
| GET    | `/api/appointments/` | List appointments (date range, paginated) | `orgProtect` + `appointments.read` + `requireFeature("calendar")` |
| GET    | `/api/appointments/:id` | Get single appointment detail | `orgProtect` + `appointments.read` |
| GET    | `/api/v1/organizations/branches/:id/chairs` | Get dedicated chair list for a branch | `orgProtect` + `appointments.read` |
| POST   | `/api/appointments/` | Create appointment | `orgProtect` + `appointments.create` + `requireFeature("calendar")` |
| PUT    | `/api/appointments/:id` | Update appointment fields | `orgProtect` + `appointments.update` |
| PATCH  | `/api/appointments/:id/status` | Update appointment status | `orgProtect` + `appointments.update` + `requireFeature("calendar")` |
| DELETE | `/api/appointments/:id` | Cancel appointment (soft delete) | `orgProtect` + `appointments.delete` + `requireFeature("calendar")` |

---

## SECTION 6 — SECURITY RULES

- **Multi-tenant isolation:** All appointment queries include `organizationId` injected from the JWT. Cross-org appointment access is architecturally impossible.
- **Branch access enforcement:** `branchScopeMiddleware` injects `req.allowedBranches` and `req.activeBranchId`. Appointment creation, retrieval, and availability all validate branch membership.
- **Visibility scoping:** `buildSmartQuery` + `resolvePermissions` constructs MongoDB queries scoped to the user's allowed branches. A restricted role user cannot view another branch's appointments even with a direct ID.
- **organizationId protection:** `delete req.body.organizationId` is executed in update handlers — the client cannot inject or change the org scope.
- **status field protection:** `delete req.body.status` is executed in the update handler — status can only be changed via the dedicated `/status` PATCH endpoint with FSM validation.
- **Feature gating:** `requireFeature("calendar")` middleware checks if the organization's active subscription includes the `calendar` feature flag. Orgs without this plan feature cannot access any appointment endpoints.
- **Completion lock:** Once an appointment reaches `completed` status, the fields `startTime`, `endTime`, `duration`, `dentistId`, `chairId`, `branchId`, `date` are locked against modification.

---

## SECTION 7 — EVENTS

| Event | When Emitted | Consumers |
|-------|-------------|-----------|
| `appointment.created` | New appointment created | NotificationEngine ("Appointment Scheduled"), PatientDomain subscriber |
| `appointment.updated` (APPOINTMENT_UPDATED) | Appointment fields updated | Audit log |
| `APPOINTMENT_STATUS_CHANGED` | Status transition completed | Audit log, notification engine (for key transitions) |
| `appointment.completed` | Status reached `completed` | BillingService.createDiagnosticInvoice (fire-and-forget) |

---

## SECTION 8 — INVARIANTS

- `startTime` must align with the org's `slotDuration` grid (startTime offset from workingHours.start must be divisible by slotDuration).
- `duration` must be a positive multiple of `slotDuration`.
- `endTime` is always computed server-side as `startTime + duration * 60000`. Never trusted from client.
- `startTime` and `endTime` must fall within the organization's `workingHours` window.
- A dentist cannot have two active appointments overlapping in time across any branch.
- A chair cannot have two active appointments overlapping in time within its branch.
- Completed appointments cannot have `startTime`, `endTime`, `duration`, `dentistId`, `chairId`, `branchId`, or `date` modified.
- Status transitions must follow the legal FSM. No direct jump from `open` to `completed` without passing through intervening states.
- `organizationId` on an appointment must always match the authenticated user's `organizationId`.
- `chairId` must belong to the same `branchId` and `organizationId` as the appointment.
- **Chair Provisioning:** Branches must have at least one valid Treatment Chair. Legacy branches missing chairs are auto-provisioned with "Treatment Chair 1" during branch update operations (Self-Healing).
- Billing trigger (`createDiagnosticInvoice`) is fire-and-forget — it must not block the status update response.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Missing required fields | 400 | Required fields: branchId, patientId, dentistId, chairId, date, startTime, duration |
| Duration not multiple of slotDuration | 400 | Duration must be a multiple of N minutes |
| startTime outside working hours | 400 | Appointment must be within working hours |
| startTime not on slot grid | 400 | Start time must align with N-minute slot grid |
| Dentist/chair conflict detected | 409 | Scheduling conflict detected (with conflict details) |
| Branch not found or access denied | 403/404 | Branch not found / Branch access denied |
| Chair not found in branch | 404 | Chair not found in this branch |
| Appointment not found | 404 | Appointment not found |
| Invalid status transition | 400 | \<FSM transition error message\> |
| Editing locked fields on completed appt | 400 | Cannot modify \<fields\> on a completed appointment |
| Feature not enabled | 403 | Feature not available on your plan |
| Multi-branch access denied | 403 | Multi-branch view not permitted for your role |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

### Indexes (Required on Appointment collection)
- `{ organizationId: 1, startTime: 1, endTime: 1 }` — Primary overlap detection query
- `{ organizationId: 1, dentistId: 1, startTime: 1, endTime: 1 }` — Dentist-specific overlap and calendar queries
- `{ organizationId: 1, branchId: 1, chairId: 1, startTime: 1, endTime: 1 }` — Chair overlap detection
- `{ organizationId: 1, status: 1 }` — Status filtering on list
- `{ organizationId: 1, patientId: 1 }` — Patient appointment history
- `{ organizationId: 1, branchId: 1, startTime: 1 }` — Calendar day view by branch

### Query Patterns
- **Overlap detection:** Two parallel queries per scheduling operation (dentist + chair). Each uses bounded date range filters.
- **Calendar day view:** Fan-out to multiple branches in a single aggregation. `$in: selectedBranches` on branchId.
- **Availability grid:** Two parallel queries (dentistAppointments + chairAppointments) then pure in-memory slot generation — no N+1 queries.

### Performance Notes
- `limit` on list endpoint is capped at 200 to prevent unbounded result sets.
- `buildCalendarView` uses a MongoDB aggregation pipeline with `$lookup` for patient/dentist/branch/chair population — recommend compound index on `organizationId + branchId + startTime` for this aggregation.
- For organizations with high appointment volume (>10,000/month), consider index coverage analysis to ensure all calendar queries are index-bound.
