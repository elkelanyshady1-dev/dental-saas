# Event System

> **Asynchronous event-driven architecture** — BullMQ for reliable queuing, event bus for internal communication, Handlebars for email templating.

## Components

### Event Bus
- **Library**: `eventemitter3`
- Internal pub/sub for decoupling business logic from side effects
- Used for: audit events, notification triggers, cache invalidation

### BullMQ Job Queues
- Reliable background job processing
- Retry with exponential backoff
- **Audit Log Queue**: `audit-queue` (Sequential per-org, `concurrency: 1`) for high-integrity forensics.
- Financial retry queues with priority ordering
- Scheduled tasks and monitoring

### Email System
- **Transport**: Nodemailer (SMTP)
- **Templates**: Handlebars (logic-less, safe variable injection)
- **Email Types**:
  - Magic Login Link
  - Password Reset
  - Billing notifications
  - Appointment reminders

## Architecture
```
Business Logic → Event Bus → Listener → BullMQ Queue → Worker → Side Effect
                                                              ↳ Email
                                                              ↳ Notification
                                                              ↳ Audit Log
```

## Related
- [[Billing Engine]]
- [[Security Architecture]]

---
#events #async #email
