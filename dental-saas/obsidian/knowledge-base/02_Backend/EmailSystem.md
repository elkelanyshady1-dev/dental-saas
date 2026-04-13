# Email System

## Purpose
Non-blocking, template-driven email delivery via BullMQ queues.

## Architecture
```
Business Logic → eventBus.emit("email:send", payload)
  ↓
Email Listener → enqueues to BullMQ email queue
  ↓
Email Worker → renders Handlebars template → sends via Nodemailer
  ↓
SMTP Provider (configurable)
```

## Template Engine
- **Handlebars** templates with safe variable injection
- Logic-less — no executable code in templates
- Directory: `backend/src/email/templates/`

## Transactional Emails
| Template | Trigger |
|----------|---------|
| Magic Login | OTP/magic link request |
| Password Reset | Password reset flow |
| Welcome | Organization provisioning |
| Invoice | Invoice generation |
| Subscription Alert | Trial expiry, limit warnings |

## Queue Configuration
- Queue name: `email`
- Retry policy: exponential backoff (3 attempts)
- Dead letter queue for failed deliveries

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/email/` | Templates and rendering |
| `backend/src/jobs/` | BullMQ worker definitions |
| `backend/src/listeners/` | Event-to-email mapping |

## Dependencies
- [[EventDrivenArchitecture]] — Event bus triggers
- [[EventSystem]] — BullMQ infrastructure

## Status
**ACTIVE**

---
#email #bullmq #templates #notifications
