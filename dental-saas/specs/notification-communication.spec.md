# NOTIFICATION & COMMUNICATION DOMAIN SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.0
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/modules/notificationDomain/notification.model.js`
- `backend/src/modules/notificationDomain/notification.service.js`
- `backend/src/modules/notificationDomain/notification.subscriptions.js`
- `backend/src/modules/notificationDomain/notification.queue.js`
- `backend/src/modules/notificationDomain/notification.worker.js`
- `backend/src/modules/notificationDomain/notification.controller.js`
- `backend/src/modules/notificationDomain/notification.routes.js`
- `backend/src/modules/communicationDomain/` (derived from directory structure)
- `backend/src/platform/models/EmailEvent.model.js`
- `backend/src/platform/models/EmailTemplate.model.js`
- `backend/src/platform/models/CommunicationMetrics.model.js`
- `backend/src/platform/models/CommunicationRetryLog.model.js`
- `backend/src/infrastructure/queues/emailQueue.js`
- `backend/src/infrastructure/queues/channelQueues.js`
- `backend/src/infrastructure/workers/emailWorker.js`
- `backend/src/infrastructure/workers/smsWorker.js`
- `backend/src/email/engine/renderTemplate.js`
- `backend/src/core/domainEvents.js`

---

## SECTION 1 — PURPOSE

This domain covers two tightly integrated but distinct subsystems:

### 1. Notification Domain (In-App)
Delivers real-time, in-app notifications to Organization Plane users when significant domain events occur. Examples: a new patient was added, an appointment was scheduled, an invoice is overdue, or a security alert was triggered.

### 2. Communication Domain (External Channels)
Delivers external messages to end-users via email (SMTP/Nodemailer), SMS, and WhatsApp. Powers transactional communications: magic login links, password reset emails, invoice PDFs, booking confirmations, and platform onboarding messages.

Both systems share a common pattern of event-driven, queue-backed, non-blocking delivery.

---

## SECTION 2 — DOMAIN BOUNDARY

### Notification Domain
**Owns:**
- In-app `Notification` records (org-scoped, user-scoped)
- Notification queuing (BullMQ notification queue)
- Notification read/unread state management
- Notification event subscriptions (listens to domain events → enqueues notifications)

**Receives signals from:**
- EventBus: `patient.created`, `appointment.created`, `patient.booking.requested`, `invoice.overdue`, `security.alert`, `org.logo.updated`

**Emits events to:**
- Frontend WebSocket or polling endpoint for real-time notification badge counts (Derived from code structure)

**Does NOT own:**
- Email, SMS, or WhatsApp delivery (Communication Domain)
- Platform-level notifications (separate `PlatformNotification` model)

### Communication Domain
**Owns:**
- Email rendering (Handlebars templates → HTML)
- Email queue management (BullMQ emailQueue)
- SMS queue management (BullMQ smsQueue)
- WhatsApp queue management (BullMQ whatsappQueue)
- Dead-letter queue (emailDLQ) for failed email retry
- Communication metrics (delivery rates, retry logs)
- Exponential backoff retry policy

**Receives signals from:**
- Authentication domain: magic link, password reset, OTP events
- Billing Engine: invoice, refund events
- NotificationDomain: when external communication needed alongside in-app alert

**Emits events to:**
- EventBus: `communication.queued`, `communication.sent`, `communication.failed`

**Does NOT own:**
- SMS/WhatsApp provider credentials rotation (platform-level configuration)
- Email template content management UI (platform admin feature)

---

## SECTION 3 — DATA MODELS

### Notification (org-plane)
```
Notification {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required — tenant isolation)
  userId           ObjectId (ref: User, default: null — null = org-wide)
  type             String (required — semantic type e.g. "PATIENT_CREATED", "SECURITY_ALERT")
  title            String (required, maxlength: 200)
  message          String (required, maxlength: 1000)
  entityType       String (domain entity type e.g. "PATIENT", "APPOINTMENT", "INVOICE")
  entityId         ObjectId (ref to the entity)
  metadata         Object (arbitrary payload; RBAC role restrictions stored here)
  priority         Enum: low | normal | high (default: normal)
  isRead           Boolean (default: false)
  isDeleted        Boolean (default: false — soft delete only)
  createdAt        Date
}
```

### PlatformNotification (platform-plane)
```
PlatformNotification {
  _id              ObjectId
  type             String
  title            String
  message          String
  targetRole       Enum: superadmin | finance_admin | operations_admin | analyst | null
  isRead           Boolean (default: false)
  createdAt        Date
}
```

### EmailEvent (platform-plane audit)
```
EmailEvent {
  _id              ObjectId
  organizationId   ObjectId | null (null for platform emails)
  templateName     String
  recipient        String (email address)
  status           Enum: queued | sent | failed | bounced
  jobId            String (BullMQ job ID)
  errorMessage     String | null
  sentAt           Date | null
  createdAt        Date
}
```

### EmailTemplate (platform-plane)
```
EmailTemplate {
  _id              ObjectId
  name             String (required, unique — template key e.g. "magicLink")
  subject          String
  handlebarsSource String (Handlebars template source)
  variables        Array<String> (declared variable names)
  isActive         Boolean
  updatedBy        ObjectId (ref: PlatformUser)
  updatedAt        Date
}
```

### CommunicationMetrics
```
CommunicationMetrics {
  _id              ObjectId
  organizationId   ObjectId
  channel          Enum: email | sms | whatsapp
  period           String (YYYY-MM — monthly aggregation)
  sent             Number
  failed           Number
  delivered        Number
  bounced          Number
  createdAt        Date
}
```

### CommunicationRetryLog
```
CommunicationRetryLog {
  _id              ObjectId
  organizationId   ObjectId
  channel          Enum: email | sms | whatsapp
  jobId            String
  attemptNumber    Number
  error            String
  nextRetryAt      Date | null
  resolvedAt       Date | null
  createdAt        Date
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### NotificationService (`notification.service.js`)
- **enqueueNotification** — Validates payload, pushes job to BullMQ notification queue. Does NOT write DB directly — worker writes DB.
- **markAsRead** — Sets `isRead = true` for a specific notification (user-scoped).
- **markAllAsRead** — Bulk mark all unread notifications for a user/org as read.
- **deleteNotification** — Soft-deletes a notification (`isDeleted = true`).
- **getUnreadCount** — Aggregation to count unread notifications per user/org.
- **listNotifications** — Paginated list of non-deleted notifications filtered by user and org.

### NotificationQueue (`notification.queue.js`)
- BullMQ queue instance for notification jobs
- Configures retry policy (exponential backoff, max attempts)

### NotificationWorker (`notification.worker.js`)
- Processes notification jobs from the queue
- Creates the `Notification` DB record
- Handles errors gracefully (logs, moves to DLQ if max retries exceeded)

### NotificationSubscriptions (`notification.subscriptions.js`)
- Registers all eventBus listeners at server boot (called once in `app.js`)
- Each subscription maps a domain event to a `enqueueNotification` call
- Uses `safeHandler` wrapper — subscription errors never crash the process
- Subscriptions registered:
  - `patient.created` → PATIENT_CREATED notification
  - `appointment.created` → APPOINTMENT_BOOKED notification
  - `patient.booking.requested` → BOOKING_REQUESTED notification
  - `invoice.overdue` → INVOICE_OVERDUE notification (high priority, role-restricted)
  - `security.alert` → SECURITY_ALERT notification (high priority, admin-only)
  - `org.logo.updated` → ORG_LOGO_UPDATED notification (low priority)

### Email Engine (`email/engine/renderTemplate.js`)
- **renderTemplate(templateName, variables)** — Compiles Handlebars template with provided variables
- Templates stored as `.hbs` files in `src/templates/`
- Current templates: `magicLink`, `passwordReset`, `invoiceEmail`, `refundEmail`, `ticketReply`, `otp`

### EmailWorker (`infrastructure/workers/emailWorker.js`)
- Processes `emailQueue` jobs
- Renders template via `renderTemplate()`
- Sends via Nodemailer (SMTP or SES or Ethereal for dev)
- Records `EmailEvent` on success or failure
- Applies exponential backoff retry: on failure, re-queues with delay

### SMSWorker (`infrastructure/workers/smsWorker.js`)
- Processes `smsQueue` jobs
- Dispatches via configured SMS provider adapter
- Records delivery status

### CommunicationDomain Usage Service (`communicationDomain/services/usage.service.js`)
- Tracks communication channel usage metrics for billing or rate-limit enforcement

---

## SECTION 5 — API CONTRACTS

### Notification Routes (`/api/v1/org/notifications` — Derived from code structure)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/notifications` | List notifications for authenticated user | `orgProtect` |
| GET    | `/notifications/unread-count` | Get unread count | `orgProtect` |
| PATCH  | `/notifications/:id/read` | Mark notification as read | `orgProtect` |
| PATCH  | `/notifications/read-all` | Mark all as read | `orgProtect` |
| DELETE | `/notifications/:id` | Soft-delete notification | `orgProtect` |

### Platform Communication Routes (`/api/platform/communication/` — Derived from code structure)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/communication/metrics` | Delivery metrics overview | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |
| GET  | `/communication/retry-logs` | Failed communication retry logs | `platformProtect` + `VIEW_AUDIT_LOGS` |

### Admin Debug Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/admin/debug/email` | Send test email directly via Nodemailer (bypasses queue) | None (dev only) |
| GET  | `/admin/test-queue` | Enqueue test email job | `platformProtect` + `superAdminOnly` |
| GET  | `/admin/queue-health` | Get queue job counts across all queues | `platformProtect` + `superAdminOnly` |
| GET  | `/admin/queues` | BullBoard real-time queue dashboard | superadmin only (separate auth) |

---

## SECTION 6 — SECURITY RULES

- **Org isolation:** Notifications are always scoped to `organizationId`. A user from org A can never see notifications from org B.
- **User scoping:** Notifications can be user-scoped (`userId` set) or org-wide (`userId = null`). User-scoped notifications are only returned to the matching `userId`.
- **Role-based metadata filtering:** `metadata.allowedRoles` on a notification specifies which roles may view it. For example, `INVOICE_OVERDUE` is restricted to `["admin", "receptionist", "accountant"]`. Clients MUST filter by `capabilities.includes()` — never `capabilities[key]`.
- **Soft delete only:** Notifications are never hard-deleted. `isDeleted: true` is the only delete mechanism. This preserves audit history.
- **Event handler isolation:** Each `safeHandler` in `notification.subscriptions.js` wraps the async handler in try/catch. A failing notification subscription can never crash the server process or affect the domain operation that emitted the event.
- **Email body injection:** Handlebars templates are logic-less with safe variable injection. No `{{{ triple-stache }}}` pattern is permitted (raw HTML escaped to prevent XSS in email clients).
- **Stripe webhook raw body:** For email on payment events, Stripe webhook signature is validated before any email is triggered.

---

## SECTION 7 — EVENTS

### Events Consumed by NotificationDomain
| Event | Source Domain | Notification Generated |
|-------|--------------|----------------------|
| `patient.created` | PatientDomain | "New Patient Added" |
| `appointment.created` | AppointmentDomain | "Appointment Scheduled" |
| `patient.booking.requested` | PatientDomain/BookingModule | "New Booking Request" |
| `invoice.overdue` | BillingEngine | "Invoice Overdue" (high priority) |
| `security.alert` | Auth/SecurityLayer | "Security Alert" (high priority, admin) |
| `org.logo.updated` | OrganizationDomain | "Organization Logo Updated" (low) |

### Events Emitted by CommunicationDomain
| Event | When | Consumers |
|-------|------|-----------|
| `communication.queued` | Job added to queue | Audit log, metrics |
| `communication.sent` | Email/SMS delivered successfully | Audit log, CommunicationMetrics update |
| `communication.failed` | Delivery failed after retries | CommunicationRetryLog, platform alert |

### Email Events Consumed
| Event | Trigger | Template Used |
|-------|---------|---------------|
| `email.magic_link` | Platform user login with magic link | `magicLink.hbs` |
| `email.password_reset` | Org or platform password reset request | `passwordReset.hbs` |
| `email.otp` | OTP login flow | `otp.hbs` |
| `email.invoice` | Invoice generated or payment confirmed | `invoiceEmail.hbs` |
| `email.refund` | Refund processed | `refundEmail.hbs` |
| `email.ticket_reply` | Support ticket reply (Derived from code structure) | `ticketReply.hbs` |

---

## SECTION 8 — INVARIANTS

- Notification handlers (`safeHandler`) must never `throw` to the caller — errors are caught and logged only.
- `organizationId` on every Notification must come from the event payload — never from client input.
- Notifications are soft-deleted only; hard deletion is prohibited.
- The `enqueueNotification` function must never create a DB record directly — it only enqueues a job. The worker creates the record.
- Email templates are rendered with Handlebars safe escaping — never raw HTML interpolation.
- Every email job must produce an `EmailEvent` record on both success and failure paths.
- Dead-letter queue (`emailDLQ`) receives jobs that have exhausted all retry attempts, preserving traceability.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | Behavior | Recovery |
|-----------|----------|---------|
| EventBus handler error | Caught by `safeHandler`, logged, event discarded | Manual review of logs |
| Queue enqueue failure (Redis down) | `enqueueNotification` throws, caller may retry | Redis health check, graceful degradation |
| Worker processing failure | BullMQ retry policy with exponential backoff (up to max attempts) | Auto-retry; DLQ on exhaustion |
| SMTP delivery failure | EmailWorker records failure in `EmailEvent`, re-queues with backoff | Auto-retry; `communication.failed` event emitted |
| Template missing | `renderTemplate` throws, email job fails | Fix template registry, reprocess from DLQ |
| Notification recipient not found | Worker skips silently, logs warning | No action needed (org or user may have been deleted) |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

### Indexes (Notification)
- `{ organizationId: 1, createdAt: -1 }` — Primary listing: most recent first per org
- `{ organizationId: 1, userId: 1, isRead: 1 }` — Unread count + user-scoped filtering
- `{ organizationId: 1 }` — Org-wide notification queries

### Queue Configuration
| Queue | Workers | Retry Policy |
|-------|---------|-------------|
| `emailQueue` | 1+ concurrent email workers | Exponential backoff (3-5 attempts) |
| `smsQueue` | 1+ sms workers | Exponential backoff |
| `whatsappQueue` | 1+ whatsapp workers | Exponential backoff |
| `notificationQueue` | 1 notification worker | Fixed retry (2-3 attempts) |
| `emailDLQ` | Manual processing / alerting | No auto-retry |

### Redis Dependency
- BullMQ requires Redis. All queue operations (enqueue, dequeue, retry scheduling) depend on Redis availability.
- Redis connection pooling managed by `src/infrastructure/redis/redisClient.js`.
- If Redis is unavailable, queue operations fail loudly — `safeHandler` prevents this from crashing domain operations, but notifications/emails are dropped until Redis recovers.

### Email Rendering
- Handlebars templates are compiled once and cached. Template re-compilation only occurs if `EmailTemplate` is updated in the database.
- For organizations generating high invoice volumes (e.g., 1000+ invoices/month), email queue throughput requires adequate Redis memory and worker concurrency configuration.
