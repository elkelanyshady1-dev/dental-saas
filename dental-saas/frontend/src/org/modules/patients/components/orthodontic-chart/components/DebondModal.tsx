/**
 * DebondModal.tsx
 * Domain: orthodontics / bonding lifecycle
 * Layer: Frontend > Components
 *
 * Shown when clinician marks a tooth as "Debonded" via the right-click popup.
 * Gives three choices:
 *   1. Rebond Now  — bracket immediately re-placed this visit
 *   2. Add TODO    — schedule rebond for next visit (creates BOND_BRACKET todo)
 *   3. Cancel      — dismiss without recording anything
 */

import React from "react";
import { motion } from "motion/react";
import { RotateCcw, ListTodo, X } from "lucide-react";

// ── Props ─────────────────────────────────────────────────────────────────────

interface DebondModalProps {
  toothId:     number;
  onRebondNow: () => void;
  onAddTodo:   () => void;
  onCancel:    () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DebondModal({
  toothId,
  onRebondNow,
  onAddTodo,
  onCancel,
}: DebondModalProps) {
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.92, y: 12  }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xs mx-4 overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <X className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-0.5">
              Bracket Debonded
            </p>
            <h3 className="text-sm font-bold text-slate-800">Tooth {toothId} debonded</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">What would you like to do?</p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Options ── */}
        <div className="p-4 space-y-2">
          {/* Rebond Now */}
          <button
            onClick={onRebondNow}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold">Rebond Now</p>
              <p className="text-[10px] text-blue-500 mt-0.5">
                Bracket re-placed during this visit
              </p>
            </div>
          </button>

          {/* Add TODO Reminder */}
          <button
            onClick={onAddTodo}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <ListTodo className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold">Add TODO Reminder</p>
              <p className="text-[10px] text-amber-500 mt-0.5">
                Schedule rebond for the next visit
              </p>
            </div>
          </button>

          {/* Cancel */}
          <button
            onClick={onCancel}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-100 text-slate-500 text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
