/**
 * RTLToggle.jsx — Language / Direction Toggle Control
 *
 * User-level EN/AR toggle that switches document direction
 * between LTR and RTL. Persists preference in localStorage.
 *
 * TASK-FE-AUTH-INT-008
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Languages } from "lucide-react";

const STORAGE_KEY = "dental-saas-dir-pref";

export default function RTLToggle({ onChange }) {
    const [direction, setDirection] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved || document.documentElement.dir || "ltr";
    });

    // Apply direction on mount and change
    useEffect(() => {
        document.documentElement.dir = direction;
        document.documentElement.lang = direction === "rtl" ? "ar" : "en";
        localStorage.setItem(STORAGE_KEY, direction);
        onChange?.(direction);
    }, [direction, onChange]);

    const toggle = useCallback(() => {
        setDirection((d) => (d === "ltr" ? "rtl" : "ltr"));
    }, []);

    const isRTL = direction === "rtl";

    return (
        <button
            onClick={toggle}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 10,
                border: `1px solid ${isRTL ? "#BBF7D0" : "#E2E8F0"}`,
                background: isRTL ? "#ECFDF5" : "#fff",
                fontSize: 11,
                fontWeight: 700,
                color: isRTL ? "#059669" : "#64748B",
                cursor: "pointer",
                transition: "all 0.2s",
                position: "relative",
                overflow: "hidden",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
            }}
            title={isRTL ? "Switch to English (LTR)" : "Switch to Arabic (RTL)"}
        >
            <Languages size={12} />
            <span
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                }}
            >
                <span
                    style={{
                        fontWeight: !isRTL ? 900 : 500,
                        color: !isRTL ? "#0F172A" : "#94A3B8",
                        transition: "all 0.15s",
                    }}
                >
                    EN
                </span>
                <span style={{ color: "#CBD5E1", fontSize: 10 }}>/</span>
                <span
                    style={{
                        fontWeight: isRTL ? 900 : 500,
                        color: isRTL ? "#059669" : "#94A3B8",
                        fontFamily: "'Noto Sans Arabic', sans-serif",
                        transition: "all 0.15s",
                    }}
                >
                    AR
                </span>
            </span>

            {/* Active indicator pill */}
            <div
                style={{
                    position: "absolute",
                    bottom: 0,
                    insetInlineStart: isRTL ? "auto" : 0,
                    insetInlineEnd: isRTL ? 0 : "auto",
                    width: "50%",
                    height: 2,
                    background: isRTL ? "#059669" : "#2563EB",
                    borderRadius: "2px 2px 0 0",
                    transition: "all 0.2s",
                }}
            />
        </button>
    );
}
