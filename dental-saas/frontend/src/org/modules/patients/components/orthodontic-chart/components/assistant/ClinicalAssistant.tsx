/**
 * ClinicalAssistant.tsx — Floating AI Clinical Command Assistant (V1)
 *
 * Entry point component. Renders:
 *   1. Floating Action Button (FAB) — bottom-right corner
 *   2. AssistantPanel (slide-in) — when FAB is activated
 *
 * ════════════════════════════════════════════════════════════════════════════
 * INTEGRATION:
 *   Mount inside SnapshotEditor.tsx, passing the dispatch + chart state:
 *
 *   <ClinicalAssistant
 *     dispatch={dispatch}
 *     chartState={chartStateForGuard}
 *     saveToHistory={saveToHistory}
 *     logAction={logAction}
 *     onAddNote={(text) => setNotes(n => n + '\n' + text)}
 *   />
 *
 * ════════════════════════════════════════════════════════════════════════════
 * RULES (enforced here):
 *   - NO execution without preview  → engine.status must be 'preview' before execute()
 *   - NO direct state mutation      → all actions go through dispatchClinicalAction
 *   - NO bypass of clinicalActionGuard → useCommandEngine calls checkDuplicateAction
 *
 * ════════════════════════════════════════════════════════════════════════════
 * KEYBOARD:
 *   Escape → close panel
 *   Ctrl+K → toggle panel (global shortcut)
 */

import React, { useState, useEffect, useCallback } from 'react';
import AssistantPanel from './AssistantPanel';
import { useCommandEngine } from '../../assistant/useCommandEngine';
import type { CommandEngineOptions } from '../../assistant/useCommandEngine';

// Inject CSS keyframes once
const KEYFRAMES_ID = 'clinical-assistant-keyframes';
function ensureKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes ca-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4), 0 8px 24px rgba(99, 102, 241, 0.3); }
      50%       { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.0), 0 8px 24px rgba(99, 102, 241, 0.3); }
    }
    @keyframes ca-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ca-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0; }
    }
    @keyframes ca-pulse-rec {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50%       { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
    }
    * { scroll-behavior: smooth; }
    #ca-mic-btn:hover { background: rgba(99, 102, 241, 0.25) !important; }
    #ca-chip:hover    { background: rgba(99, 102, 241, 0.22) !important; border-color: rgba(99, 102, 241, 0.45) !important; }
    #ca-confirm:hover:not(:disabled) { filter: brightness(1.1); transform: scale(1.02); }
    #ca-cancel:hover  { border-color: rgba(255,255,255,0.2) !important; color: #cbd5e1 !important; }
  `;
  document.head.appendChild(style);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClinicalAssistantProps = Omit<CommandEngineOptions, 'onAddNote'> & {
  onAddNote?: (text: string) => void;
  caseId?: string | null;
  patientId?: string | null;
  /** Override FAB position. Defaults to bottom-right. */
  position?: {
    bottom?: string;
    right?:  string;
    left?:   string;
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClinicalAssistant({
  dispatch,
  chartState,
  saveToHistory,
  logAction,
  onAddNote,
  visitId,
  visitStatus,
  caseId,
  patientId,
  position = { bottom: '24px', right: '24px' },
}: ClinicalAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    ensureKeyframes();
    setMounted(true);
  }, []);

  // ── Engine ────────────────────────────────────────────────────────────────
  const engine = useCommandEngine({
    dispatch,
    chartState,
    saveToHistory,
    logAction,
    onAddNote,
    visitId,
    visitStatus,
    caseId,
    patientId,
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K → toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(o => !o);
      }
      // Escape → close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        engine.reset();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, engine]);

  const close = useCallback(() => {
    setIsOpen(false);
    engine.reset();
  }, [engine]);

  if (!mounted) return null;

  // Badge count: number of pending actions in preview
  const pendingCount =
    engine.status === 'preview'
      ? engine.validations.filter(v => !v.isDuplicate).length
      : 0;

  return (
    <>
      {/* ── Floating Action Button ──────────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          ...fabStyle,
          bottom:    position.bottom ?? '24px',
          right:     position.right,
          left:      position.left,
          animation: isOpen ? 'none' : 'ca-pulse 3s ease-in-out infinite',
          background: isOpen
            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        }}
        aria-label={isOpen ? 'Close Clinical Assistant' : 'Open Clinical Assistant (Ctrl+K)'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={isOpen ? 'Close (Esc)' : 'Clinical Assistant (Ctrl+K)'}
      >
        {/* Icon */}
        {isOpen ? <CloseSparkIcon /> : <SparkIcon />}

        {/* Tooltip label */}
        {!isOpen && (
          <span style={fabLabel} aria-hidden="true">
            Assistant
          </span>
        )}

        {/* Pending badge */}
        {pendingCount > 0 && (
          <span
            style={fabBadge}
            aria-label={`${pendingCount} pending actions`}
          >
            {pendingCount}
          </span>
        )}
      </button>

      {/* ── Assistant Panel ─────────────────────────────────────── */}
      {isOpen && (
        <AssistantPanel
          engine={engine}
          chartState={chartState}
          onClose={close}
        />
      )}
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L13.09 8.26L19 6L14.74 10.91L21 12L14.74 13.09L19 19L13.09 15.74L12 22L10.91 15.74L5 19L9.26 14.09L3 12L9.26 10.91L5 6L10.91 8.26L12 2Z"/>
    </svg>
  );
}

function CloseSparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ─── FAB Styles (kept out of inline for reuse) ────────────────────────────────

const fabStyle: React.CSSProperties = {
  position:        'fixed',
  zIndex:          9997,
  width:           '56px',
  height:          '56px',
  borderRadius:    '50%',
  border:          'none',
  color:           '#fff',
  cursor:          'pointer',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  boxShadow:       '0 8px 24px rgba(99, 102, 241, 0.3)',
  transition:      'transform 0.2s ease, background 0.2s ease',
  outline:         'none',
};

const fabLabel: React.CSSProperties = {
  position:    'absolute',
  bottom:      '-22px',
  left:        '50%',
  transform:   'translateX(-50%)',
  fontSize:    '10px',
  color:       '#818cf8',
  fontFamily:  'Inter, system-ui, sans-serif',
  fontWeight:  600,
  letterSpacing:'0.05em',
  textTransform:'uppercase',
  whiteSpace:  'nowrap',
  pointerEvents:'none',
};

const fabBadge: React.CSSProperties = {
  position:    'absolute',
  top:         '-2px',
  right:       '-2px',
  width:       '18px',
  height:      '18px',
  borderRadius:'50%',
  background:  '#f59e0b',
  color:       '#0f0f1a',
  fontSize:    '11px',
  fontWeight:  700,
  fontFamily:  'Inter, system-ui, sans-serif',
  display:     'flex',
  alignItems:  'center',
  justifyContent:'center',
  border:      '2px solid rgba(15, 15, 26, 0.9)',
};
