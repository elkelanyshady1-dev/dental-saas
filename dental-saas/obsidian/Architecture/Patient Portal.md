# Patient Portal

> **Patient-facing application** — allows patients to log in, view records, book appointments, and communicate with their clinic.

## Overview
A dedicated frontend application for patients, separate from the clinic's internal UI.

## Stack
- **Backend**: `backend/src/modules/patientPortal/`
- **Frontend**: `portal/`
- Split-screen premium login design
- Tabbed auth: Password / OTP / Magic Link

## Key Features
- Patient authentication (password, OTP, magic link)
- Appointment booking
- Treatment history viewing
- Document access
- Communication with clinic

## Security
- Isolated authentication context
- Patient-scoped data access only
- See: [[Security Architecture]]

## Related
- [[Patient Domain]]
- [[Organization Plane]]

---
#architecture #portal
