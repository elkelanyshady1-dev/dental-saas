/**
 * AuthAnalyticsContext.jsx — Central Analytics State
 *
 * Single source of truth for the Authorization Analytics dashboard.
 * Manages: filters, selected entities, drill-down state, RTL direction.
 *
 * TASK-FE-AUTH-INT-002
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React, { createContext, useContext, useReducer, useCallback, useMemo } from "react";

const AuthAnalyticsContext = createContext(null);

// ─── State Shape ─────────────────────────────────────────────────────────────

const initialState = {
    // Filters
    dateRange: "24h",
    roleFilter: "all",
    pollingEnabled: true,

    // Drill-down selections
    selectedPermission: null,  // string | null — clicked bar in AuthBarChart
    selectedUser: null,        // { userId, user } | null — clicked row in RiskUsersTable
    selectedDenial: null,      // denial object | null — clicked row in DenialsTable
    selectedTraceId: null,     // string | null — for inspector panel

    // UI state
    showInspector: true,
    showAlerts: true,
    showInsights: true,

    // RTL direction
    direction: document.documentElement.dir || "ltr",
};

// ─── Actions ─────────────────────────────────────────────────────────────────

const ActionTypes = {
    SET_DATE_RANGE: "SET_DATE_RANGE",
    SET_ROLE_FILTER: "SET_ROLE_FILTER",
    SET_POLLING: "SET_POLLING",
    SELECT_PERMISSION: "SELECT_PERMISSION",
    SELECT_USER: "SELECT_USER",
    SELECT_DENIAL: "SELECT_DENIAL",
    SELECT_TRACE: "SELECT_TRACE",
    TOGGLE_INSPECTOR: "TOGGLE_INSPECTOR",
    TOGGLE_ALERTS: "TOGGLE_ALERTS",
    TOGGLE_INSIGHTS: "TOGGLE_INSIGHTS",
    SET_DIRECTION: "SET_DIRECTION",
    CLEAR_SELECTION: "CLEAR_SELECTION",
    RESET_FILTERS: "RESET_FILTERS",
};

function reducer(state, action) {
    switch (action.type) {
        case ActionTypes.SET_DATE_RANGE:
            return { ...state, dateRange: action.payload };
        case ActionTypes.SET_ROLE_FILTER:
            return { ...state, roleFilter: action.payload };
        case ActionTypes.SET_POLLING:
            return { ...state, pollingEnabled: action.payload };
        case ActionTypes.SELECT_PERMISSION:
            return { ...state, selectedPermission: action.payload };
        case ActionTypes.SELECT_USER:
            return { ...state, selectedUser: action.payload };
        case ActionTypes.SELECT_DENIAL:
            return { ...state, selectedDenial: action.payload };
        case ActionTypes.SELECT_TRACE:
            return { ...state, selectedTraceId: action.payload };
        case ActionTypes.TOGGLE_INSPECTOR:
            return { ...state, showInspector: !state.showInspector };
        case ActionTypes.TOGGLE_ALERTS:
            return { ...state, showAlerts: !state.showAlerts };
        case ActionTypes.TOGGLE_INSIGHTS:
            return { ...state, showInsights: !state.showInsights };
        case ActionTypes.SET_DIRECTION:
            return { ...state, direction: action.payload };
        case ActionTypes.CLEAR_SELECTION:
            return {
                ...state,
                selectedPermission: null,
                selectedUser: null,
                selectedDenial: null,
                selectedTraceId: null,
            };
        case ActionTypes.RESET_FILTERS:
            return {
                ...state,
                dateRange: "24h",
                roleFilter: "all",
                selectedPermission: null,
                selectedUser: null,
            };
        default:
            return state;
    }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthAnalyticsProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    const actions = useMemo(
        () => ({
            setDateRange: (range) =>
                dispatch({ type: ActionTypes.SET_DATE_RANGE, payload: range }),
            setRoleFilter: (role) =>
                dispatch({ type: ActionTypes.SET_ROLE_FILTER, payload: role }),
            setPolling: (enabled) =>
                dispatch({ type: ActionTypes.SET_POLLING, payload: enabled }),
            selectPermission: (permission) =>
                dispatch({ type: ActionTypes.SELECT_PERMISSION, payload: permission }),
            selectUser: (user) =>
                dispatch({ type: ActionTypes.SELECT_USER, payload: user }),
            selectDenial: (denial) =>
                dispatch({ type: ActionTypes.SELECT_DENIAL, payload: denial }),
            selectTrace: (traceId) =>
                dispatch({ type: ActionTypes.SELECT_TRACE, payload: traceId }),
            toggleInspector: () =>
                dispatch({ type: ActionTypes.TOGGLE_INSPECTOR }),
            toggleAlerts: () =>
                dispatch({ type: ActionTypes.TOGGLE_ALERTS }),
            toggleInsights: () =>
                dispatch({ type: ActionTypes.TOGGLE_INSIGHTS }),
            setDirection: (dir) => {
                document.documentElement.dir = dir;
                dispatch({ type: ActionTypes.SET_DIRECTION, payload: dir });
            },
            clearSelection: () =>
                dispatch({ type: ActionTypes.CLEAR_SELECTION }),
            resetFilters: () =>
                dispatch({ type: ActionTypes.RESET_FILTERS }),
        }),
        []
    );

    // Derived query params for React Query hooks
    const queryParams = useMemo(
        () => ({
            range: state.dateRange,
            ...(state.roleFilter !== "all" && { role: state.roleFilter }),
            ...(state.selectedPermission && { permission: state.selectedPermission }),
            ...(state.selectedUser && { userId: state.selectedUser.userId }),
        }),
        [state.dateRange, state.roleFilter, state.selectedPermission, state.selectedUser]
    );

    const value = useMemo(
        () => ({ state, actions, queryParams }),
        [state, actions, queryParams]
    );

    return (
        <AuthAnalyticsContext.Provider value={value}>
            {children}
        </AuthAnalyticsContext.Provider>
    );
}

// ─── Consumer Hooks ──────────────────────────────────────────────────────────

export function useAuthAnalyticsState() {
    const ctx = useContext(AuthAnalyticsContext);
    if (!ctx) throw new Error("useAuthAnalyticsState must be inside AuthAnalyticsProvider");
    return ctx.state;
}

export function useAuthAnalyticsActions() {
    const ctx = useContext(AuthAnalyticsContext);
    if (!ctx) throw new Error("useAuthAnalyticsActions must be inside AuthAnalyticsProvider");
    return ctx.actions;
}

export function useAuthAnalyticsParams() {
    const ctx = useContext(AuthAnalyticsContext);
    if (!ctx) throw new Error("useAuthAnalyticsParams must be inside AuthAnalyticsProvider");
    return ctx.queryParams;
}

export function useAuthAnalyticsContext() {
    const ctx = useContext(AuthAnalyticsContext);
    if (!ctx) throw new Error("useAuthAnalyticsContext must be inside AuthAnalyticsProvider");
    return ctx;
}
