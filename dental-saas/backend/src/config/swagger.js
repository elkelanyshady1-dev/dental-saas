const swaggerJsdoc = require("swagger-jsdoc");

const options = {
    definition: {
        openapi: "3.0.0",

        info: {
            title: "DentalSaaS Platform API",
            version: "20.2.0",
            description: [
                "Enterprise Multi-Tenant SaaS API \u2014 Hybrid Contract Architecture (Sprint 7).",
                "",
                "Commercial Architecture:  PlanTemplate \u2192 PlanVersion \u2192 OrgContract \u2192 PlatformInvoice \u2192 RevenueSchedule",
                "",
                "Billing Engine:  contractRenewal \u2192 dunningProcessor \u2192 gracePeriod \u2192 revenueRecognition",
                "",
                "Platform Capabilities:  VIEW_ORGANIZATIONS, MANAGE_ORGANIZATIONS,",
                "MANAGE_SUBSCRIPTIONS, VIEW_AUDIT_LOGS, VIEW_PLATFORM_ANALYTICS,",
                "MANAGE_PLATFORM_USERS, MANAGE_PLATFORM_SETTINGS",
                "",
                "Plane Isolation:",
                "  /api/v1/platform/* \u2014 Platform Control Plane (PlatformUser auth)",
                "  /api/v1/*          \u2014 Organization Plane (OrgUser auth)"
            ].join("\n"),
        },

        servers: [
            {
                url: process.env.BASE_URL || "http://localhost:5000/api/v1",
                description: "Development Server"
            },
        ],

        tags: [
            { name: "Authentication", description: "Platform auth & session management" },
            { name: "Platform", description: "Platform control plane \u2014 organization governance" },
            { name: "Contracts", description: "OrgContract lifecycle: create, activate, replace, terminate, renew" },
            { name: "Billing", description: "Billing settings, dunning configuration, legacy billing overview" },
            { name: "Platform Billing", description: "PlatformInvoice management, dunning, grace period, renewal dashboard" },
            { name: "Platform Refunds", description: "Refund lifecycle: request, approve/reject, process. Strict state machine." },
            { name: "Platform Revenue", description: "Manual payments, payment links, revenue controls" },
            { name: "Plans", description: "PlanTemplate & PlanVersion catalog management" },
            { name: "Analytics", description: "Platform revenue and growth analytics" },
            { name: "Organization", description: "Organization-level operational endpoints" },
            { name: "Governance", description: "Platform governance engine and audit logs" },
            { name: "Finance", description: "Revenue recognition, deferred revenue schedules, FX exchange rates" },
            { name: "Platform Contracts", description: "Contract renewal controls, dashboard, document management, auto-renew" },
            { name: "Patients", description: "Patient domain — CRUD, search, soft delete, branch isolation" },
            { name: "Appointments", description: "Appointment engine — scheduling, FSM transitions, overlap detection, calendar" },
            { name: "Procedures", description: "Procedure catalog — clinic-specific dental procedure definitions" },
            { name: "Treatments", description: "Treatment records + treatment plans — FSM status tracking" },
            { name: "Patient Invoices", description: "Patient billing — invoice creation, voiding, status tracking" },
            { name: "Patient Payments", description: "Patient payment recording — auto-allocation, ledger entries" },
            { name: "OrthodonticCases", description: "Orthodontic case management — lifecycle, malocclusion, treatment planning" },
            { name: "Scans", description: "3D scan file management — STL, PLY, DICOM upload and processing" },
            { name: "AIAnalysis", description: "AI analysis pipeline — tooth segmentation, cephalometric analysis" },
            { name: "AlignerPlans", description: "Aligner treatment planning — stage movements, IPR, attachments" },
            { name: "PortalAuth", description: "Patient portal authentication — password, magic link, OTP" },
            { name: "PortalProgress", description: "Patient aligner stage progress tracking" },
            { name: "PortalPhotos", description: "Patient photo upload and AI analysis" },
            { name: "PortalMonitoring", description: "Remote monitoring sessions — patient submission and doctor review" },
            { name: "PortalMessages", description: "Patient-doctor messaging system" },
            { name: "Features Control", description: "Features & Modules Control Center — module states, feature decisions, permissions matrix, conflict detection, auth simulation" },
        ],

        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },

            schemas: {

                /* ============================================================ */
                /* Standard Response Contracts                                  */
                /* ============================================================ */

                ApiResponse: {
                    type: "object",
                    required: ["success"],
                    properties: {
                        success: { type: "boolean", example: true },
                        data: { type: "object", nullable: true },
                        meta: { type: "object", nullable: true },
                        message: { type: "string", nullable: true },
                        error: { type: "object", nullable: true }
                    }
                },

                ErrorResponse: {
                    type: "object",
                    required: ["success", "error"],
                    properties: {
                        success: { type: "boolean", example: false },
                        data: { type: "object", nullable: true, example: null },
                        error: {
                            type: "object",
                            properties: {
                                code: { type: "string", example: "INVALID_CREDENTIALS" },
                                message: { type: "string", example: "Invalid email or password" }
                            }
                        }
                    }
                },

                PaginatedResponse: {
                    type: "object",
                    required: ["success", "data"],
                    properties: {
                        success: { type: "boolean", example: true },
                        data: {
                            type: "array",
                            items: { type: "object" }
                        },
                        pagination: {
                            type: "object",
                            properties: {
                                page: { type: "integer", example: 1 },
                                limit: { type: "integer", example: 20 },
                                total: { type: "integer", example: 100 },
                                totalPages: { type: "integer", example: 5 }
                            }
                        },
                        error: { type: "object", nullable: true }
                    }
                },

                /* ============================================================ */
                /* Core Domain Models                                           */
                /* ============================================================ */

                OrgOrganization: {
                    type: "object",
                    description: "Tenant organization record. Commercial data is sourced from OrgContract (currentContractId).",
                    properties: {
                        _id: { type: "string", example: "64a1f..." },
                        name: { type: "string", example: "Cairo Dental Clinic" },
                        slug: { type: "string", example: "cairo-dental" },
                        country: {
                            type: "string",
                            description: "ISO 3166-1 alpha-2 country code \u2014 never a display name",
                            enum: ["EG", "SA", "AE", "KW", "QA", "BH", "OM", "MA", "JO", "GB", "DE", "FR", "IT", "ES", "NL", "PL", "US", "CA"],
                            example: "EG"
                        },
                        regionCode: {
                            type: "string",
                            enum: ["MEA", "EU", "US", "APAC"],
                            example: "MEA"
                        },
                        status: {
                            type: "string",
                            description: "Runtime subscription status. Commercial source of truth is OrgContract.",
                            enum: ["trial", "active", "suspended", "expired", "canceled", "past_due"],
                            example: "active"
                        },
                        currentContractId: {
                            type: "string",
                            nullable: true,
                            description: "ObjectId of the active OrgContract \u2014 authoritative commercial reference."
                        },
                        trialStartDate: { type: "string", format: "date-time", nullable: true },
                        trialEndDate: { type: "string", format: "date-time", nullable: true },
                        trialConsumed: { type: "boolean", example: false },
                        isArchived: { type: "boolean", example: false },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                User: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        roleId: { type: "string" },
                        organizationId: { type: "string" },
                        isActive: { type: "boolean" },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                Patient: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        phone: { type: "string" },
                        organizationId: { type: "string" },
                        branchId: { type: "string" },
                        isActive: { type: "boolean" },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                /* ============================================================ */
                /* Commercial Domain \u2014 Hybrid Billing Architecture               */
                /* PlanTemplate \u2192 PlanVersion \u2192 OrgContract \u2192 PlatformInvoice   */
                /* ============================================================ */

                PricingRegion: {
                    type: "object",
                    description: "Regional pricing block. ISO country codes and ISO currency code only \u2014 never display names.",
                    required: ["regionCode", "currency", "monthly"],
                    properties: {
                        regionCode: {
                            type: "string",
                            enum: ["MEA", "EU", "US", "APAC"],
                            example: "MEA"
                        },
                        countries: {
                            type: "array",
                            items: { type: "string", description: "ISO 3166-1 alpha-2" },
                            example: ["EG", "SA", "AE"]
                        },
                        currency: { type: "string", description: "ISO 4217 currency code", example: "USD" },
                        monthly: { type: "number", example: 79 },
                        yearly: { type: "number", example: 799 },
                        biennial: { type: "number", example: 1518 }
                    }
                },

                PlanTemplate: {
                    type: "object",
                    description: "Immutable commercial product definition. 'published' templates cannot be modified.",
                    required: ["code", "name"],
                    properties: {
                        _id: { type: "string" },
                        code: { type: "string", example: "growth" },
                        name: { type: "string", example: "Growth" },
                        description: { type: "string", example: "Multi-branch clinic, up to 10 users" },
                        status: {
                            type: "string",
                            enum: ["draft", "published", "archived"],
                            example: "published"
                        },
                        trialDays: { type: "integer", example: 14 },
                        limits: {
                            type: "object",
                            properties: {
                                maxUsers: { type: "integer", example: 10 },
                                maxBranches: { type: "integer", example: 3 }
                            }
                        },
                        modules: {
                            type: "object",
                            description: "Feature entitlement map (key=module, value=boolean or config object)",
                            additionalProperties: true
                        },
                        pricing: {
                            type: "object",
                            properties: {
                                baseCurrency: { type: "string", example: "USD" },
                                regions: {
                                    type: "array",
                                    items: { "$ref": "#/components/schemas/PricingRegion" }
                                }
                            }
                        },
                        createdBy: { type: "string" },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                PlanVersion: {
                    type: "object",
                    description: "Immutable snapshot of a PlanTemplate at a point in time. Referenced by OrgContract.",
                    required: ["templateCode", "versionTag"],
                    properties: {
                        _id: { type: "string" },
                        templateId: { type: "string", description: "PlanTemplate ObjectId" },
                        templateCode: { type: "string", example: "growth" },
                        versionTag: { type: "string", example: "v1" },
                        versionNumber: { type: "integer", example: 1 },
                        status: {
                            type: "string",
                            enum: ["draft", "active", "deprecated"],
                            example: "active"
                        },
                        limits: { type: "object", properties: { maxUsers: { type: "integer" }, maxBranches: { type: "integer" } } },
                        modules: { type: "object", additionalProperties: true },
                        pricing: { type: "object", additionalProperties: true },
                        changeNotes: { type: "string" },
                        activatedAt: { type: "string", format: "date-time", nullable: true },
                        createdBy: { type: "string" },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                OrgContract: {
                    type: "object",
                    description: "Commercial agreement \u2014 single source of truth for price, currency, discount, credit. Immutable once active.",
                    required: ["organizationId", "planCode", "lockedPrice", "currency", "effectiveFrom"],
                    properties: {
                        _id: { type: "string" },
                        organizationId: { type: "string" },
                        planVersionId: { type: "string", nullable: true },
                        planCode: { type: "string", example: "growth" },
                        planVersionTag: { type: "string", example: "v1" },
                        contractStatus: {
                            type: "string",
                            enum: ["draft", "pending_signature", "pending_payment", "scheduled",
                                "active", "superseded", "terminated", "expired", "canceled"],
                            example: "active"
                        },
                        lockedPrice: { type: "number", example: 79, description: "Contracted price \u2014 immutable once active" },
                        currency: { type: "string", description: "ISO 4217", example: "USD" },
                        effectiveFrom: { type: "string", format: "date-time", description: "Contract start date" },
                        effectiveTo: { type: "string", format: "date-time", nullable: true, description: "Contract end date (null = open-ended)" },
                        billingInterval: {
                            type: "string",
                            enum: ["monthly", "yearly", "biennial"],
                            example: "monthly",
                            description: "Billing cadence locked at contract creation"
                        },
                        trialDays: { type: "integer", example: 0 },
                        autoRenew: { type: "boolean", example: true, description: "If false, contract expires at effectiveTo without renewal" },
                        salesManaged: { type: "boolean", example: false, description: "If true, renewal generates invoice-only (no auto-charge); sales team follows up" },
                        gracePeriodDays: { type: "integer", example: 7 },
                        creditBalance: { type: "number", example: 0 },
                        dunning: {
                            nullable: true,
                            "$ref": "#/components/schemas/DunningState"
                        },
                        renewalTerms: {
                            type: "object",
                            properties: {
                                inflationPercent: { type: "number", example: 0 },
                                autoRenew: { type: "boolean" },
                                billingInterval: {
                                    type: "string",
                                    enum: ["monthly", "yearly", "biennial"],
                                    example: "monthly"
                                }
                            }
                        },
                        pricingOverride: {
                            type: "object",
                            nullable: true,
                            properties: {
                                isCustom: { type: "boolean" },
                                lockedPrice: { type: "number" },
                                reason: { type: "string" }
                            }
                        },
                        appliedCoupon: {
                            type: "object",
                            nullable: true,
                            properties: {
                                code: { type: "string" },
                                discountType: { type: "string", enum: ["percentage", "fixed"] },
                                discountValue: { type: "number" },
                                validUntil: { type: "string", format: "date-time", nullable: true },
                                maxUses: { type: "integer", nullable: true },
                                usedCount: { type: "integer" }
                            }
                        },
                        previousContractId: { type: "string", nullable: true },
                        replacedByContractId: { type: "string", nullable: true },
                        createdBy: { type: "string" },
                        activatedBy: { type: "string", nullable: true },
                        terminatedBy: { type: "string", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                InvoiceLineItem: {
                    type: "object",
                    required: ["description", "unitPrice", "unitPriceMinor", "total", "totalMinor", "type"],
                    properties: {
                        description: { type: "string", example: "growth \u2014 monthly plan" },
                        quantity: { type: "integer", example: 1 },
                        unitPrice: { type: "number", example: 79 },
                        unitPriceMinor: { type: "integer", example: 7900 },
                        total: { type: "number", example: 79 },
                        totalMinor: { type: "integer", example: 7900 },
                        type: {
                            type: "string",
                            enum: ["plan", "addon", "overage", "discount", "credit", "tax", "adjustment"],
                            example: "plan"
                        }
                    }
                },

                PlatformInvoice: {
                    type: "object",
                    description: "SaaS subscription invoice. ALL amounts derived from OrgContract \u2014 never from Organization.subscription.*",
                    required: ["organizationId", "contractId", "currency", "totalAmount"],
                    properties: {
                        _id: { type: "string" },
                        organizationId: { type: "string" },
                        contractId: { type: "string" },
                        planVersionId: { type: "string", nullable: true },
                        invoiceType: {
                            type: "string",
                            enum: ["subscription", "initial", "addon", "credit_note", "adjustment", "dunning"],
                            example: "subscription"
                        },
                        billingCycleStart: { type: "string", format: "date-time" },
                        billingCycleEnd: { type: "string", format: "date-time" },
                        dueDate: { type: "string", format: "date-time" },
                        currency: { type: "string", description: "ISO 4217", example: "USD" },
                        basePlanAmount: { type: "number", example: 79 },
                        basePlanAmountMinor: { type: "integer", example: 7900 },
                        couponCode: { type: "string", nullable: true },
                        couponDiscountAmount: { type: "number", example: 0 },
                        couponDiscountAmountMinor: { type: "integer", example: 0 },
                        creditApplied: { type: "number", example: 0 },
                        creditAppliedMinor: { type: "integer", example: 0 },
                        subtotalAmount: { type: "number", example: 79 },
                        subtotalAmountMinor: { type: "integer", example: 7900 },
                        taxPercent: { type: "number", example: 14 },
                        taxAmount: { type: "number", example: 11.06 },
                        taxAmountMinor: { type: "integer", example: 1106 },
                        totalAmount: { type: "number", example: 90.06 },
                        totalAmountMinor: { type: "integer", example: 9006 },
                        status: {
                            type: "string",
                            enum: ["draft", "open", "paid", "void", "uncollectible"],
                            example: "open"
                        },
                        paymentStatus: {
                            type: "string",
                            enum: ["pending", "authorized", "captured", "failed", "refunded", "partially_refunded", "disputed"],
                            example: "pending"
                        },
                        paymentProvider: {
                            type: "string",
                            enum: ["stripe", "paymob", "paypal", "manual"],
                            nullable: true
                        },
                        providerPaymentId: { type: "string", nullable: true },
                        paidAt: { type: "string", format: "date-time", nullable: true },
                        retryCount: { type: "integer", example: 0 },
                        maxRetries: { type: "integer", example: 3 },
                        nextRetryAt: { type: "string", format: "date-time", nullable: true },
                        lastRetryAt: { type: "string", format: "date-time", nullable: true },
                        failureReason: { type: "string", nullable: true },
                        idempotencyKey: { type: "string", nullable: true },
                        recognizedRevenue: { type: "number", default: 0, description: "Revenue recognized to date (updated by monthly recognition job)" },
                        deferredRevenue: { type: "number", default: 0, description: "Revenue not yet recognized = totalAmount - recognizedRevenue" },
                        refundedAmountMinor: { type: "integer", default: 0, description: "Total refunded in minor currency units. Updated atomically on each refund completion." },
                        regionCode: {
                            type: "string",
                            enum: ["MEA", "EU", "US", "APAC"],
                            nullable: true
                        },
                        lineItems: {
                            type: "array",
                            items: { "$ref": "#/components/schemas/InvoiceLineItem" }
                        },
                        createdBy: { type: "string", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                PaymentMetadata: {
                    type: "object",
                    description: "Payment recording request body for POST /invoices/:id/pay",
                    required: ["paymentMethod"],
                    properties: {
                        paymentMethod: {
                            type: "string",
                            enum: ["stripe", "paymob", "paypal", "cash", "bank_transfer", "pos", "manual"],
                            example: "cash",
                            description: "Manual methods (cash, bank_transfer, pos) require paymentMetadata object. Provider methods confirmed via webhook."
                        },
                        paymentMetadata: {
                            type: "object",
                            description: "Required for manual payment methods",
                            properties: {
                                reference: { type: "string", example: "REC-2026-001" },
                                notes: { type: "string", example: "Received by finance team" },
                                receivedAt: { type: "string", format: "date-time" }
                            }
                        },
                        providerPaymentId: {
                            type: "string",
                            nullable: true,
                            description: "Provider payment reference (Stripe PI, Paymob order ID, etc.)"
                        }
                    }
                },

                /* ============================================================ */
                /* Sprint 7 Billing Lifecycle Models                           */
                /* ============================================================ */

                DunningState: {
                    type: "object",
                    nullable: true,
                    description: "Active dunning state embedded on OrgContract. Null when no dunning cycle is active.",
                    properties: {
                        retryCount: { type: "integer", example: 1, description: "Number of charge attempts made in this dunning cycle" },
                        nextRetryAt: { type: "string", format: "date-time", nullable: true, description: "When to attempt next charge (from retryScheduleDays[retryCount])" },
                        gracePeriodEndsAt: { type: "string", format: "date-time", nullable: true, description: "Deadline — org suspended if payment not received by this date" },
                        suspendedAt: { type: "string", format: "date-time", nullable: true, description: "When org was auto-suspended (null if not suspended)" },
                        lastFailureReason: { type: "string", nullable: true, example: "provider_declined" }
                    }
                },

                BillingSettings: {
                    type: "object",
                    description: "Singleton platform-wide billing configuration. Controls dunning schedule, grace period, and multi-currency reporting.",
                    properties: {
                        _id: { type: "string" },
                        retryScheduleDays: {
                            type: "array",
                            items: { type: "integer" },
                            example: [1, 3, 5],
                            description: "Days after initial failure to retry charge (index = retryCount)"
                        },
                        gracePeriodDays: { type: "integer", example: 7, description: "Days after effectiveTo before org is auto-suspended if payment not received" },
                        maxRetries: { type: "integer", example: 3, description: "Maximum number of charge retry attempts before marking as exhausted" },
                        baseReportingCurrency: {
                            type: "string",
                            description: "ISO 4217 currency code used for normalized revenue reporting across all contracts",
                            example: "USD"
                        },
                        exchangeRateSource: {
                            type: "string",
                            enum: ["manual", "external_api"],
                            example: "manual",
                            description: "manual = rates entered via admin API; external_api = fetched from provider"
                        },
                        // ── Refund Policy ─────────────────────────────────────────────────────
                        refundWindowDays: { type: "integer", example: 30, description: "Days after invoice payment during which a refund can be requested" },
                        allowAfterRecognition: { type: "boolean", example: true, description: "If false, refunds are blocked once revenue recognition begins" },
                        requireManualApproval: { type: "boolean", example: false, description: "Force manual approval on every refund regardless of amount" },
                        largeRefundThreshold: { type: "number", example: 1000, description: "Refunds above this decimal amount require superadmin approval" },
                        largeRefundRatioPct: { type: "number", example: 50, description: "If refund > this % of contract value, manual override required" },
                        maxRefundsPerOrg: { type: "integer", example: 3, description: "Max refunds per org within maxRefundsPerOrgDays before fraud flag" },
                        maxRefundsPerOrgDays: { type: "integer", example: 30, description: "Velocity window (days) for fraud detection" },
                        version: { type: "integer", example: 1 },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                BillingAuditLog: {
                    type: "object",
                    description: "Append-only billing lifecycle event ledger. Immutable — no updates or deletes.",
                    properties: {
                        _id: { type: "string" },
                        organizationId: { type: "string" },
                        contractId: { type: "string", nullable: true },
                        invoiceId: { type: "string", nullable: true },
                        eventType: {
                            type: "string",
                            enum: [
                                "CONTRACT_CREATED", "CONTRACT_ACTIVATED", "CONTRACT_RENEWED",
                                "CONTRACT_SUPERSEDED", "CONTRACT_TERMINATED", "CONTRACT_CANCELED",
                                "CONTRACT_EXPIRED", "AUTO_RENEW_UPDATED",
                                "PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "PAYMENT_REFUNDED",
                                "REFUND_REQUESTED", "REFUND_APPROVED", "REFUND_REJECTED",
                                "REFUND_PROCESSED", "REFUND_FAILED",
                                "DUNNING_STARTED", "RETRY_ATTEMPT", "DUNNING_EXHAUSTED", "DUNNING_RECOVERED",
                                "GRACE_STARTED", "GRACE_EXPIRED",
                                "ORG_SUSPENDED", "ORG_REACTIVATED",
                                "REVENUE_RECOGNIZED", "DEFERRED_REVENUE_UPDATED"
                            ]
                        },
                        previousState: { type: "object", nullable: true, description: "State snapshot before the event" },
                        newState: { type: "object", nullable: true, description: "State snapshot after the event" },
                        performedBy: { type: "string", example: "system", description: "\"system\", \"webhook\", or a PlatformUser._id" },
                        metadata: {
                            type: "object",
                            nullable: true,
                            description: "Arbitrary event context. Common keys: refundId, amountMinor, reasonCode, fraudFlag, requiresApproval, providerRefundId, stage.",
                            properties: {
                                refundId: { type: "string", description: "RefundExecutionRecord._id — present on all refund events" },
                                amountMinor: { type: "integer", description: "Refund or payment amount in minor units" },
                                reasonCode: { type: "string" },
                                fraudFlag: { type: "boolean", description: "True when velocity guard triggered" },
                                requiresApproval: { type: "boolean" },
                                providerRefundId: { type: "string" },
                                isFullRefund: { type: "boolean" },
                                exchangeRateUsed: { type: "number" }
                            },
                            additionalProperties: true
                        },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                RevenueSchedule: {
                    type: "object",
                    description: "Accrual-basis revenue recognition schedule. Created when a PlatformInvoice is paid. Amortized monthly. Exchange rate locked at creation — never recomputed.",
                    properties: {
                        _id: { type: "string" },
                        organizationId: { type: "string" },
                        contractId: { type: "string" },
                        invoiceId: { type: "string", description: "Unique \u2014 one schedule per invoice" },
                        currency: { type: "string", description: "ISO 4217 original invoice currency", example: "EGP" },
                        originalCurrency: { type: "string", description: "Alias of currency field for query clarity", example: "EGP" },
                        totalAmount: { type: "number", example: 2460, description: "Full invoice amount in original currency" },
                        recognizedAmount: { type: "number", example: 0, description: "Cumulative recognized revenue (original currency)" },
                        deferredAmount: { type: "number", example: 2460, description: "Remaining deferred (original currency) = totalAmount - recognizedAmount" },
                        recognitionFrequency: { type: "string", enum: ["monthly"], example: "monthly" },
                        startDate: { type: "string", format: "date-time", description: "Billing cycle start" },
                        endDate: { type: "string", format: "date-time", description: "Billing cycle end" },
                        totalPeriods: { type: "integer", example: 1, description: "Number of monthly recognition periods" },
                        amountPerPeriod: { type: "number", example: 2460, description: "Original amount per period = totalAmount / totalPeriods" },
                        periodsRecognized: { type: "integer", example: 0 },
                        lastRecognitionDate: { type: "string", format: "date-time", nullable: true },
                        status: {
                            type: "string",
                            enum: ["active", "fully_recognized", "void"],
                            example: "active"
                        },
                        normalizedCurrency: { type: "string", description: "ISO 4217 base reporting currency (from BillingSettings.baseReportingCurrency)", example: "USD" },
                        exchangeRate: { type: "number", example: 0.032, description: "Rate locked at creation: 1 originalCurrency = exchangeRate normalizedCurrency. Never recomputed." },
                        normalizedTotalAmount: { type: "number", example: 78.72, description: "totalAmount * exchangeRate" },
                        normalizedRecognizedAmount: { type: "number", example: 0, description: "Cumulative recognized in base currency" },
                        normalizedDeferredAmount: { type: "number", example: 78.72, description: "Remaining deferred in base currency" },
                        normalizedAmountPerPeriod: { type: "number", example: 78.72, description: "normalizedTotalAmount / totalPeriods" },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" }
                    }
                },

                ExchangeRate: {
                    type: "object",
                    description: "Historical FX rate. Append-only. Locked at RevenueSchedule creation — never recomputed. Manual overrides take priority over auto-sync rates.",
                    properties: {
                        _id: { type: "string" },
                        fromCurrency: { type: "string", description: "ISO 4217 source currency", example: "EGP" },
                        toCurrency: { type: "string", description: "ISO 4217 target currency", example: "USD" },
                        rate: { type: "number", example: 0.032, description: "1 fromCurrency = rate toCurrency" },
                        effectiveDate: { type: "string", format: "date-time", example: "2026-03-01T00:00:00Z", description: "Rate applicable from this date. Resolution: most recent manual override, then most recent auto rate, on or before recognition date." },
                        source: {
                            type: "string",
                            enum: ["auto", "manual"],
                            example: "manual",
                            description: "auto = inserted by fxSync.job.js; manual = entered via POST /finance/exchange-rate"
                        },
                        isOverride: {
                            type: "boolean",
                            example: false,
                            description: "true = manually entered override; false = auto-synced. Manual overrides take priority in FX resolution."
                        },
                        createdBy: { type: "string", example: "system", description: "PlatformUser._id or 'system'" },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                RefundExecutionRecord: {
                    type: "object",
                    description: "Tracks a refund request through the strict state machine lifecycle. Idempotent by idempotencyKey and providerRefundId.",
                    properties: {
                        _id: { type: "string" },
                        organizationId: { type: "string" },
                        invoiceId: { type: "string", description: "PlatformInvoice reference" },
                        contractId: { type: "string", nullable: true },
                        ticketId: { type: "string", nullable: true, description: "Support ticket reference (optional)" },
                        regionCode: { type: "string", example: "EG" },
                        amountMinor: { type: "integer", example: 25000, description: "Refund amount in minor currency units (cents)" },
                        status: {
                            type: "string",
                            enum: [
                                "refund_requested",
                                "refund_under_review",
                                "refund_approved",
                                "refund_rejected",
                                "refund_processing",
                                "refund_completed",
                                "refund_failed"
                            ],
                            description: "All transitions enforced by refundStateMachine.js"
                        },
                        reasonCode: { type: "string", nullable: true, example: "customer_request" },
                        requestedBy: { type: "string", nullable: true, description: "PlatformUser._id or system" },
                        approvedBy: { type: "string", nullable: true },
                        processedBy: { type: "string", nullable: true },
                        providerRefundId: { type: "string", nullable: true, description: "e.g. Stripe re_xxx" },
                        providerChargeId: { type: "string", nullable: true, description: "e.g. Stripe pi_xxx" },
                        idempotencyKey: { type: "string", nullable: true, description: "Unique idempotency key — prevents duplicate requests" },
                        originalExchangeRate: { type: "number", nullable: true, description: "FX rate locked at processing time from RevenueSchedule — never re-resolved" },
                        originalNormalizedAmount: { type: "number", nullable: true, description: "Refund amount in base reporting currency = amountMinor/100 * originalExchangeRate" },
                        attemptCount: { type: "integer", example: 1 },
                        createdAt: { type: "string", format: "date-time" }
                    }
                },

                RenewalDashboardMetrics: {
                    type: "object",
                    description: "Real-time snapshot of billing engine health + normalized revenue KPIs (all monetary KPIs in baseCurrency).",
                    properties: {
                        totalActiveContracts: { type: "integer", example: 142 },
                        expiringNext30Days: { type: "integer", example: 18 },
                        contractsInGrace: { type: "integer", example: 3 },
                        suspendedForNonPayment: { type: "integer", example: 1 },
                        failedPaymentsLast7Days: { type: "integer", example: 5 },
                        autoRenewEnabledCount: { type: "integer", example: 138 },
                        salesManagedCount: { type: "integer", example: 12 },
                        projectedRevenueNext30Days: {
                            type: "object",
                            properties: {
                                amount: { type: "number", example: 6320 },
                                contractCount: { type: "integer", example: 80 }
                            }
                        },
                        baseCurrency: { type: "string", example: "USD", description: "ISO 4217 \u2014 all normalized KPIs below are denominated in this currency" },
                        totalRecognizedRevenueBaseCurrency: { type: "number", example: 48320.50, description: "Sum of normalizedRecognizedAmount across all schedules" },
                        totalDeferredRevenueBaseCurrency: { type: "number", example: 12840.00, description: "Sum of normalizedDeferredAmount across active schedules" },
                        MRRBaseCurrency: { type: "number", example: 5230.75, description: "Monthly Recurring Revenue: sum of normalizedAmountPerPeriod for active monthly schedules" },
                        ARRBaseCurrency: { type: "number", example: 62769.00, description: "Annual Recurring Revenue = MRRBaseCurrency * 12" },
                        generatedAt: { type: "string", format: "date-time" }
                    }
                },

                /* ============================================================ */
                /* Platform Domain Schemas                                      */
                /* ============================================================ */

                PlatformCapabilities: {
                    type: "object",
                    properties: {
                        role: { type: "string", example: "superadmin" },
                        capabilities: {
                            type: "array",
                            items: { type: "string" },
                            example: [
                                "VIEW_ORGANIZATIONS",
                                "MANAGE_ORGANIZATIONS",
                                "MANAGE_SUBSCRIPTIONS",
                                "VIEW_AUDIT_LOGS",
                                "VIEW_PLATFORM_ANALYTICS",
                                "MANAGE_PLATFORM_USERS",
                                "MANAGE_PLATFORM_SETTINGS"
                            ]
                        }
                    }
                },

                PlatformUser: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        role: {
                            type: "string",
                            enum: ["superadmin", "operations_admin", "finance_admin", "analyst"]
                        },
                        type: { type: "string", example: "platform" }
                    }
                },

                PlatformLogoutResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: true },
                        message: { type: "string", example: "Logged out successfully" }
                    }
                }

            }
        },

        security: [
            {
                bearerAuth: [],
            },
        ],
    },

    // Hybrid Architecture — include root routes + platform sub-routes for @swagger JSDoc discovery
    apis: [
        require("path").resolve(__dirname, "../routes/*.js"),
        require("path").resolve(__dirname, "../routes/platform/*.js"),
        require("path").resolve(__dirname, "../modules/users/routes/*.js"),
        require("path").resolve(__dirname, "../modules/branches/routes/*.js"),
        require("path").resolve(__dirname, "../modules/patientDomain/*.js"),
        require("path").resolve(__dirname, "../modules/procedures/routes/*.js"),
        require("path").resolve(__dirname, "../modules/treatments/routes/*.js"),
        require("path").resolve(__dirname, "../modules/billingDomain/routes/*.js"),
        require("path").resolve(__dirname, "../modules/billingDomain/analytics/routes/*.js"),
        require("path").resolve(__dirname, "../modules/orthodontics/routes/*.js"),
        // ✅ Phase 4 — orthodonticDomain/ removed; routes served via orthodontics/routes/ above
        require("path").resolve(__dirname, "../modules/patientPortal/routes/*.js"),
        require("path").resolve(__dirname, "../organization/featuresControl/*.js"),
    ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
