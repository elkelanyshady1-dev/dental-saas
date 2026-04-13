# Appointment Domain

> Scheduling, calendar management, and booking workflows.

## Location
- **Backend**: `backend/src/modules/appointmentDomain/`
- **Booking**: `backend/src/modules/booking/`

## Key Features
- Appointment scheduling and calendar (multi-branch)
- Online booking (patient-facing)
- Availability management
- **Branch Chair Synchronization**: Dedicated `/chairs` API for consistent UI selection.
- **Self-Healing Provisioning**: Mandatory "Treatment Chair" auto-creation for legacy branches during updates.
- Automatic reminders (via [[Event System]])

## Related
- [[Patient Domain]]
- [[Patient Portal]]
- [[Organization Plane]]

---
#clinical #appointments
