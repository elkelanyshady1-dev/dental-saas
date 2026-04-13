
📘 DentalSaaS v3.2 — Sovereign Clinical Enterprise ERP Platform
1️⃣ Executive Vision
DentalSaaS evolves into:
A Sovereign, Event-Driven, Multi-Branch Clinical Enterprise ERP Platform
With:
Financial ERP
Workforce Governance
Inventory & Margin Intelligence
Specialty Clinical Engines
Risk & Protocol Enforcement
Corporate & Cohort Analytics
Smart Document Automation
Media & X-Ray Intelligence
Internal Communication System
Approval-Based Online Patient Portal Booking
Designed to be:
Enterprise-grade from Day One
Refactor-resistant
Contract-stable
Event-driven
Domain-isolated
Financially auditable
Multi-branch & multi-country scalable
2️⃣ Core Architectural Principles
2.1 Sovereign Patient Aggregate
Patient is the only aggregate allowed to:
Control governance state
Control branch ownership
Emit lifecycle events
Own Digital Twin projection assembly
No external domain may directly mutate Patient state.
2.2 Strict Domain Isolation
Each domain:
Owns its models
Owns its transactions
Cannot mutate foreign collections
Cross-domain communication:
Copy code

Event → Orchestrator → Subscriber → Local Action
Never:
Copy code

Domain A → Direct Write → Domain B Model
2.3 CQRS-lite Model
Write Models
Strict
Transactional
Normalized
Read Models (Projections)
Aggregated
Event-derived
Optimized for UI
Frontend must consume projections only.
3️⃣ Final Domain Structure (v3.2)
Copy code

PatientDomain
TreatmentDomain
AppointmentDomain
PortalBookingDomain
FinancialDomain
InventoryDomain
LabDomain
WorkforceDomain
TreasuryDomain
PricingDomain
InsuranceDomain
DocumentEngineDomain
MediaDomain
CommunicationDomain
ClinicalNoteDomain
RiskEngineDomain
ProtocolEngineDomain
CohortAnalyticsDomain
CorporateAnalyticsDomain
PerformanceDomain
TaskDomain
NotificationDomain
DashboardProjectionDomain
All coordination through versioned event contracts.
4️⃣ Specialty-Based Clinical Engine
Each specialty acts as a configurable engine.
Included Specialty Engines
Operative Dentistry
Endodontics
Oral Surgery (minor surgeries)
Periodontics (6-point charting, scaling recalls)
Pedodontics (deciduous dental chart)
Implantology (protocol-enforced)
Fixed & Removable Prosthodontics (lab-integrated)
Orthodontics
Dedicated Aligners Workflow Engine
Cosmetic Dentistry (whitening, veneers)
Each procedure defines:
Stages
Billing mode
Inventory usage
Lab requirement
Required media
Automation triggers
Reminder logic
No hardcoded workflows allowed.
5️⃣ Stage Execution Model
Copy code

TreatmentCase
 └── TreatmentExecution
      └── StageExecution[]
Each stage links to:
Appointment
Invoice
LabCase
InventoryTransactions
Media
Notes (including tooth-level & voice)
Stage completion emits:
Copy code

TREATMENT_STAGE_COMPLETED
6️⃣ Clinical Protocol Engine
Defines enforceable protocols.
Example:
Copy code

Implant Protocol:
- CBCT required
- Consent required
- Post-op antibiotics
- 3-month review task
System blocks stage progression if protocol incomplete.
7️⃣ Risk Engine
Automatically flags:
Hypertension + Surgery
Diabetes + Implant
Allergy + Medication
Emits:
Copy code

PATIENT_RISK_ALERT
Displayed in patient header.
8️⃣ Appointment Intelligence System
8.1 Smart Scheduling
Supports:
Custom slot duration
Smart calendar with occupied/free visualization
Doctor & room filtering
Waiting list
Conflict detection
8.2 Status State Machine
Copy code

UNCONFIRMED
CONFIRMED
RECEPTION
CHECKED_IN
IN_PROGRESS
COMPLETED
DELAYED
CANCELLED
POSTPONED
NO_SHOW
WAITING_LIST
NOTE
Tracks:
Check-in time
Doctor start time
Checkout time
Planned vs actual duration
Delay delta
9️⃣ Approval-Based Online Portal Booking
Portal booking is NOT direct appointment creation.
It is:
Copy code

Request → Review → Approve → Convert
9.1 Booking Lifecycle
Copy code

REQUESTED
APPROVED
REJECTED
EXPIRED
CONVERTED_TO_APPOINTMENT
Staff CANNOT reschedule portal requests.
If change needed:
Reject with reason
Patient rebooks
9.2 Slot Locking System
Temporary SlotLock created on selection:
Prevents double booking
Auto-expires (e.g. 5 minutes)
Revalidated on approval
9.3 Notifications
On approval:
WhatsApp
Email
Portal notification
Calendar file (.ics)
On rejection:
WhatsApp with reason
Portal message
🔟 Financial ERP Layer
10.1 Invoice Engine
Supports:
Stage billing
Manual billing
Approved quotation conversion
Multi-procedure
Discount & tax
Insurance portion
Multi-currency
Assigned doctor & branch
Printable PDF
10.2 Payment Engine
Supports:
Cash
Card
Bank
Mobile wallet
Insurance
Voucher
Foreign currency
Stores:
Base currency
Foreign currency
Exchange rate
Converted value
10.3 Deferred Revenue Accounting
For orthodontics & aligners:
Revenue recognized per stage.
Not fully recognized day one.
Corporate accounting compliant.
11️⃣ Treasury Governance
Each cashier owns:
Copy code

UserTreasury
- openingBalance
- collectedPayments[]
- transferredAmount
- closingBalance
Workflow:
Payment assigned to treasury
End-of-day reconciliation
Transfer to owner/accountant
No unassigned money allowed.
12️⃣ Inventory & Margin Intelligence
Stage completion:
Deducts stock
Logs InventoryTransaction
Attaches cost
Margin formula:
Copy code

margin = revenue - (inventoryCost + labCost)
Dashboard shows:
Margin per specialty
Margin per doctor
Profitability analytics
13️⃣ Workforce Governance
13.1 Staff Check-In
Requires:
GPS validation
WiFi fingerprint
Device trust
Shift validation
Attendance states:
Copy code

OFF_DUTY
CHECKED_IN
ON_BREAK
CHECKED_OUT
ABSENT
13.2 Salary & Incentive Engine
Supports:
Fixed salary
Percentage only
Fixed + percentage
Gross-based %
Net-based %
Procedure-specific %
Performance factors:
Attendance
Revenue
Margin
Task compliance
Utilization
Generates automated payroll reports.
14️⃣ Media & X-Ray Intelligence
14.1 X-Ray Folder Monitoring
Branch config:
Copy code

localXrayFolderPath
autoImportEnabled
System:
Detects new file
Popup: "New X-ray captured"
Assign to patient
Copy to storage
Tag metadata
14.2 Tooth-Level Notes & Voice
Supports:
Tooth-linked notes
Voice notes
Appointment-linked notes
Stage-linked notes
15️⃣ Internal Communication System
Supports:
Live chat between staff
Voice notes
Patient-linked threads
Treatment-linked threads
Branch channels
Alarm notifications
Fully auditable.
16️⃣ Smart Document & Printing Engine
Generates:
Invoices
Receipts
Quotations
Medical reports
Referral letters
Payroll reports
Treasury reports
Supports:
Arabic
English
Bilingual
Embedded X-rays
Dynamic variables
PDF export
17️⃣ Cohort & Corporate Analytics
Tracks:
Aligners retention rate
Implant follow-up completion
Orthodontic completion rate
Periodontal recall compliance
Revenue by branch
Margin by branch
Doctor performance cross-branch
Executive-level dashboards.
18️⃣ Dashboard Intelligence
Widgets include:
Daily revenue
Margin by specialty
Lab performance
Treasury balances
Payroll forecast
Attendance heatmap
Insurance receivables
Risk alerts
Protocol compliance
Portal booking analytics
X-ray import activity
Projection-driven only.
19️⃣ Implementation Phases
Phase 1 — Event Contract Stabilization
Phase 2 — Clinical Engines
Phase 3 — Lab + Inventory Automation
Phase 4 — Financial ERP Core
Phase 5 — Workforce Governance
Phase 6 — Salary & Incentive Engine
Phase 7 — Insurance & Multi-Currency
Phase 8 — Smart Documents
Phase 9 — Media & Communication
Phase 10 — Portal Booking (Approval-Based)
Phase 11 — Risk & Protocol Engine
Phase 12 — Cohort & Corporate Analytics
Phase 13 — Deferred Revenue Accounting
Phase 14 — Distributed Scaling (Message Broker + Workers)
20️⃣ Refactor Prevention Charter
Never allow:
Cross-domain direct writes
Hardcoded specialty logic
Salary inside invoices
Manual inventory mutation
Frontend-based margin calculation
Unversioned event contracts
Clinical enforcement in UI
All extensions must occur via:
New events
New subscribers
Configuration
Protocol definitions
Never via rewriting core domains.
21️⃣ Final System Positioning
DentalSaaS v3.2 is:
Clinical Workflow Engine
Financial ERP
Inventory ERP
Treasury Governance System
Workforce Intelligence Platform
Performance-Based Payroll System
Risk & Protocol Enforcement Engine
Corporate Multi-Branch Analytics Platform
Deferred Revenue Accounting System
Smart Document Automation Engine
Media & X-Ray Intelligence Platform
Internal Communication Hub
Approval-Based Online Booking System
This is not clinic software.
This is a complete enterprise healthcare operating system.



🏛 DentalSaaS Backend Migration Plan
Target Architecture: v3.2 Sovereign Clinical ERP Platform
Migration Type: Controlled Structural Refactor (Zero Downtime)
Scope: Backend Only
1️⃣ Executive Objective
Migrate current modular monolith into:
Fully domain-isolated backend
Event-driven coordination
CQRS-lite read model separation
Stage-based clinical execution engine
ERP-grade financial & treasury governance
Approval-based booking engine
Risk & protocol enforcement system
Without breaking:
Sovereign Core protections
Stripe authority
Suspension-first enforcement
JWT tenant isolation
Module runtime gating
Audit chain immutability
2️⃣ Current State Summary
Based on code and documentation:
Already Implemented
Sovereign Core boundary
orgRuntime module registry
requireModule gating
JWT-based tenant isolation
Suspension guard
EventBus infrastructure
Audit engine
Aggregate-based patient service
Basic domain folder separation
Not Yet Enforced
Strict domain isolation (no cross-domain writes)
Event contract versioning
Projection-only read model (CQRS-lite)
Clinical stage execution engine
Protocol enforcement
Risk engine
Treasury domain
Approval-based booking
Inventory auto-deduction
Margin analytics
Domain import lint enforcement
3️⃣ Migration Strategy
Migration will occur in 10 controlled phases, each preserving runtime stability.
Each phase:
Isolated refactor
No frontend breakage
Backward compatible endpoints
Tested via CI
Fails closed
🟢 PHASE 1 — Domain Isolation Enforcement
Objective
Enforce architectural law:
No domain may directly write to another domain’s models.
Actions
1.1 Domain Folder Restructuring
Standardize structure:
Copy code

/modules
  /patientDomain
  /treatmentDomain
  /appointmentDomain
  /financialDomain
  /inventoryDomain
  /labDomain
  /workforceDomain
  /treasuryDomain
  /portalBookingDomain
  /documentEngineDomain
  /riskEngineDomain
  /protocolEngineDomain
Each domain:
Owns models
Owns service layer
Emits events
Subscribes to events
Does NOT import another domain’s models
1.2 Remove Cross-Domain Model Imports
Search for:
Copy code

require("../otherDomain/model")
Replace with:
Copy code

emit event → subscriber performs local mutation
1.3 Add CI Guard
CI fails if:
Domain imports another domain model directly
🟡 PHASE 2 — CQRS-lite Implementation
Objective
Separate writes (command) from reads (projection).
2.1 Create Projection Layer
Copy code

/projections
  patient.projection.js
  appointmentCalendar.projection.js
  financialDashboard.projection.js
  risk.projection.js
2.2 Controllers Return Projections Only
Instead of returning raw Mongoose documents:
Copy code

return patientProjection.build(patientId)
Frontend must never consume raw models.
2.3 Move Derived Fields to Projection
Remove stored:
outstandingBalance
activeTreatmentCount
riskLevel (unless explicitly domain-calculated)
Compute dynamically.
🟠 PHASE 3 — Clinical Stage Execution Engine
Objective
Implement StageExecution model.
3.1 Create TreatmentDomain
Models:
Copy code

TreatmentCase
TreatmentExecution
StageExecution
Each StageExecution:
Links to appointment
Links to invoice
Links to lab case
Links to inventory transaction
Emits TREATMENT_STAGE_COMPLETED
3.2 Remove Hardcoded Workflow Logic
Replace with configuration-driven workflow.
🔴 PHASE 4 — ERP Financial Refactor
Objective
Upgrade financial system to ERP-grade.
4.1 Invoice Refactor
Invoice must support:
Multi-procedure
Stage billing
Insurance split
Multi-currency
Branch attribution
Doctor attribution
4.2 Payment Engine Refactor
Store:
Base currency
Foreign currency
Exchange rate
Converted amount
4.3 Treasury Domain Introduction
Create:
Copy code

UserTreasury
- openingBalance
- collectedPayments[]
- transferredAmount
- closingBalance
No payment allowed without treasury assignment.
🟣 PHASE 5 — Approval-Based Booking Engine
Objective
Remove direct appointment creation from portal.
5.1 PortalBookingDomain
Lifecycle:
Copy code

REQUESTED
APPROVED
REJECTED
EXPIRED
CONVERTED_TO_APPOINTMENT
5.2 SlotLock Model
Add TTL-based slot locking.
5.3 Staff Approval Required
Portal cannot create appointments directly.
🟤 PHASE 6 — Risk Engine
Automatically detect:
Hypertension + Surgery
Diabetes + Implant
Allergy + Medication
Emit:
Copy code

PATIENT_RISK_ALERT
⚫ PHASE 7 — Protocol Engine
Block stage progression if:
Required media missing
Consent missing
Required CBCT missing
Enforced in backend only.
⚪ PHASE 8 — Inventory Auto-Deduction
On stage completion:
Deduct inventory
Create InventoryTransaction
Compute margin
Copy code

margin = revenue - (inventoryCost + labCost)
🔵 PHASE 9 — Workforce Governance
Add:
Attendance state machine
Salary engine
Incentive engine
Payroll report generator
🟣 PHASE 10 — Event Contract Stabilization
Create:
Copy code

/eventContracts/v1/
All events:
Versioned
Immutable
Strict schema
Logged
No silent event mutation allowed.
4️⃣ Governance & Safety Controls
During migration:
Suspension guard remains global
requireModule untouched
Stripe webhook untouched
Audit chain untouched
No plan caching
No module override
No weakening of Sovereign Core
5️⃣ Rollout Order Recommendation
Recommended sequence:
Phase 1 – Domain Isolation
Phase 2 – CQRS-lite
Phase 3 – Clinical Stage Engine
Phase 4 – Financial ERP
Phase 5 – Booking Refactor
Remaining phases incrementally
This ensures foundation first.
6️⃣ Final Target State
After migration:
Domain-isolated architecture
Projection-only read model
Event-driven workflow orchestration
Stage-based clinical execution
ERP-compliant finance
Treasury governance
Approval-based booking
Risk & protocol enforcement
Inventory-integrated margin analytics
Refactor-resistant structure
Sovereign Core preserved
Aligned fully with v3.2 architecture .