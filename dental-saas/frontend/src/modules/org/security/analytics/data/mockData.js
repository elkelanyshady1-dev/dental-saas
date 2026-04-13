/**
 * mockData.js — Authorization Analytics Mock Data
 *
 * Realistic sample data for the Auth Analytics dashboard.
 * Will be replaced by live API data when backend endpoint is ready.
 */

export const summary = {
    total: 1284092,
    allowRate: 98.42,
    denyRate: 1.58,
    avgDuration: 42, // ms
};

export const timelineData = [
    { time: "06:00", allow: 120, deny: 5 },
    { time: "07:00", allow: 210, deny: 8 },
    { time: "08:00", allow: 380, deny: 14 },
    { time: "09:00", allow: 560, deny: 22 },
    { time: "10:00", allow: 620, deny: 28 },
    { time: "11:00", allow: 710, deny: 35 },
    { time: "12:00", allow: 540, deny: 18 },
    { time: "13:00", allow: 480, deny: 15 },
    { time: "14:00", allow: 590, deny: 26 },
    { time: "15:00", allow: 650, deny: 31 },
    { time: "16:00", allow: 720, deny: 38 },
    { time: "17:00", allow: 580, deny: 22 },
    { time: "18:00", allow: 340, deny: 12 },
    { time: "19:00", allow: 180, deny: 6 },
    { time: "20:00", allow: 90, deny: 3 },
];

export const distributionData = [
    { name: "Allowed", value: 1263786, color: "#10B981" },
    { name: "Denied", value: 20306, color: "#EF4444" },
];

export const deniedPermissions = [
    { name: "patient:write", value: 4200 },
    { name: "invoice:delete", value: 3100 },
    { name: "treatment:write", value: 2800 },
    { name: "appointment:cancel", value: 1900 },
    { name: "user:manage", value: 1600 },
    { name: "report:export", value: 1200 },
    { name: "settings:write", value: 980 },
    { name: "orthodontics:write", value: 750 },
];

export const recentDenials = [
    {
        id: "d-001",
        user: "Dr. Sarah Ahmed",
        role: "dentist",
        permission: "patient:delete",
        endpoint: "DELETE /api/v1/patients/:id",
        time: "2 min ago",
        status: "denied",
    },
    {
        id: "d-002",
        user: "Nurse Fatima",
        role: "nurse",
        permission: "invoice:write",
        endpoint: "POST /api/v1/invoices",
        time: "8 min ago",
        status: "denied",
    },
    {
        id: "d-003",
        user: "Receptionist Ali",
        role: "receptionist",
        permission: "treatment:write",
        endpoint: "PUT /api/v1/treatments/:id",
        time: "14 min ago",
        status: "denied",
    },
    {
        id: "d-004",
        user: "Dr. Mohamed Nasser",
        role: "dentist",
        permission: "user:manage",
        endpoint: "POST /api/v1/users/invite",
        time: "22 min ago",
        status: "denied",
    },
    {
        id: "d-005",
        user: "Lab Tech Youssef",
        role: "lab_tech",
        permission: "settings:write",
        endpoint: "PATCH /api/v1/settings/org",
        time: "31 min ago",
        status: "denied",
    },
    {
        id: "d-006",
        user: "Intern Layla",
        role: "intern",
        permission: "orthodontics:write",
        endpoint: "POST /api/v1/ortho/cases",
        time: "45 min ago",
        status: "denied",
    },
];

export const riskUsers = [
    { user: "Receptionist Ali", denialCount: 127, riskLevel: "high" },
    { user: "Intern Layla", denialCount: 94, riskLevel: "high" },
    { user: "Lab Tech Youssef", denialCount: 68, riskLevel: "medium" },
    { user: "Nurse Fatima", denialCount: 42, riskLevel: "medium" },
    { user: "Dr. Sarah Ahmed", denialCount: 18, riskLevel: "low" },
    { user: "Dr. Mohamed Nasser", denialCount: 12, riskLevel: "low" },
];

export const layerPerformance = [
    { layer: "RBAC", avgMs: 2.1, p99Ms: 8.4, totalChecks: 1284092, passRate: 99.2 },
    { layer: "ENTITLEMENT", avgMs: 0.8, p99Ms: 3.2, totalChecks: 1284092, passRate: 99.8 },
    { layer: "PBAC", avgMs: 4.6, p99Ms: 18.2, totalChecks: 892450, passRate: 97.6 },
    { layer: "FIELD_WRITE", avgMs: 1.4, p99Ms: 5.8, totalChecks: 456230, passRate: 98.9 },
    { layer: "FIELD_READ", avgMs: 0.9, p99Ms: 3.6, totalChecks: 678340, passRate: 99.4 },
];

export const fieldViolations = [
    { field: "patient.ssn", attempts: 342, lastAttempt: "3 min ago" },
    { field: "patient.insurance_id", attempts: 218, lastAttempt: "12 min ago" },
    { field: "invoice.total_paid", attempts: 156, lastAttempt: "28 min ago" },
    { field: "user.salary", attempts: 134, lastAttempt: "1 hr ago" },
    { field: "patient.medical_history", attempts: 98, lastAttempt: "2 hrs ago" },
    { field: "treatment.cost_breakdown", attempts: 67, lastAttempt: "3 hrs ago" },
];

export const inspectorTrace = {
    requestId: "req_a8f2c4e1",
    userId: "usr_dr_sarah",
    action: "treatment:write",
    resource: "treatment:tr_482",
    timestamp: "2026-03-22T22:31:12Z",
    totalDuration: 12.4,
    result: "DENY",
    layers: [
        {
            layer: "RBAC",
            status: "ALLOW",
            duration: 1.8,
            details: { role: "dentist", permission: "treatment:write", matched: true },
        },
        {
            layer: "ENTITLEMENT",
            status: "ALLOW",
            duration: 0.6,
            details: { plan: "professional", feature: "treatments", entitled: true },
        },
        {
            layer: "PBAC",
            status: "DENY",
            duration: 6.2,
            details: {
                policy: "treatment_branch_policy",
                rule: "deny_cross_branch_treatment_edit",
                reason: "User branch (branch_1) ≠ treatment branch (branch_3)",
            },
        },
        {
            layer: "FIELD_WRITE",
            status: "SKIP",
            duration: 0,
            details: { reason: "Short-circuited — PBAC denied" },
        },
        {
            layer: "FIELD_READ",
            status: "SKIP",
            duration: 0,
            details: { reason: "Short-circuited — PBAC denied" },
        },
    ],
};

export const mockAlerts = [
    {
        id: "alert-001",
        severity: "critical",
        type: "denial_burst",
        title: "Denial Rate Spike Detected",
        message: "Denial rate exceeded 5% threshold in the last 5 minutes (current: 8.2%). 42 denials from 6 unique users targeting patient:write and invoice:delete permissions.",
        user: null,
        timestamp: "2 min ago",
        acknowledged: false,
        meta: { denialCount: 42, threshold: "5%", current: "8.2%", window: "5m" },
    },
    {
        id: "alert-002",
        severity: "critical",
        type: "suspicious_user",
        title: "Abnormal Access Pattern — Receptionist Ali",
        message: "127 denied requests in the past hour. Attempting invoice:delete, settings:write, and user:manage — all outside assigned role capabilities.",
        user: "Receptionist Ali",
        timestamp: "8 min ago",
        acknowledged: false,
        meta: { userId: "usr_ali", denialCount: 127, topPermissions: ["invoice:delete", "settings:write"] },
    },
    {
        id: "alert-003",
        severity: "warning",
        type: "role_deviation",
        title: "Role Capability Mismatch — Dr. Mohamed",
        message: "Dentist role attempting user:manage operations (POST /api/v1/users/invite). This capability is not assigned to the dentist role.",
        user: "Dr. Mohamed Nasser",
        timestamp: "22 min ago",
        acknowledged: false,
        meta: { role: "dentist", attemptedPermission: "user:manage" },
    },
    {
        id: "alert-004",
        severity: "warning",
        type: "denial_burst",
        title: "PBAC Layer Slow Response",
        message: "PBAC layer P99 latency increased to 24ms (normal: 18ms). Possible policy complexity issue or database bottleneck.",
        user: null,
        timestamp: "35 min ago",
        acknowledged: true,
        meta: { layer: "PBAC", p99: "24ms", normal: "18ms" },
    },
    {
        id: "alert-005",
        severity: "info",
        type: "role_deviation",
        title: "New Permission Pattern Detected",
        message: "3 nurses attempted orthodontics:write in the past 2 hours. If this is expected, consider adding to the nurse role.",
        user: null,
        timestamp: "1 hr ago",
        acknowledged: true,
        meta: { count: 3, role: "nurse", permission: "orthodontics:write" },
    },
];
