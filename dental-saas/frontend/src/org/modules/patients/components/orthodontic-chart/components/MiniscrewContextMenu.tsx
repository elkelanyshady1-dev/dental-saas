/**
 * MiniscrewContextMenu.tsx
 * Domain: orthodontics / TAD engine
 * Layer: Frontend > Components
 *
 * Floating right-click context menu for placed miniscrews (TADs).
 * Options: Mark Healing | Record Failure | Remove
 *
 * UX rules:
 *   - Appears at cursor position, clamped to viewport
 *   - Auto-dismisses on outside click or Esc
 *   - Non-blocking — never freezes chart interactions
 *
 * Visual status mapping (Part 5):
 *   active   → blue
 *   healing  → yellow / amber
 *   failed   → red
 *   removed  → gray
 */

import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Heart, AlertTriangle, Trash2, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MiniscrewStatus = "active" | "healing" | "failed" | "removed";

export interface MiniscrewContextMenuProps {
  tadId:          string;
  position:       { x: number; y: number };
  currentStatus?: MiniscrewStatus;
  onHeal:         () => void;
  onFail:         () => void;
  onRemove:       () => void;
  onClose:        () => void;
}

// ── Status color map (Part 5) ─────────────────────────────────────────────────

export const MINISCREW_STATUS_COLOR: Record<MiniscrewStatus, string> = {
  active:  "#3b82f6", // blue-500
  healing: "#f59e0b", // amber-500
  failed:  "#ef4444", // red-500
  removed: "#94a3b8", // slate-400
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MiniscrewContextMenu({
  tadId,
  position,
  currentStatus = "active",
  onHeal,
  onFail,
  onRemove,
  onClose,
}: MiniscrewContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp to viewport
  const W = 192;
  const H = 180;
  const safeX = Math.min(position.x, window.innerWidth  - W - 8);
  const safeY = Math.min(position.y, window.innerHeight - H - 8);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 80);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const statusColor = MINISCREW_STATUS_COLOR[currentStatus];

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1,    y: 0  }}
      exit={{   opacity: 0, scale: 0.92, y: -4  }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      className="fixed z-[9999] select-none"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        className="w-48 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 16px 32px -8px rgba(0,0,0,0.18), 0 2px 8px -2px rgba(0,0,0,0.10)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-slate-100"
          style={{ background: `${statusColor}15` }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: statusColor }}
            />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: statusColor }}>
              Miniscrew
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-slate-500 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Menu items */}
        <div className="py-1">
          {/* Healing */}
          <button
            onClick={onHeal}
            disabled={currentStatus === "healing"}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors
              ${currentStatus === "healing"
                ? "opacity-40 cursor-not-allowed text-amber-600"
                : "text-amber-600 hover:bg-amber-50"
              }`}
          >
            <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
              <Heart className="w-3 h-3 text-amber-500" />
            </div>
            Mark Healing
          </button>

          {/* Failure */}
          <button
            onClick={onFail}
            disabled={currentStatus === "failed" || currentStatus === "removed"}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors
              ${currentStatus === "failed" || currentStatus === "removed"
                ? "opacity-40 cursor-not-allowed text-red-600"
                : "text-red-600 hover:bg-red-50"
              }`}
          >
            <div className="w-5 h-5 rounded-md bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-3 h-3 text-red-500" />
            </div>
            Record Failure
          </button>

          <div className="h-px bg-slate-100 mx-2 my-1" />

          {/* Remove */}
          <button
            onClick={onRemove}
            disabled={currentStatus === "removed"}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors
              ${currentStatus === "removed"
                ? "opacity-40 cursor-not-allowed text-slate-500"
                : "text-slate-600 hover:bg-slate-50"
              }`}
          >
            <div className="w-5 h-5 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
              <Trash2 className="w-3 h-3 text-slate-400" />
            </div>
            Remove
          </button>
        </div>
      </div>
    </motion.div>
  );
}
