/**
 * TodoSidebar.tsx
 * Domain: ortho-todos
 * Layer: Frontend > Components
 *
 * Right-side clinical TODO panel inside SnapshotEditor.
 * Displays pending/done todos, allows creating new ones, toggling status.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  AlertCircle,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  SkipForward,
  X,
} from "lucide-react";
import {
  useTodos,
  useCreateTodo,
  usePatchTodo,
  useDeleteTodo,
} from "../hooks/useTodos";
import type {
  TodoDTO,
  TodoType,
  TodoPriority,
  TodoClinicalPhase,
  CreateTodoPayload,
} from "../api/orthoTodo.api";

// ── Config ─────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TodoType, string> = {
  BRACKET_REPOSITION:    "Bracket Reposition",
  BOND_BRACKET:          "Bond Bracket",
  WIRE_BEND:             "Wire Bend",
  OCCLUSAL_ADJUSTMENT:   "Occlusal Adjust",
  MINISCREW_REINSERTION: "Miniscrew Reinsertion",
};

const TYPE_COLORS: Record<TodoType, string> = {
  BRACKET_REPOSITION:    "bg-purple-50 text-purple-700 border-purple-100",
  BOND_BRACKET:          "bg-blue-50 text-blue-700 border-blue-100",
  WIRE_BEND:             "bg-orange-50 text-orange-700 border-orange-100",
  OCCLUSAL_ADJUSTMENT:   "bg-teal-50 text-teal-700 border-teal-100",
  MINISCREW_REINSERTION: "bg-red-50 text-red-700 border-red-100",
};

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  high:   "text-red-600",
  medium: "text-amber-500",
  low:    "text-slate-400",
};

const PRIORITY_DOT: Record<TodoPriority, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-slate-300",
};

const PHASE_LABELS: Record<TodoClinicalPhase, string> = {
  LEVEL_ALIGNMENT:  "Level & Align",
  SPACE_MANAGEMENT: "Space Mgmt",
  FINISHING:        "Finishing",
};

const TODO_TYPE_OPTIONS: TodoType[] = [
  "BRACKET_REPOSITION",
  "BOND_BRACKET",
  "WIRE_BEND",
  "OCCLUSAL_ADJUSTMENT",
];

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface TodoSidebarProps {
  caseId:    string | null | undefined;
  patientId: string;
  visitId?:  string | null;
  /** Suggested todos from the chart engine (pending user acceptance) */
  suggestions?: Array<Omit<CreateTodoPayload, "caseId" | "patientId">>;
  onClearSuggestion?: (index: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TodoSidebar({
  caseId,
  patientId,
  visitId,
  suggestions = [],
  onClearSuggestion,
}: TodoSidebarProps) {
  const [showForm, setShowForm]         = useState(false);
  const [filterStatus, setFilterStatus] = useState<"pending" | "done" | "all">("pending");
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<{
    type:          TodoType;
    description:   string;
    tooth:         string;
    priority:      TodoPriority;
    clinicalPhase: TodoClinicalPhase | "";
  }>({
    type:          "WIRE_BEND",
    description:   "",
    tooth:         "",
    priority:      "medium",
    clinicalPhase: "",
  });

  const { data: todos = [], isLoading } = useTodos(
    caseId,
    filterStatus === "all" ? undefined : filterStatus,
  );

  const createMutation = useCreateTodo(caseId);
  const patchMutation  = usePatchTodo(caseId);
  const deleteMutation = useDeleteTodo(caseId);

  // ── Counts ──────────────────────────────────────────────────────────────────

  const pendingCount = todos.filter(t => t.status === "pending").length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCreate = () => {
    if (!caseId || !form.description.trim()) return;
    createMutation.mutate({
      caseId,
      patientId,
      visitId:       visitId ?? null,
      type:          form.type,
      description:   form.description.trim(),
      tooth:         form.tooth.trim() || null,
      clinicalPhase: (form.clinicalPhase || null) as TodoClinicalPhase | null,
      priority:      form.priority,
    }, {
      onSuccess: () => {
        setForm({ type: "WIRE_BEND", description: "", tooth: "", priority: "medium", clinicalPhase: "" });
        setShowForm(false);
      },
    });
  };

  const handleAcceptSuggestion = (s: Omit<CreateTodoPayload, "caseId" | "patientId">, index: number) => {
    if (!caseId) return;
    createMutation.mutate(
      { caseId, patientId, visitId: visitId ?? null, ...s },
      { onSuccess: () => onClearSuggestion?.(index) },
    );
  };

  const handleToggle = (todo: TodoDTO) => {
    patchMutation.mutate({
      id:      todo.id,
      payload: { status: todo.status === "pending" ? "done" : "pending" },
    });
  };

  const handleSkip = (todo: TodoDTO) => {
    patchMutation.mutate({ id: todo.id, payload: { status: "skipped" } });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Clinical TODOs
          </span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              {pendingCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      {/* ── Suggestions from chart ── */}
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-amber-100"
          >
            <div className="px-4 py-2 bg-amber-50">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mb-2">
                Chart Suggestions
              </p>
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-amber-200">
                    <Zap className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-slate-700 leading-tight">{s.description}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{TYPE_LABELS[s.type]}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleAcceptSuggestion(s, i)}
                        disabled={createMutation.isPending}
                        className="p-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 transition-colors"
                        title="Accept"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onClearSuggestion?.(i)}
                        className="p-1 bg-slate-50 text-slate-400 rounded hover:bg-slate-100 transition-colors"
                        title="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create Form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-slate-100 overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2.5 bg-slate-50">
              {/* Type */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as TodoType }))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
                >
                  {TODO_TYPE_OPTIONS.map(t => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Description *</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Apply mesial-in bend on 21"
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 resize-none focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* Tooth + Priority row */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Tooth</label>
                  <input
                    type="text"
                    value={form.tooth}
                    onChange={e => setForm(f => ({ ...f, tooth: e.target.value }))}
                    placeholder="e.g. 21"
                    maxLength={6}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as TodoPriority }))}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!form.description.trim() || createMutation.isPending}
                  className="flex-1 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {createMutation.isPending ? "Saving…" : "Save TODO"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 text-slate-500 text-[10px] font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Status filter tabs ── */}
      <div className="flex border-b border-slate-100">
        {(["pending", "done", "all"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
              filterStatus === s
                ? "text-blue-600 border-b-2 border-blue-600 -mb-px"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Todo List ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-[10px] text-slate-400 font-medium">
              {filterStatus === "pending" ? "No pending todos" : "No todos found"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {todos.map(todo => (
              <TodoItem
                key={todo.id}
                todo={todo}
                expanded={expandedId === todo.id}
                onExpand={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
                onToggle={() => handleToggle(todo)}
                onSkip={() => handleSkip(todo)}
                onDelete={() => deleteMutation.mutate(todo.id)}
                isPending={patchMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Todo Item ──────────────────────────────────────────────────────────────────

interface TodoItemProps {
  todo:      TodoDTO;
  expanded:  boolean;
  onExpand:  () => void;
  onToggle:  () => void;
  onSkip:    () => void;
  onDelete:  () => void;
  isPending: boolean;
}

function TodoItem({ todo, expanded, onExpand, onToggle, onSkip, onDelete, isPending }: TodoItemProps) {
  const isDone    = todo.status === "done";
  const isSkipped = todo.status === "skipped";

  return (
    <div className={`px-3 py-2.5 hover:bg-slate-50 transition-colors ${isDone || isSkipped ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-2">
        {/* Status toggle */}
        <button
          onClick={onToggle}
          disabled={isPending || isSkipped}
          className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors disabled:cursor-not-allowed"
        >
          {isDone ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {/* Priority dot */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[todo.priority]}`} />
            {/* Type badge */}
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${TYPE_COLORS[todo.type]}`}>
              {TYPE_LABELS[todo.type]}
            </span>
            {/* Tooth */}
            {todo.tooth && (
              <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                #{todo.tooth}
              </span>
            )}
          </div>

          <p className={`text-xs leading-snug ${isDone ? "line-through text-slate-400" : "text-slate-700"}`}>
            {todo.description}
          </p>

          {/* Expand toggle */}
          <button
            onClick={onExpand}
            className="mt-1 text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5 transition-colors"
          >
            {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            {expanded ? "less" : "more"}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1 pt-2 border-t border-slate-100">
                  {todo.clinicalPhase && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-slate-400">Phase:</span>
                      <span className="text-[9px] font-semibold text-indigo-600">
                        {PHASE_LABELS[todo.clinicalPhase]}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-400">Priority:</span>
                    <span className={`text-[9px] font-semibold ${PRIORITY_COLORS[todo.priority]}`}>
                      {todo.priority}
                    </span>
                  </div>
                  {todo.completedAt && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-slate-400">Done:</span>
                      <span className="text-[9px] text-slate-500">
                        {new Date(todo.completedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  )}
                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1">
                    {!isSkipped && !isDone && (
                      <button
                        onClick={onSkip}
                        disabled={isPending}
                        className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-slate-500 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                      >
                        <SkipForward className="w-2.5 h-2.5" />
                        Skip
                      </button>
                    )}
                    <button
                      onClick={onDelete}
                      disabled={isPending}
                      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-red-500 border border-red-100 rounded hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
