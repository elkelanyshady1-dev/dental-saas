/**
 * platformContract.ts
 * v18.0 Hardened Governance — Unified Capability & Flag Source of Truth
 */

export type PlatformCapability =
    | "MANAGE_ADMINS"
    | "VIEW_FINANCE"
    | "SUSPEND_ORG"
    | "VIEW_AUDIT_LOGS"
    | "VIEW_ORGANIZATIONS"
    | "VIEW_ANALYTICS"
    | "VIEW_SYSTEM"
    | "MANAGE_SETTINGS"
    | "MANAGE_SUBSCRIPTIONS";

export type PlatformFeatureFlag =
    | "ADVANCED_ANALYTICS"
    | "ENTERPRISE_REPORTING"
    | "SYSTEM_MONITOR"
    | "PLATFORM_KILL_SWITCH";

export const PLATFORM_CAPABILITIES: PlatformCapability[] = [
    "MANAGE_ADMINS",
    "VIEW_FINANCE",
    "SUSPEND_ORG",
    "VIEW_AUDIT_LOGS",
    "VIEW_ORGANIZATIONS",
    "VIEW_ANALYTICS",
    "VIEW_SYSTEM",
    "MANAGE_SETTINGS",
    "MANAGE_SUBSCRIPTIONS"
];

export const PLATFORM_FEATURE_FLAGS: Record<PlatformFeatureFlag, boolean> = {
    ADVANCED_ANALYTICS: true,
    ENTERPRISE_REPORTING: true,
    SYSTEM_MONITOR: false,
    PLATFORM_KILL_SWITCH: false
};
