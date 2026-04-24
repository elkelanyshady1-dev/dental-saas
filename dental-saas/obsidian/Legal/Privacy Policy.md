# 📄 Privacy Policy 

## 1. Overview

**System Name:** Orthonoe Platform  
**Version:** v2.0 (Medicolegal Compliance)  
**Effective Date:** [Insert Date]

Orthonoe ("we", "our", "the platform") provides dental and orthodontic practice management software. This Privacy Policy explains how we collect, process, store, and retain data, including sensitive patient medical records.

---

## 2. Scope

This policy applies to:

- Clinics and Organizations using Orthonoe
- Authorized Users (Dentists, Assistants, Secretaries)
- Patients (data entered by clinics)
- Website visitors

---

## 3. Data Categories

### 3.1 User Data (Clinic Staff)

- Full name
- Email address
- Phone number
- Role and permissions
- Authentication data (hashed passwords, tokens)
- Activity logs

### 3.2 Patient Data (Medical Records)

- Personal information (name, date of birth, contact details)
- Medical and dental history
- Treatment records and dental chart
- Imaging (X-rays, scans, files)
- Financial records (invoices, payments)

### 3.3 Technical Data

- Audit logs
- API logs
- Device and session metadata

---

## 4. Data Collection

Data is collected through:

- Direct user input
- System-generated logs
- Integrated third-party services

---

## 5. Purpose of Processing

We process data to:

- Manage patients and treatments
- Schedule appointments and send reminders
- Handle billing and financial tracking
- Maintain system security and auditing
- Improve system performance

---

## 6. Data Retention Policy

### 6.1 Retention Model

Orthonoe separates:

1. **Account Lifecycle (subscription-based)**
2. **Medical Record Retention (legal requirement)**

---

### 6.2 Trial Period (30 Days)

- Each organization receives a **30-day free trial**
- Full access to all features
- Data is stored normally

After trial expiry:

- Account status → **SUSPENDED**
- Access → Restricted or locked
- **No data deletion occurs**

---

### 6.3 Subscription Expiry

- Account status → **ARCHIVED / INACTIVE**
- Access → Disabled or read-only
- Data remains securely stored

---

### 6.4 Medicolegal Retention (Primary Rule)

All patient medical and dental records are retained for:

**Minimum: 7 years from the date of last patient treatment**

Special cases:

- Minors → retained until legal adulthood + additional retention period
- Legal disputes → retained until case resolution

---

### 6.5 Data Deletion Policy

Orthonoe does **NOT delete patient data based on subscription status**.

Permanent deletion occurs only when:

- Legal retention period has expired, AND
- No legal or regulatory obligations remain

---

### 6.6 Data Archiving

- Expired accounts are moved to secure archive storage
- Archived data may be encrypted and access-restricted
- Clinics may request:
    - Data export
    - Account reactivation

---

### 6.7 Backups

Encrypted backups are maintained:

- Daily backups → retained for 7 days
- Weekly backups → retained for 4 weeks
- Monthly backups → retained for 3 months

---

## 7. Data Security

Orthonoe applies industry-standard protections:

- Encryption in transit (HTTPS/TLS)
- Encryption at rest
- Role-Based Access Control (RBAC)
- Audit logging of sensitive actions
- Secure authentication mechanisms

---

## 8. Data Sharing

We do **not sell or trade data**.

Data may be shared only with trusted providers:

- – messaging services
- – hosting and backend services

Or when required by law.

---

## 9. User Rights

Authorized users can:

- Access and review data
- Export records
- Correct inaccurate data
- Request deletion (subject to legal retention rules)

---

## 10. Data Isolation

- Each clinic’s data is logically isolated
- Enforced using organization-level access control

---

## 11. Cookies & Tracking

We use minimal cookies for:

- Authentication sessions
- Performance monitoring

---

## 12. Compliance

Orthonoe is designed to align with:

- GDPR principles
- International best practices for handling medical data

---

## 13. Data Deletion Process (Technical)

Deletion follows a controlled lifecycle:

1. Soft delete (flagged with `deletedAt`)
2. Retention validation (`legalRetentionUntil`)
3. Scheduled purge (background job removes all data permanently)

---

## 14. Policy Updates

- Users will be notified of major changes
- Continued use of Orthonoe implies acceptance

---