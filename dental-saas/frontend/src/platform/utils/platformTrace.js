/**
 * platformTrace.js — Dev-only, removable auth-lifecycle tracer.
 *
 * Gated on NODE_ENV !== "production" so prod bundles strip it via Vite
 * tree-shaking (import.meta.env.DEV would be cleaner but we use the NODE_ENV
 * form requested by the task so greppable removal is trivial).
 *
 * Removal plan after debugging: delete this file + every `trace(...)` call
 * (single grep: `trace\(`).
 */
const TRACE = process.env.NODE_ENV !== "production";

export function trace(event, payload = {}) {
    if (!TRACE) return;
    const time = new Date().toISOString().split("T")[1];
    // eslint-disable-next-line no-console
    console.log(
        `%c[PLATFORM TRACE] ${time} → ${event}`,
        "color:#4CAF50;font-weight:bold",
        payload
    );
}

/**
 * decodeJwtPayload — tiny, dependency-free, try/catch-safe JWT payload
 * reader. Returns null on any error. Used ONLY for trace output — never for
 * authn decisions (those rely on the backend-verified user object).
 */
export function decodeJwtPayload(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const json = atob(pad);
        return JSON.parse(json);
    } catch {
        return null;
    }
}
