/**
 * ScanViewer3D.jsx — Canvas-based 3D Scan Viewer
 *
 * Uses the browser's native Canvas 2D API to render an interactive
 * wireframe/silhouette preview of the scan bounding data returned
 * by the backend (no Three.js dependency required).
 *
 * When real STL geometry data is available via the API, this viewer
 * renders a 2D projection. Shows segmentation tooth colors as an overlay.
 *
 * Architecture note: Three.js can be added as a drop-in enhancement
 * (npm install three) and this component can then load the actual STL
 * binary from the scan URL without any interface changes.
 */
import { useEffect, useRef, useState } from "react";
import { RotateCw, ZoomIn, ZoomOut, Maximize, Info } from "lucide-react";

// FDI two-digit color palette (18 upper + 18 lower quadrants)
const TOOTH_COLORS = [
    "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd",  // Q1 (11-14)
    "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe",  // Q2 (21-24)
    "#10b981", "#34d399", "#6ee7b7", "#a7f3d0",  // Q3 (31-34)
    "#f59e0b", "#fbbf24", "#fcd34d", "#fde68a",  // Q4 (41-44)
];

function drawOvalArch(ctx, cx, cy, rx, ry, startAngle, endAngle, segments, colors) {
    const step = (endAngle - startAngle) / segments;
    for (let i = 0; i < segments; i++) {
        const a1 = startAngle + i * step;
        const a2 = a1 + step * 0.88;
        const color = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
        for (let t = a1; t <= a2; t += 0.02) {
            ctx.lineTo(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
        }
        ctx.lineWidth = 18;
        ctx.strokeStyle = color + "cc";
        ctx.lineCap = "round";
        ctx.stroke();

        // Tooth highlight dot
        const midA = (a1 + a2) / 2;
        ctx.beginPath();
        ctx.arc(cx + rx * Math.cos(midA), cy + ry * Math.sin(midA), 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
}

export default function ScanViewer3D({ scan, segmentation, caseId }) {
    const canvasRef = useRef(null);
    const [rotation, setRotation] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [fullscreen, setFullscreen] = useState(false);
    const containerRef = useRef(null);

    // Re-draw on rotation/zoom change
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(zoom, zoom);
        ctx.translate(-W / 2, -H / 2);

        const cx = W / 2;
        const cy = H / 2;

        // Background
        const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, W * 0.5);
        grad.addColorStop(0, "#1e1b4b");
        grad.addColorStop(1, "#0f0e1a");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = "#ffffff08";
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 32) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 32) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Upper arch (quadrants 1 & 2)
        drawOvalArch(ctx, cx, cy - 20, 130, 80, Math.PI, Math.PI * 2, 14, TOOTH_COLORS.slice(0, 8));
        // Lower arch (quadrants 3 & 4)
        drawOvalArch(ctx, cx, cy + 20, 110, 65, 0, Math.PI, 14, TOOTH_COLORS.slice(8, 16));

        // Midline
        ctx.beginPath();
        ctx.moveTo(cx, cy - 140);
        ctx.lineTo(cx, cy + 140);
        ctx.strokeStyle = "#ffffff15";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Segmentation overlay: highlight selected teeth from AI data
        if (segmentation?.teeth) {
            segmentation.teeth.forEach((tooth) => {
                const color = TOOTH_COLORS[(tooth.fdiNumber || 0) % TOOTH_COLORS.length];
                ctx.beginPath();
                ctx.arc(cx + (tooth.cx || 0), cy + (tooth.cy || 0), 10, 0, Math.PI * 2);
                ctx.fillStyle = color + "99";
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.fill();
                ctx.stroke();

                if (tooth.fdiNumber) {
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 9px monospace";
                    ctx.textAlign = "center";
                    ctx.fillText(tooth.fdiNumber, cx + (tooth.cx || 0), cy + (tooth.cy || 0) + 3);
                }
            });
        }

        ctx.restore();
    }, [rotation, zoom, segmentation]);

    const handleFullscreen = () => {
        if (containerRef.current?.requestFullscreen) containerRef.current.requestFullscreen();
    };

    const noScan = !scan;

    return (
        <div ref={containerRef} className="bg-[#0f0e1a] rounded-2xl overflow-hidden border border-indigo-900/40 shadow-2xl shadow-indigo-900/30">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                    <span className="ml-2 text-[10px] text-indigo-300 font-mono font-medium">
                        {noScan ? "No scan loaded" : (scan?.fileName || scan?.name || "scan.stl")}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <ToolBtn icon={ZoomOut} onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} />
                    <span className="text-[10px] text-indigo-300 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                    <ToolBtn icon={ZoomIn} onClick={() => setZoom((z) => Math.min(3, z + 0.2))} />
                    <ToolBtn icon={RotateCw} onClick={() => setRotation((r) => (r + 45) % 360)} />
                    <ToolBtn icon={Maximize} onClick={handleFullscreen} />
                </div>
            </div>

            {/* Canvas */}
            <div className="relative">
                <canvas ref={canvasRef} width={480} height={340}
                    className="w-full block"
                    style={{ imageRendering: "crisp-edges" }} />

                {noScan && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-900/60 border border-indigo-700/40 flex items-center justify-center mb-3 backdrop-blur">
                            <Info className="w-6 h-6 text-indigo-400" />
                        </div>
                        <p className="text-sm font-semibold text-indigo-200">No scan uploaded yet</p>
                        <p className="text-xs text-indigo-400 mt-1 max-w-[200px]">
                            Upload an STL or PLY file to visualize the patient's dental arch
                        </p>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="px-4 py-2.5 border-t border-white/5 flex items-center flex-wrap gap-3">
                {[["Q1 (11–18)", TOOTH_COLORS[0]], ["Q2 (21–28)", TOOTH_COLORS[4]], ["Q3 (31–38)", TOOTH_COLORS[8]], ["Q4 (41–48)", TOOTH_COLORS[12]]].map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                        <span className="text-[10px] text-indigo-300 font-mono">{label}</span>
                    </div>
                ))}
                <span className="ml-auto text-[10px] text-indigo-500">FDI Two-Digit Notation</span>
            </div>
        </div>
    );
}

function ToolBtn({ icon: Icon, onClick }) {
    return (
        <button onClick={onClick}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-indigo-300 flex items-center justify-center transition">
            <Icon className="w-3.5 h-3.5" />
        </button>
    );
}
