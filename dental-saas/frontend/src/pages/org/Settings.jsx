import React from "react";
import {
    UsersIcon,
    BuildingOffice2Icon,
    KeyIcon,
    ShieldCheckIcon,
    ChartBarIcon,
    CpuChipIcon,
    CreditCardIcon,
    ChatBubbleLeftRightIcon,
    FlagIcon,
    PhotoIcon,
    BuildingStorefrontIcon,
    InformationCircleIcon,
    QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";

import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import SettingsSection from "@/org/modules/settings/components/SettingsSection";
import SettingsCard from "@/org/modules/settings/components/SettingsCard";

/**
 * Settings.jsx — Redesigned Settings Hub (v10.0)
 * 
 * Objectives:
 * - High scannability via domain-grouped cards.
 * - Modular architecture (Hub -> Navigation -> Sub-pages).
 * - Premium SaaS design alignment (Stripe/Linear).
 * - Plane Isolation & Capability-based access.
 */
export default function Settings() {
    // ── Capability-based access (Rules Engine §8 — useCapability ONLY) ──────
    const canUsers     = useCapability(P.USERS_READ);
    const canBranches  = useCapability(P.BRANCHES_READ);
    const canSecurity  = useCapability(P.SECURITY_MANAGE);
    const canAnalytics = useCapability(P.SECURITY_MANAGE);
    const canFeatures  = useCapability(P.SECURITY_MANAGE);
    const canBilling   = useCapability(P.BILLING_READ);
    const canSupport   = useCapability(P.SUPPORT_READ);

    return (
        <div className="min-h-screen bg-gray-50/50 -m-6 p-6 lg:p-8 space-y-12 pb-24">
            
            {/* ── Breadcrumb & Header ────────────────────────────────────── */}
            <div className="max-w-7xl mx-auto space-y-4">
                <nav className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <span className="hover:text-gray-600 transition-colors cursor-default">Settings</span>
                    <span className="text-gray-300">/</span>
                    <span className="text-blue-600">Overview</span>
                </nav>
                <header>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-sans">Settings Hub</h1>
                    <p className="text-gray-500 mt-2 text-lg">Manage your organization's identity, administration, and system governance.</p>
                </header>
            </div>

            <div className="max-w-7xl mx-auto space-y-12">
                
                {/* ── Section: Organization ─────────────────────────────────── */}
                <SettingsSection 
                    title="Organization" 
                    description="Configure your clinic identity, branding, and public profile."
                >
                    <SettingsCard 
                        icon={PhotoIcon}
                        title="Branding & Logo"
                        description="Upload your clinic logo and customize app-wide branding assets."
                        path="/org/settings/branding"
                        iconColor="blue"
                    />
                    <SettingsCard 
                        icon={BuildingStorefrontIcon}
                        title="Clinic Info"
                        description="Update address, phone number, and public contact information for your office."
                        path="/org/settings/organization"
                        iconColor="emerald"
                    />
                </SettingsSection>

                {/* ── Section: Administration ───────────────────────────────── */}
                <SettingsSection 
                    title="Administration" 
                    description="Governance of staff, locations, and system-wide access levels."
                >
                    {canUsers && (
                        <SettingsCard 
                            icon={UsersIcon}
                            title="Staff & Members"
                            description="Invite team members, manage active accounts, and assign roles."
                            path="/org/settings/users"
                            iconColor="blue"
                        />
                    )}
                    {canBranches && (
                        <SettingsCard 
                            icon={BuildingOffice2Icon}
                            title="Branch Network"
                            description="Manage multi-location clinics, working hours, and facility resources."
                            path="/org/settings/branches"
                            iconColor="emerald"
                        />
                    )}
                    {canUsers && (
                        <SettingsCard 
                            icon={KeyIcon}
                            title="Roles & Permissions"
                            description="Configure RBAC matrix and define granular module access for each role."
                            path="/org/settings/roles"
                            iconColor="purple"
                        />
                    )}
                </SettingsSection>

                {/* ── Section: Security & Compliance ────────────────────────── */}
                <SettingsSection 
                    title="Security & Compliance"
                    description="Monitor access patterns, audit logs, and enforce system-wide security policies."
                >
                    {canSecurity && (
                        <SettingsCard 
                            icon={ShieldCheckIcon}
                            title="Security Control Center"
                            description="Session management, access tokens, and PBAC policy enforcement."
                            path="/org/settings/security"
                            iconColor="rose"
                        />
                    )}
                    {canAnalytics && (
                        <SettingsCard 
                            icon={ChartBarIcon}
                            title="Auth Analytics"
                            description="Real-time security monitoring, geo-tags, and login failure patterns."
                            path="/org/settings/security/analytics"
                            iconColor="amber"
                        />
                    )}
                </SettingsSection>

                {/* ── Section: Platform Features ────────────────────────────── */}
                <SettingsSection 
                    title="Platform Features"
                    description="Toggle system modules and manage your plan-based entitlements."
                >
                    {canFeatures && (
                        <SettingsCard 
                            icon={CpuChipIcon}
                            title="Feature Control Center"
                            description="Enable or disable modules like Orthodontics, Inventory, and Analytics."
                            path="/org/settings/features"
                            iconColor="sky"
                        />
                    )}
                </SettingsSection>

                {/* ── Section: Billing & Usage ──────────────────────────────── */}
                <SettingsSection 
                    title="Billing & Subscription"
                    description="Manage your financial relationship and monitor resource consumption."
                >
                    {canBilling && (
                        <>
                            <SettingsCard 
                                icon={CreditCardIcon}
                                title="Subscription"
                                description="View current plan details, manage payment methods, and invoices."
                                path="/org/settings/billing"
                                iconColor="purple"
                            />
                            <SettingsCard 
                                icon={ChartBarIcon}
                                title="Storage Usage"
                                description="Detailed breakdown of cloud storage, file counts, and quotas."
                                path="/org/settings/billing"
                                iconColor="blue"
                            />
                        </>
                    )}
                </SettingsSection>

                {/* ── Section: Support & Resources ──────────────────────────── */}
                <SettingsSection 
                    title="Support & Feedback"
                    description="Get help from our team and view system status."
                >
                    {canSupport && (
                        <SettingsCard 
                            icon={ChatBubbleLeftRightIcon}
                            title="Support Center"
                            description="Create and track support tickets with our clinical success team."
                            path="/org/settings/support"
                            iconColor="blue"
                        />
                    )}
                    <SettingsCard 
                        icon={QuestionMarkCircleIcon}
                        title="Help Center"
                        description="Browse documentation, video tutorials, and getting started guides."
                        path="#"
                        iconColor="slate"
                    />
                    <SettingsCard 
                        icon={FlagIcon}
                        title="What's New"
                        description="Stay updated with latest features, bug fixes, and system improvements."
                        path="#"
                        iconColor="emerald"
                    />
                </SettingsSection>

            </div>
        </div>
    );
}
