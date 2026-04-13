import { lazy } from 'react';
import {
    LayoutDashboard,
    Building2,
    Users,
    ShieldCheck,
    CreditCard,
    Activity,
    Shield,
    Settings,
    Blocks,
    ShieldAlert,
    ToggleLeft,
    TrendingUp,
    FileText,
    BookOpen,
    BarChart3,
    Inbox,
    Zap,
    Layers
} from 'lucide-react';

// Lazy Loaded Components
const DashboardPage = lazy(() => import('../../dashboard/DashboardPage'));
const PlatformOrganizationsPage = lazy(() => import('../../modules/organizations/PlatformOrganizationsPage'));
const SubscriptionPage = lazy(() => import('../../modules/subscriptions/SubscriptionPage'));
const PlatformUsersPage = lazy(() => import('../../users/PlatformUsersPage'));
const OrganizationUsersPage = lazy(() => import('../../users/OrganizationUsersPage'));
const UserDetailPage = lazy(() => import('../../users/UserDetailPage'));
const SubscriptionDetailPage = lazy(() => import('../../modules/subscriptions/SubscriptionDetailPage'));
const PlansListPage = lazy(() => import('../../modules/plans/PlansListPage'));
const PlanBuilderPage = lazy(() => import('../../modules/plans/PlanBuilderPage'));
const PlatformTemplateEditPage = lazy(() => import('../../modules/plans/PlatformTemplateEditPage'));
const PlatformBillingEventsPage = lazy(() => import('../../pages/PlatformBillingEventsPage'));
const GuardianDashboardPage = lazy(() => import('../../modules/guardian/GuardianDashboardPage'));
const OrganizationDetailPage = lazy(() => import('../../modules/organizations/OrganizationDetailPage'));
const OrganizationUserDetailPage = lazy(() => import('../../users/OrganizationUserDetailPage'));
// Sprint 8
const PlatformFeatureFlagPage = lazy(() => import('../../modules/platformSettings/pages/PlatformFeatureFlagPage'));
// Sprint 9 — Finance Pages
const PlatformFinanceDashboardPage = lazy(() => import('../../pages/PlatformFinanceDashboardPage'));
const PlatformRevenueAnalyticsPage = lazy(() => import('../../pages/PlatformRevenueAnalyticsPage'));
const PlatformInvoicesPage = lazy(() => import('../../pages/PlatformInvoicesPage'));
const PlatformLedgerPage = lazy(() => import('../../pages/PlatformLedgerPage'));
const PlatformPaymentsPage = lazy(() => import('../../pages/PlatformPaymentsPage'));
const LedgerTransactionPage = lazy(() => import('../../pages/LedgerTransactionPage'));
const PlatformContractPage = lazy(() => import('../../pages/PlatformContractPage'));
const AuditTrailExplorer = lazy(() => import('../../pages/AuditTrailExplorer'));
const PlatformRequestsPage = lazy(() => import('../../pages/PlatformRequestsPage'));
// v3.1 — Communication Infrastructure
const CommunicationCenterPage = lazy(() => import('../../communication/CommunicationCenterPage'));
// Phase 12.1 — Feature Registry
const FeatureRegistryPage = lazy(() => import('../../modules/featureRegistry/pages/FeatureRegistryPage'));

// Placeholder for unimplemented features
const ComingSoon = lazy(() => import('../components/ComingSoon'));

/**
 * PLATFORM_FEATURES - Single Source of Truth V18.0 Hardened
 * 
 * Each feature defines its routing, navigation, and required capability.
 * breadcrumb: Label used for auto-generated breadcrumb navigation.
 * featureFlag: Optional flag required in addition to capability.
 */
// @ts-check
/** @typedef {import('@packages/platform-contract/platformContract').PlatformCapability} PlatformCapability */
/** @typedef {import('@packages/platform-contract/platformContract').PlatformFeatureFlag} PlatformFeatureFlag */
export const PLATFORM_FEATURES = [
    {
        key: 'DASHBOARD',
        label: 'Overview',
        path: 'dashboard',
        capability: 'VIEW_PLATFORM_ANALYTICS',
        breadcrumb: 'Dashboard',
        component: DashboardPage,
        icon: LayoutDashboard,
        showInSidebar: true,
        section: 'Core'
    },
    {
        key: 'ORGANIZATIONS',
        label: 'Organizations',
        path: 'organizations',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'Organizations',
        component: PlatformOrganizationsPage,
        icon: Building2,
        showInSidebar: true,
        section: 'Governance'
    },
    {
        key: 'USERS',
        label: 'Platform Staff',
        path: 'users',
        capability: 'MANAGE_PLATFORM_USERS',
        breadcrumb: 'Staff Management',
        component: PlatformUsersPage,
        icon: ShieldCheck,
        showInSidebar: true,
        section: 'Governance'
    },
    {
        key: 'ORG_GOVERNANCE',
        label: 'Org Governance',
        path: 'org-governance',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'Organization Users',
        component: OrganizationUsersPage,
        icon: Users,
        showInSidebar: true,
        section: 'Governance'
    },
    {
        key: 'FINANCE_DASHBOARD',
        label: 'Finance Overview',
        path: 'finance',
        capability: 'VIEW_PLATFORM_ANALYTICS',
        breadcrumb: 'Finance Dashboard',
        component: PlatformFinanceDashboardPage,
        icon: TrendingUp,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'REVENUE',
        label: 'Revenue Analytics',
        path: 'revenue',
        capability: 'VIEW_PLATFORM_ANALYTICS',
        breadcrumb: 'Revenue Intelligence',
        component: PlatformRevenueAnalyticsPage,
        icon: BarChart3,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'INVOICES',
        label: 'Invoices',
        path: 'billing/invoices',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'Invoice Management',
        component: PlatformInvoicesPage,
        icon: FileText,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'LEDGER',
        label: 'Billing Ledger',
        path: 'billing/ledger',
        capability: 'VIEW_AUDIT_LOGS',
        breadcrumb: 'Immutable Ledger',
        component: PlatformLedgerPage,
        icon: BookOpen,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'PAYMENTS',
        label: 'Payment History',
        path: 'billing/payments',
        capability: 'VIEW_PLATFORM_ANALYTICS',
        breadcrumb: 'Payment Attempts',
        component: PlatformPaymentsPage,
        icon: CreditCard,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'REQUESTS_INBOX',
        label: 'Requests',
        path: 'requests',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Requests Inbox',
        component: PlatformRequestsPage,
        icon: Inbox,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'AUDIT_LOGS',
        label: 'Audit Logs',
        path: 'audit-logs',
        capability: 'VIEW_AUDIT_LOGS',
        breadcrumb: 'Audit Trail',
        component: AuditTrailExplorer,
        icon: Activity,
        showInSidebar: true,
        section: 'System'
    },
    {
        key: 'SUBSCRIPTIONS',
        label: 'Subscription Control',
        path: 'subscriptions',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Subscriptions',
        component: SubscriptionPage,
        icon: Shield,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'SETTINGS',
        label: 'Global Config',
        path: 'settings',
        capability: 'MANAGE_PLATFORM_SETTINGS',
        breadcrumb: 'Global Settings',
        component: ComingSoon,
        featureProps: { featureName: "Global Configuration" },
        icon: Settings,
        showInSidebar: true,
        section: 'System'
    },
    {
        key: 'PLAN_BUILDER',
        label: 'Plan Builder',
        path: 'plans',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Plan Builder',
        component: PlansListPage,
        icon: Blocks,
        showInSidebar: true,
        section: 'Finance'
    },
    {
        key: 'GUARDIAN_DASHBOARD',
        label: 'Guardian',
        path: 'guardian',
        capability: 'MANAGE_PLATFORM_SETTINGS',
        breadcrumb: 'Platform Guardian',
        component: GuardianDashboardPage,
        icon: ShieldAlert,
        showInSidebar: true,
        section: 'Platform Admin'
    },
    // v3.1 — Communication Infrastructure
    {
        key: 'COMMUNICATION_CENTER',
        label: 'Communication',
        path: 'communication',
        capability: 'VIEW_COMMUNICATION_METRICS',
        breadcrumb: 'Communication Center',
        component: CommunicationCenterPage,
        icon: Zap,
        showInSidebar: true,
        section: 'Infrastructure'
    },
    {
        key: 'BILLING_EVENTS',
        label: 'Billing Events',
        path: 'billing/events',
        capability: 'VIEW_PLATFORM_ANALYTICS',
        breadcrumb: 'Billing Event Ledger',
        component: PlatformBillingEventsPage,
        icon: Activity,
        showInSidebar: true,
        section: 'Finance'
    },
    // Sprint 8 — Feature Flag Management
    {
        key: 'FEATURE_FLAGS',
        label: 'Feature Flags',
        path: 'feature-flags',
        capability: 'MANAGE_PLATFORM_SETTINGS',
        featureFlag: 'PLATFORM_FEATURE_FLAGS',
        breadcrumb: 'Feature Flag Management',
        component: PlatformFeatureFlagPage,
        icon: ToggleLeft,
        showInSidebar: true,
        section: 'System'
    },
    // Phase 12.1 — Feature Registry
    {
        key: 'FEATURE_REGISTRY',
        label: 'Feature Registry',
        path: 'feature-registry',
        capability: 'MANAGE_PLATFORM_SETTINGS',
        breadcrumb: 'Feature Registry',
        component: FeatureRegistryPage,
        icon: Layers,
        showInSidebar: true,
        section: 'System'
    },
    // Detail Routes (Hidden from Sidebar)
    // IMPORTANT: more-specific routes must appear BEFORE less-specific ones.
    {
        key: 'ORG_USER_DETAIL_FROM_ORG',
        // ⚠️ Param MUST be :orgId — OrganizationUserDetailPage destructures useParams() as { orgId, userId }
        path: 'organizations/:orgId/users/:userId',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'User Profile',
        component: OrganizationUserDetailPage,
        showInSidebar: false
    },
    {
        key: 'ORG_DETAIL',
        path: 'organizations/:id',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'Organization Detail',
        component: OrganizationDetailPage,
        showInSidebar: false
    },
    {
        key: 'USER_DETAIL',
        path: 'users/:id',
        capability: 'MANAGE_PLATFORM_USERS',
        breadcrumb: 'User Details',
        component: UserDetailPage,
        showInSidebar: false
    },
    {
        key: 'ORG_USER_DETAIL',
        path: 'org-governance/:organizationId/:id',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'User Profile',
        component: UserDetailPage,
        showInSidebar: false
    },
    {
        key: 'SUBSCRIPTION_DETAIL',
        path: 'subscriptions/:orgId',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Plan Details',
        component: SubscriptionDetailPage,
        showInSidebar: false
    },
    // IMPORTANT: billing/ledger/transaction/:id must appear BEFORE billing/ledger
    // so React Router resolves the more-specific path correctly.
    {
        key: 'LEDGER_TRANSACTION_DETAIL',
        path: 'billing/ledger/transaction/:id',
        capability: 'VIEW_AUDIT_LOGS',
        breadcrumb: 'Ledger Transaction',
        component: LedgerTransactionPage,
        showInSidebar: false
    },
    // Contract detail page — navigated from BillingTab and InvoiceViewModal
    {
        key: 'CONTRACT_DETAIL',
        path: 'contracts/:contractId',
        capability: 'VIEW_ORGANIZATIONS',
        breadcrumb: 'Contract Detail',
        component: PlatformContractPage,
        showInSidebar: false
    },
    // ── Plan Builder sub-routes (template-first workflow) ──────────────────
    // IMPORTANT: More-specific paths must be registered BEFORE the less-specific list route.
    // plans/templates/:templateId → template detail + version list
    {
        key: 'PLAN_TEMPLATE_DETAIL',
        path: 'plans/templates/:templateId',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Plan Template',
        component: PlatformTemplateEditPage,
        showInSidebar: false
    },
    // plans/versions (NO :versionId) → redirect to plans list (prevents blank page)
    // React Router v6 does NOT match plans/versions/:versionId when there's no versionId segment.
    // Without this fallback, /platform/plans/versions renders nothing in the Outlet.
    {
        key: 'PLAN_VERSIONS_REDIRECT',
        path: 'plans/versions',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Plan Builder',
        component: PlansListPage,
        showInSidebar: false
    },
    // plans/versions/:versionId → version editor (draft only editable)
    {
        key: 'PLAN_VERSION_EDITOR',
        path: 'plans/versions/:versionId',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'Edit Version',
        component: PlanBuilderPage,
        showInSidebar: false
    },
    // plans/versions/:versionId/duplicate → version duplicator (new edition workflow)
    {
        key: 'PLAN_VERSION_DUPLICATOR',
        path: 'plans/versions/:versionId/duplicate',
        capability: 'MANAGE_SUBSCRIPTIONS',
        breadcrumb: 'New Edition',
        component: PlanBuilderPage,
        showInSidebar: false
    },
    // Governance Consistency Mappings (Unused but Registered for STRICT alignment)
    {
        key: 'SYSTEM_STATUS',
        path: 'internal/status',
        capability: 'VIEW_AUDIT_LOGS',
        featureFlag: 'SYSTEM_MONITOR',
        showInSidebar: false,
        component: ComingSoon
    },
    {
        key: 'REPORTING_CENTER',
        path: 'internal/reporting',
        capability: 'VIEW_PLATFORM_ANALYTICS',
        featureFlag: 'ENTERPRISE_REPORTING',
        showInSidebar: false,
        component: ComingSoon
    },
    {
        key: 'ORG_SUSPENSION_TOOL',
        path: 'internal/suspend',
        capability: 'MANAGE_ORGANIZATIONS',
        showInSidebar: false,
        component: ComingSoon
    },
    {
        key: 'SYSTEM_SAFETY',
        path: 'internal/safety',
        capability: 'VIEW_AUDIT_LOGS',
        featureFlag: 'PLATFORM_KILL_SWITCH',
        showInSidebar: false,
        component: ComingSoon
    }
];
