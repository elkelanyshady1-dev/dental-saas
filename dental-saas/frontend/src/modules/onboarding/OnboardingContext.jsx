/**
 * OnboardingContext.jsx — Cross-component onboarding state.
 *
 * Tracks the cross-cutting facts that multiple surfaces care about:
 *   - currentStep            (which signup step the user is on)
 *   - email                  (shared from signup → verify-email → login prefill)
 *   - phoneVerified / emailVerified / profileCompleted (funnel flags)
 *   - skippedProfileAt       (timestamp; drives the 24h re-prompt in OrgLayout)
 *
 * What this context is NOT for:
 *   - Wizard-internal form state (plans, pricing token, passwords) — stays local.
 *   - Auth tokens / user profile — lives in AuthContext.
 *
 * Persistence:
 *   sessionStorage — tab-scoped, auto-clears on close. A user who abandons
 *   signup gets a clean slate on the next session, which is the correct
 *   privacy default for a pre-auth funnel.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "onboarding:v1";

const INITIAL_STATE = {
    currentStep: "phone",        // "phone" | "phoneOtp" | "emailOtp" | "plan" | "details" | "profile" | "done"
    email: "",
    phoneNumber: "",
    phoneVerified: false,
    emailVerified: false,
    profileCompleted: false,
    skippedProfileAt: null,      // epoch ms — null if never skipped
    signupStartedAt: null,       // epoch ms — first time user entered the funnel
};

function loadInitial() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return INITIAL_STATE;
        const parsed = JSON.parse(raw);
        // Shallow-merge so a future field addition doesn't break old sessions.
        return { ...INITIAL_STATE, ...parsed };
    } catch {
        return INITIAL_STATE;
    }
}

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
    const [state, setState] = useState(loadInitial);

    // Persist every change. Writes are cheap — state is small and bounded.
    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch { /* quota / private mode — non-blocking */ }
    }, [state]);

    // ── Helper actions ──────────────────────────────────────────────────────
    const patch = useCallback((partial) => {
        setState((prev) => ({ ...prev, ...partial }));
    }, []);

    const markStep = useCallback((currentStep) => {
        setState((prev) => {
            const next = { ...prev, currentStep };
            if (!prev.signupStartedAt && currentStep !== "done") {
                next.signupStartedAt = Date.now();
            }
            return next;
        });
    }, []);

    const markPhoneVerified = useCallback(
        (phoneNumber) => patch({ phoneVerified: true, phoneNumber: phoneNumber || "" }),
        [patch]
    );
    const markEmailVerified = useCallback(
        (email) => patch({ emailVerified: true, email: email || "" }),
        [patch]
    );
    const markProfileCompleted = useCallback(
        () => patch({ profileCompleted: true, skippedProfileAt: null }),
        [patch]
    );
    const markProfileSkipped = useCallback(
        () => patch({ skippedProfileAt: Date.now() }),
        [patch]
    );

    const reset = useCallback(() => {
        setState(INITIAL_STATE);
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* non-blocking */ }
    }, []);

    const value = useMemo(
        () => ({
            state,
            patch,
            markStep,
            markPhoneVerified,
            markEmailVerified,
            markProfileCompleted,
            markProfileSkipped,
            reset,
        }),
        [state, patch, markStep, markPhoneVerified, markEmailVerified, markProfileCompleted, markProfileSkipped, reset]
    );

    return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
    const ctx = useContext(OnboardingContext);
    if (!ctx) {
        // Fail soft — callers should still work if provider is missing (e.g. on
        // a route that doesn't wrap them). Return a no-op shape.
        return {
            state: INITIAL_STATE,
            patch: () => {},
            markStep: () => {},
            markPhoneVerified: () => {},
            markEmailVerified: () => {},
            markProfileCompleted: () => {},
            markProfileSkipped: () => {},
            reset: () => {},
        };
    }
    return ctx;
}

export default OnboardingContext;
