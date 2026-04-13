
🦷 TECHNICAL DESIGN SPECIFICATION (TDS)
System: Aligner Workflow Management System (AWMS)
1. OVERVIEW
1.1 Purpose
Design and implement a multi-actor aligner workflow system that coordinates:
Patient journey
Orthodontist clinical workflow
Lab production pipeline
Ensuring:
Traceability
Real-time updates
Seamless communication
Automated state transitions
1.2 System Architecture

Frontend (React)
   ├── Patient Portal
   ├── Doctor Dashboard
   ├── Lab Dashboard

Backend (Node.js + Express)
   ├── Workflow Engine
   ├── Case Management Service
   ├── Notification Service
   ├── File Processing Service

Database (MongoDB / Firestore)
   ├── Patients
   ├── Cases
   ├── Stages
   ├── Aligners
   ├── Logs
   ├── Files

Storage
   ├── X-rays / STL / Photos
2. CORE CONCEPT: CASE WORKFLOW ENGINE
2.1 Workflow States (Global)

DRAFT
→ SUBMITTED
→ UNDER_REVIEW
→ APPROVED
→ IN_PRODUCTION
→ QUALITY_CHECK
→ SHIPPED
→ IN_TREATMENT
→ COMPLETED
2.2 Workflow Ownership
Stage
Owner
Draft
Orthodontist
Review
Lab + Ortho
Production
Lab
Treatment
Patient + Ortho
3. PATIENT WORKFLOW (PLANE 1)
3.1 Patient Journey

Registration
→ Case Created
→ Scans Uploaded
→ Treatment Plan Approved
→ Aligners Received
→ Wearing Aligners (Stages)
→ Progress Tracking
→ Refinement (Optional)
→ Completion
3.2 Patient Features
3.2.1 Dashboard
Current aligner stage
Progress % (e.g., Stage 5/20)
Next change date
Notifications
3.2.2 Aligner Tracking

Aligner {
  stageNumber: number
  startDate: Date
  endDate: Date
  status: "pending" | "active" | "completed"
}
3.2.3 Compliance Tracking
Daily wear logging
Missed hours alerts
AI reminders (WhatsApp/SMS)
3.2.4 Uploads
Progress photos
Issues (pain, breakage)
3.2.5 Refinement Trigger
Triggered when:
Poor tracking
Doctor request
Patient complaint
4. ORTHODONTIST WORKFLOW (PLANE 2)
4.1 Case Lifecycle

Create Case
→ Upload Records
→ Submit to Lab
→ Review Setup
→ Approve / Request Changes
→ Monitor Treatment
→ Request Refinement
→ Close Case
4.2 Case Creation
Input Data:

Patient Info
Diagnosis
Treatment Plan
Attachments:
  - STL
  - X-rays
  - Photos
4.3 Treatment Planning
Tooth movement planning
Attachments placement
IPR planning
Staging simulation
4.4 Approval Flow

Lab Setup → Ortho Review → 
   [Approve] → Production
   [Reject] → Revision Loop
4.5 Clinical Monitoring
Track patient compliance
Compare expected vs actual movement
Trigger refinement
4.6 Snapshot Logging System
Every visit creates:

Snapshot {
  visitId
  changes: [
    "Rebonded UR5",
    "Loss of anchorage",
    "IPR performed"
  ]
  notes
  attachments
  timestamp
}
4.7 Visit Management
Each visit includes:
Status (Completed / No-show)
Duration
Doctor
Next appointment
Logs
5. LAB WORKFLOW (PLANE 3)
5.1 Lab Pipeline

Case Received
→ Validation
→ Digital Setup
→ Internal QC
→ Send to Ortho
→ Approved
→ Manufacturing
→ Packaging
→ Shipping
5.2 Digital Setup
3D tooth movement simulation
Stage breakdown generation
Attachment design
5.3 QC Validation
Checks:
Movement limits
Collision detection
Biological constraints
5.4 Production

For each stage:
   Generate model
   3D print
   Thermoform aligner
   Trim & polish
5.5 Packaging
Group aligners by stages
Label with:
Case ID
Stage number
Patient name
5.6 Shipping

Shipment {
  trackingId
  courier
  status
  estimatedDelivery
}
6. DATA MODEL
6.1 Case Schema
JavaScript
const Case = {
  id: String,
  patientId: String,
  doctorId: String,
  status: String,
  stages: Number,
  currentStage: Number,
  createdAt: Date,
  updatedAt: Date
};
6.2 Workflow Log
JavaScript
const WorkflowLog = {
  caseId: String,
  action: String,
  performedBy: String,
  role: "PATIENT" | "ORTHO" | "LAB",
  timestamp: Date,
  metadata: Object
};
6.3 File Model
JavaScript
const File = {
  caseId: String,
  type: "STL" | "XRAY" | "PHOTO",
  url: String,
  uploadedBy: String,
  createdAt: Date
};
7. STATE MACHINE (CRITICAL)
7.1 Transition Rules

DRAFT → SUBMITTED
SUBMITTED → UNDER_REVIEW
UNDER_REVIEW → APPROVED | REJECTED
APPROVED → IN_PRODUCTION
IN_PRODUCTION → QUALITY_CHECK
QUALITY_CHECK → SHIPPED
SHIPPED → IN_TREATMENT
IN_TREATMENT → COMPLETED
7.2 Guard Conditions
Cannot move to production without approval
Cannot start treatment without shipment
Refinement creates new sub-case
8. NOTIFICATIONS SYSTEM
8.1 Triggers
Event
Recipient
Case Submitted
Lab
Setup Ready
Orthodontist
Approved
Lab
Shipped
Patient + Ortho
Stage Change
Patient
Missed Wear
Patient
8.2 Channels
WhatsApp (Twilio)
Email
In-app notifications
9. INTEGRATIONS
3D Viewer (STL) → WebGL / Three.js
WhatsApp API → Twilio
Storage → Firebase / AWS S3
Queue System (Recommended) → Redis (BullMQ)
10. PERFORMANCE & SCALABILITY
Use queue-based processing for:
STL rendering
Simulation generation
Notifications
Use event-driven architecture
11. SECURITY
JWT authentication
Role-based access:

PATIENT
ORTHO
LAB
ADMIN
File access control (signed URLs)
12. FUTURE EXTENSIONS
AI treatment prediction
Auto staging optimization
Smart compliance scoring
Real-time 3D simulation updates
✅ SUMMARY
This system creates a synchronized 3-plane workflow:
Plane
Focus
Patient
Compliance + tracking
Orthodontist
Clinical decisions
Lab
Manufacturing
All connected through:
Workflow engine
State machine
Event-driven architecture
