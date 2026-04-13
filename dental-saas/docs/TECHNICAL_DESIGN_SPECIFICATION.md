# Technical Design Specification (TDS) — DentalSaaS v9.1

> [!IMPORTANT]
> This document serves as the authoritative single-source-of-truth for the DentalSaaS v9.1 architecture. It is designed for engineers, investors, and enterprise compliance audits.

---

## 📑 Table of Contents
1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Installation & Setup](#installation-setup)
5. [Core Packages & Tools](#core-packages-tools)
6. [Architecture & Patterns](#architecture-patterns)
7. [Development Guidelines](#development-guidelines)
8. [Key Features](#key-features)
9. [Routing & Navigation](#routing-navigation)
10. [State Management](#state-management)
11. [Styling & Theming](#styling-theming)
12. [i18n Internationalization](#i18n-internationalization)
13. [API Integration](#api-integration)
14. [Common Workflows](#common-workflows)
15. [Best Practices](#best-practices)
16. [Troubleshooting](#troubleshooting)

---

## <a name="project-overview"></a>1. Project Overview
DentalSaaS is a sovereign multi-tenant Clinical ERP designed for the dental industry. The system enforces strict isolation between organizations while maintaining a centralized platform governance layer.

### System Hierarchy
- **Platform Layer**: Supreme authority governing subscription lifecycles, organization provisioning, and global revenue analytics.
- **Organization Layer**: Sovereign tenant-scoped environment for clinic operations (Patients, Appointments, Billing).
- **Portal**: Patient-facing interface for online booking and financial transparency.

### Sovereign Safeguards
- **Tenant Isolation**: Strictly enforced via JWT-derived `organizationId`. Subdomain fallbacks are prohibited.
- **Branch Context (v4.2)**: Mandatory `X-Branch-Id` for all mutations to ensure forensic traceability and branch-level data scoping.
- **Financial Integrity**: Minor-unit precision (integers) for all financial calculations, preventing floating-point errors.
- **Boot-Time Guard**: `SovereignGuard` terminates the process if architectural invariants or registry hashes are violated.

---

## <a name="tech-stack"></a>2. Tech Stack
### Backend
- **Runtime**: Node.js (CommonJS)
- **Framework**: Express 5.2.1
- **Database**: MongoDB with Mongoose 9.2.1 (ODM)
- **Queuing**: BullMQ for background jobs
- **Caching/Locks**: ioredis (Redis)
- **Validation**: Zod for schema reinforcement
- **Real-time**: Socket.io 4.8.3

### Frontend
- **Framework**: React 19.2 (Vite-powered)
- **Styling**: Tailwind CSS & Vanilla CSS (Hardened Design System)
- **Routing**: React Router 7.13
- **Data Fetching**: Axios with interceptors
- **Tables**: TanStack Table v8

### Quality & Performance
- **Testing**: Jest (Backend), Vitest/Playwright (Frontend)
- **Logging**: Pino / Pino-pretty for structured production logs
- **Rendering**: Puppeteer for PDF document generation

---

## <a name="project-structure"></a>3. Project Structure
```text
dental-saas/
├── backend/
│   ├── src/
│   │   ├── modules/           # Isolated Domain aggregates
│   │   ├── projections/       # CQRS-lite Read Models
│   │   ├── eventContracts/    # Versioned event schemas (v3.1)
│   │   ├── core/              # SovereignGuard & Domain Events
│   │   ├── orgRuntime/        # Module registry & runtime gating
│   │   ├── middleware/        # Runtime Sovereignty Guards (SLA, sub, module)
│   │   ├── infrastructure/    # Database & Redis connection management
│   ├── scripts/               # CI/CD and Sovereignty Check scripts
├── frontend/
│   ├── src/
│   │   ├── org/               # Organization-scoped domain logic
│   │   ├── platform/          # Platform-scoped admin logic
│   │   ├── modules/           # Shareable domain UI features
│   │   ├── design-system/     # Hardened UI components
│   │   ├── services/          # API clients (scoped by domain)
├── docs/                      # Architectural & Technical documentation
├── scripts/                   # Root-level automation
```

---

## <a name="installation-setup"></a>4. Installation & Setup
1. **Prerequisites**: Node.js v18+, Redis, MongoDB.
2. **Environment**: Copy `.env.example` to `.env` in `backend/` and `frontend/`.
3. **Registry Hash**: generate `MODULE_REGISTRY_HASH` for production boot safety.
4. **Commands**:
   - `npm install` (Root, backend, frontend)
   - `npm run dev` (Backend/Frontend separately)
   - `npm run seed:permissions` (Initial RBAC setup)

---

## <a name="core-packages-tools"></a>5. Core Packages & Tools
- **Mongoose**: 100% adherence to schema invariants.
- **Speakeasy/otplib**: TOTP implementation for Superadmin 2FA.
- **Speakeasy**: Cryptographic secret management for audit chains.
- **Crypto**: AES-256-GCM encryption for stored TOTP secrets.

---

## <a name="architecture-patterns"></a>6. Architecture & Patterns
### Domain Isolation Enforcement
- **SINGULAR AUTHORITY**: Each domain owns its aggregates. Cross-domain writes are blocked.
- **Event-Driven**: Domains communicate via versioned events defined in `schemaRegistry.js`.

### CQRS-lite Projection Layer
- **Read Models**: Complex views are materialized in the `projections/` layer.
- **Decontamination**: Controllers never use `.populate()`. Instead, they call projection builders to get DTOs.

### Modular Runtime Gating
- **ModuleRegistry**: A frozen, static map of available modules.
- **moduleGuard**: Middleware that consults the registry and organization plan to allow/block access.

### Sovereignty Guards
- **SubscriptionGuard**: Enforces trial, grace periods, and manual suspensions.
- **BranchOperationalGuard**: Restricts access based on current branch operational status.

---

## <a name="development-guidelines"></a>7. Development Guidelines
- **Naming Conventions**: 
    - Filenames: `camelCase` for utilities, `domain.routes.js` for routes.
    - Models: `PascalCase`.
- **Isolation Rules**: No `require()` of models from other domains. Use projections or events.
- **DTO Typing**: All public API responses must return explicit DTOs defined in projections.

---

## <a name="key-features"></a>8. Key Features
- **Patient Domain**: Multi-branch associations, clinical record versioning, international phone engine.
- **Appointment Domain**: Dynamic slot engine, timezone-aware scheduling, approval workflows.
- **Financial Engine (v8/v9)**: Unifying Billing (B2C) and Revenue (B2B). Unconditional minor-unit precision.
- **Support Engine (v9.1)**: Hardened ticketing system with idempotent Stripe refund integration.
- **Inventory Domain**: Stock level tracking and supply chain management.
- **Clinical Protocol Domain**: Versioned treatment protocols and diagnostic templates.
- **Production Layer**: Aligner Production and Orthodontic extension (Phase 4).
- **Platform Governance**: Superadmin 2FA, IP anomaly detection, and tamper-evident audit chains.

**Not Implemented Yet (As of v9.1):**
- Workforce Payroll
- Risk Engine
- Treasury
- Portal B2B features

---

## <a name="routing-navigation"></a>9. Routing & Navigation
- **Platform Routes**: `/platform/*` (Protected by `platformProtect`).
- **Organization Routes**: `/org/*` (Protected by `orgProtect` + `organizationContext`).
- **Suspension Handling**: Global redirect to `/suspended` if `subscriptionGuard` detects expiration.

---

## <a name="state-management"></a>10. State Management
- **Auth State**: In-memory token storage (volatile), Refresh token rotation (HttpOnly cookie).
- **Module State**: Cached in `organizationContext` to minimize DB lookups.
- **Branch State**: Persisted in `activeBranchId` context across requests.

---

## <a name="styling-theming"></a>11. Styling & Theming
- **Design System**: Floating glass containers, dark mode defaults, HSL-tailored color palettes.
- **Theming**: CSS variables for organization-specific branding.

---

## <a name="i18n-internationalization"></a>12. i18n Internationalization
- **Backend**: Errors localized via response formatters.
- **Frontend**: i18next with multi-namespace loading (Arabic/English).

---

## <a name="api-integration"></a>13. API Integration
- **Structure**: Scoped clients per domain in `frontend/src/services`.
- **Headers**: Mandatory `Authorization: Bearer <token>` and `X-Branch-Id`.
- **Gating**: API returns 403 `MODULE_NOT_ENABLED` if the runtime guard fails.

---

## <a name="common-workflows"></a>14. Common Workflows
- **Refund Approval**: Ticket -> Balance Check -> Stripe Idempotency -> OAV Ledger Update -> Audit Log.
- **Booking Flow**: Patient -> Dynamic Slot Generation -> Organization Approval -> Appointment Creation.

---

## <a name="best-practices"></a>15. Best Practices
- **Security**: Never trust client-supplied IDs. Always derive from JWT.
- **Performance**: Use projections to avoid deep population.
- **Integrity**: Always run `npm run check:sovereignty` before pushing.

---

## <a name="troubleshooting"></a>16. Troubleshooting
- **Boot Failures**: Check `MODULE_REGISTRY_HASH` environment variable.
- **Mutation Denied**: Verify `X-Branch-Id` header is present.
- **Plan Mismatch**: Ensure `seedModuleFeatures.js` was executed.
