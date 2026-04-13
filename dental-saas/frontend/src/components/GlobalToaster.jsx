/**
 * GlobalToaster.jsx — App-Root Toast Renderer
 *
 * Mount ONCE at the app root (App.jsx or main.jsx).
 * Renders react-hot-toast's <Toaster> with production-grade styling.
 *
 * DO NOT mount multiple <Toaster> instances.
 */
import { Toaster } from "react-hot-toast";

export default function GlobalToaster() {
    return (
        <Toaster
            position="top-right"
            gutter={10}
            containerStyle={{
                top: 16,
                right: 16,
            }}
            toastOptions={{
                duration: 4000,
                style: {
                    maxWidth: 420,
                    borderRadius: "12px",
                    background: "#111827",
                    color: "#f9fafb",
                    padding: "14px 18px",
                    fontSize: "14px",
                    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                    fontWeight: 500,
                    lineHeight: 1.4,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)",
                    backdropFilter: "blur(12px)",
                    gap: "10px",
                },
                success: {
                    style: {
                        background: "#052e16",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                    },
                    duration: 3000,
                },
                error: {
                    style: {
                        background: "#450a0a",
                        border: "1px solid rgba(239, 68, 68, 0.25)",
                    },
                    duration: 5000,
                },
            }}
        />
    );
}
