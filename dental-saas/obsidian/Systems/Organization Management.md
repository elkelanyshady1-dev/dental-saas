# Organization Management

> **Full lifecycle management** of dental clinics — from provisioning through suspension and archival.

## Lifecycle States
```
Provisioning → Active → Suspended → Archived
```

## Key Features
- Database provisioning per organization
- ISO country persistence with backfill migration
- Administrative contact subdocuments
- CRM integration (notes, tags, tasks)
- WhatsApp / Call communication for org leads

## Governance
- Transactional atomicity (MongoDB sessions)
- Sovereign lifecycle controls (archival/soft-delete)
- Session revocation capabilities
- Contract termination workflows

## Related
- [[Platform Plane]]
- [[Database Isolation]]
- [[Billing Engine]]

---
#platform #organizations #governance
