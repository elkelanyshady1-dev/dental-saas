# Organization Plane

> The **clinic-level operational plane** — where dental professionals manage patients, appointments, treatments, and finances.

## Overview
Each organization (dental clinic) gets its own isolated database and operates within its own security boundary. The Organization Plane handles all day-to-day clinical operations.

## Database Isolation
- **Mode**: `per-org` (each org gets a dedicated MongoDB database)
- **Connection**: Resolved via `req.dbConnection`
- **Model Access**: `getModel(req.dbConnection, schema)` — never global `mongoose.model()`
- See: [[Database Isolation]]

## Key Domains

### Patient Domain
- **Location**: `backend/src/modules/patientDomain/`
- Patient records, demographics, medical history
- See: [[Patient Domain]]

### Appointment Domain
- **Location**: `backend/src/modules/appointmentDomain/`
- Scheduling, calendar, booking management
- See: [[Appointment Domain]]

### Treatment Domain
- **Location**: `backend/src/modules/treatments/`, `backend/src/modules/procedures/`
- Treatment planning, procedure tracking, clinical protocols
- See: [[Treatment Domain]]

### Orthodontic Domain
- **Location**: `backend/src/modules/orthodonticDomain/`
- Case management, STL file processing, staging
- See: [[Orthodontic Domain]]

### Finance Domain
- **Location**: `backend/src/modules/financeDomain/`, `backend/src/modules/financialDomain/`
- Clinic-level invoicing, payments, insurance claims
- See: [[Finance Domain]]

### Communication Domain
- **Location**: `backend/src/modules/communicationDomain/`
- WhatsApp, SMS, email notifications

### Inventory Domain
- **Location**: `backend/src/modules/inventoryDomain/`
- Clinical supplies and materials tracking

## Security Model
- Organization-level RBAC (roles: admin, dentist, assistant, receptionist)
- PBAC policies for field-level access control
- RLS as defense-in-depth layer
- See: [[Security Architecture]]

## Related
- [[Platform Plane]]
- [[Patient Portal]]
- [[Supervisor Plane]]

---
#architecture #organization
