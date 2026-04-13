/**
 * AuthSummaryCard.jsx — Authorization Analytics Summary Card
 *
 * Premium stat card with icon, trend indicator, animated value.
 * Used in the top summary strip of AuthAnalyticsPage.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function AuthSummaryCard({
    title,
    value,
    trend,
    trendLabel,
    icon: Icon,
    color = "#2563EB",
    bg = "#EFF6FF",
}) {
    const trendColor =
        trend > 0 ? "#10B981" : trend < 0 ? "#EF4444" : "#94A3B8";
    const TrendIcon =
        trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

    return (
        <div
            className="group relative overflow-hidden"
            style={{
                background: "#fff",
                borderRadius: 20,
                border: "1px solid #E2E8F0",
                padding: "24px 28px",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "default",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                    "0 8px 30px rgba(0,0,0,0.08)";
                e.currentTarget.style.borderColor = color + "40";
                e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.transform = "translateY(0)";
            }}
        >
            {/* Decorative gradient strip */}
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    insetInlineStart: 0,
                    width: 4,
                    height: "100%",
                    background: `linear-gradient(180deg, ${color}, ${color}60)`,
                    borderRadius: "20px 0 0 20px",
                }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                {/* Icon */}
                <div
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: bg,
                        color: color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    {Icon && <Icon size={22} />}
                </div>

                {/* Trend badge */}
                {trend !== undefined && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 10px",
                            borderRadius: 10,
                            background: trendColor + "12",
                            color: trendColor,
                            fontSize: 11,
                            fontWeight: 700,
                        }}
                    >
                        <TrendIcon size={12} />
                        {Math.abs(trend)}%
                    </div>
                )}
            </div>

            {/* Label */}
            <p
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    margin: "16px 0 6px",
                }}
            >
                {title}
            </p>

            {/* Value */}
            <span
                style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#0F172A",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                }}
            >
                {value}
            </span>

            {/* Trend Label */}
            {trendLabel && (
                <p
                    style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#94A3B8",
                        marginTop: 6,
                    }}
                >
                    {trendLabel}
                </p>
            )}
        </div>
    );
}
