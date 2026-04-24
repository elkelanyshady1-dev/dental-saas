/**
 * OrthoNoe brand mark — tooth silhouette woven with a neural-network motif.
 * Colors map to the brand palette: Vibrant Medical Blue (#2563EB)
 * and Deep Clinical Navy (#004AC6).
 *
 * Variants:
 *   - "gradient" (default): blue-to-navy gradient on white/light surfaces.
 *   - "mono-light": single color (use on dark surfaces, e.g. footer).
 *   - "mono-dark": single color (use on light surfaces).
 */
import { useId } from "react";

export default function OrthoNoeLogo({
    className = "w-8 h-8",
    variant = "gradient",
    title = "OrthoNoe"
}) {
    const instanceId = useId().replace(/:/g, "");
    const gradientId = `orthoNoeBrandGradient-${instanceId}`;

    let strokeColor;
    let nodeColor;
    if (variant === "mono-light") {
        strokeColor = "#FFFFFF";
        nodeColor = "#FFFFFF";
    } else if (variant === "mono-dark") {
        strokeColor = "#004AC6";
        nodeColor = "#004AC6";
    } else {
        strokeColor = `url(#${gradientId})`;
        nodeColor = "#2563EB";
    }

    return (
        <svg
            viewBox="0 0 64 64"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            role="img"
            aria-label={title}
        >
            {variant === "gradient" && (
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2563EB" />
                        <stop offset="100%" stopColor="#004AC6" />
                    </linearGradient>
                </defs>
            )}

            {/* Tooth outline */}
            <path
                d="M20 6c-6 0-11 4.5-11 11 0 4.5 1.5 7.5 3 11 1.5 3.5 2.5 7 3 11 .5 4 1 8 2 12 .8 3.2 2 5 4 5 2.5 0 3.5-2.5 4.5-7 1-4.5 1.5-9 4.5-9s3.5 4.5 4.5 9c1 4.5 2 7 4.5 7 2 0 3.2-1.8 4-5 1-4 1.5-8 2-12 .5-4 1.5-7.5 3-11 1.5-3.5 3-6.5 3-11 0-6.5-5-11-11-11-3.5 0-5.5 1.5-7 3-1.5 1.5-3 3-6 3s-4.5-1.5-6-3c-1.5-1.5-3.5-3-7-3z"
                fill="none"
                stroke={strokeColor}
                strokeWidth="2.5"
                strokeLinejoin="round"
            />

            {/* Neural network connections */}
            <g
                stroke={strokeColor}
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
                opacity="0.9"
            >
                <line x1="22" y1="20" x2="32" y2="14" />
                <line x1="22" y1="20" x2="18" y2="32" />
                <line x1="22" y1="20" x2="32" y2="28" />
                <line x1="32" y1="14" x2="42" y2="20" />
                <line x1="42" y1="20" x2="32" y2="28" />
                <line x1="42" y1="20" x2="46" y2="32" />
                <line x1="32" y1="28" x2="18" y2="32" />
                <line x1="32" y1="28" x2="46" y2="32" />
                <line x1="32" y1="28" x2="26" y2="42" />
                <line x1="32" y1="28" x2="38" y2="42" />
                <line x1="18" y1="32" x2="26" y2="42" />
                <line x1="46" y1="32" x2="38" y2="42" />
            </g>

            {/* Nodes */}
            <g fill={nodeColor}>
                <circle cx="22" cy="20" r="2.2" />
                <circle cx="32" cy="14" r="2.2" />
                <circle cx="42" cy="20" r="2.2" />
                <circle cx="18" cy="32" r="2.2" />
                <circle cx="32" cy="28" r="2.6" />
                <circle cx="46" cy="32" r="2.2" />
                <circle cx="26" cy="42" r="2.2" />
                <circle cx="38" cy="42" r="2.2" />
            </g>
        </svg>
    );
}
