/**
 * AssistantPanel.tsx — Clinical Assistant Slide-In Panel
 *
 * Frosted-glass, dark-themed panel containing:
 *   1. Header with title + close button
 *   2. CommandInput (text + voice)
 *   3. PreviewModal (recognized commands or fallback)
 *   4. Status feedback (success / error)
 *
 * All state is managed by useCommandEngine (passed from ClinicalAssistant.tsx).
 */

import React, { useState, useEffect } from 'react';
import CommandInput from './CommandInput';
import PreviewModal from './PreviewModal';
import type { UseCommandEngineReturn } from '../../assistant/useCommandEngine';
import type { ClinicalState } from '../../utils/clinicalActionGuard';
import { useSuggestions } from '../../assistant/useSuggestions';
import { useUsageLearning } from '../../assistant/useUsageLearning';

interface AssistantPanelProps {
  engine: UseCommandEngineReturn;
  chartState: ClinicalState;
  onClose: () => void;
}

export default function AssistantPanel({ engine, chartState, onClose }: AssistantPanelProps) {
  const [input, setInput] = useState('');
  const [visible, setVisible] = useState(false);
  const { recordUsage } = useUsageLearning();
  const suggestions = useSuggestions(input, chartState);

  // Animate in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleSubmit = (text: string) => {
    engine.parse(text);
  };

  const handleChange = (text: string) => {
    setInput(text);
    // Reset preview if user edits after parsing
    if (engine.status === 'preview' || engine.status === 'fallback') {
      engine.reset();
    }
  };

  const handleSuggestion = (example: string) => {
    setInput(example);
    engine.parse(example);
  };

  const handleConfirm = () => {
    if (engine.parseResult && engine.parseResult.recognized) {
      recordUsage(engine.parseResult.commandName);
    }
    engine.execute();
    setInput('');
  };

  const handleCancel = () => {
    engine.reset();
    setInput('');
  };

  const handleAddNote = () => {
    engine.addAsNote();
    setInput('');
  };

  const isPanelBusy = engine.status === 'executing';
  const showPreview = engine.status === 'preview' || engine.status === 'fallback';
  const showSuccess = engine.status === 'success';
  const showError   = engine.status === 'error';

  return (
    <>
      {/* Backdrop */}
      <div style={s.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Clinical Assistant"
        aria-modal="true"
        style={{
          ...s.panel,
          opacity:   visible ? 1 : 0,
          transform: visible ? 'translateX(0)' : 'translateX(24px)',
        }}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.headerIcon} aria-hidden="true">✦</span>
            <div>
              <div style={s.headerTitle}>
                Clinical Assistant
                <span style={s.betaBadge}>β</span>
              </div>
              <div style={s.headerSub}>Type or speak a clinical command</div>
            </div>
          </div>
          <button onClick={onClose} style={s.closeBtn} aria-label="Close assistant" title="Close">
            <CloseIcon />
          </button>
        </div>

        <div style={s.divider} aria-hidden="true" />

        {/* ── Input ────────────────────────────────────────────── */}
        <div style={s.section}>
          <CommandInput
            value={input}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onSuggestion={handleSuggestion}
            suggestions={suggestions}
            disabled={isPanelBusy}
            autoFocus
          />
        </div>

        {/* ── Preview / Fallback ───────────────────────────────── */}
        {showPreview && (
          <div style={s.section}>
            <PreviewModal
              parseResult={engine.parseResult}
              validations={engine.validations}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onAddNote={handleAddNote}
              isExecuting={isPanelBusy}
            />
          </div>
        )}

        {/* ── Success feedback ─────────────────────────────────── */}
        {showSuccess && (
          <div style={s.successBanner} role="status" aria-live="polite">
            <span aria-hidden="true">✓</span>
            {engine.lastExecuted
              ? `Done — ${engine.lastExecuted}`
              : 'Action applied successfully'}
          </div>
        )}

        {/* ── Error feedback ───────────────────────────────────── */}
        {showError && (
          <div style={s.errorBanner} role="alert">
            <span aria-hidden="true">⚠</span>
            {engine.error ?? 'Something went wrong'}
            <button onClick={engine.reset} style={s.retryBtn}>Retry</button>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
        <div style={s.footer}>
          <span style={s.footerText}>
            Powered by Clinical Engine V3
          </span>
          <span style={s.footerDot} aria-hidden="true">•</span>
          <span style={s.footerText}>
            {engine.status === 'idle' ? 'Ready' :
             engine.status === 'parsing' ? 'Parsing…' :
             engine.status === 'preview' ? 'Awaiting confirmation' :
             engine.status === 'executing' ? 'Executing…' :
             engine.status === 'success' ? 'Done ✓' :
             engine.status === 'error' ? 'Error' :
             engine.status === 'fallback' ? 'Unrecognized' : ''}
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position:   'fixed',
    inset:      0,
    zIndex:     9998,
    background: 'rgba(0, 0, 0, 0.3)',
    backdropFilter: 'blur(2px)',
  },
  panel: {
    position:        'fixed',
    right:           '80px',
    bottom:          '24px',
    width:           '400px',
    maxHeight:       '85vh',
    overflowY:       'auto',
    zIndex:          9999,
    background:      'rgba(15, 15, 26, 0.97)',
    backdropFilter:  'blur(20px)',
    border:          '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius:    '20px',
    boxShadow:       '0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
    display:         'flex',
    flexDirection:   'column',
    transition:      'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
    fontFamily:      'Inter, system-ui, sans-serif',
  },
  header: {
    display:        'flex',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    padding:        '18px 18px 0',
    gap:            '12px',
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '10px',
  },
  headerIcon: {
    fontSize:    '22px',
    background:  'linear-gradient(135deg, #6366f1, #8b5cf6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    lineHeight:  1,
    marginTop:   '2px',
    flexShrink:  0,
  },
  headerTitle: {
    fontSize:    '15px',
    fontWeight:  700,
    color:       '#e2e8f0',
    display:     'flex',
    alignItems:  'center',
    gap:         '6px',
    letterSpacing:'-0.01em',
  },
  betaBadge: {
    fontSize:    '10px',
    fontWeight:  700,
    color:       '#818cf8',
    background:  'rgba(99, 102, 241, 0.15)',
    border:      '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius:'10px',
    padding:     '1px 6px',
    letterSpacing:'0.03em',
  },
  headerSub: {
    fontSize:    '12px',
    color:       '#64748b',
    marginTop:   '2px',
  },
  closeBtn: {
    width:           '30px',
    height:          '30px',
    borderRadius:    '8px',
    background:      'transparent',
    border:          '1px solid rgba(255,255,255,0.08)',
    color:           '#64748b',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    cursor:          'pointer',
    transition:      'all 0.15s',
    flexShrink:      0,
  },
  divider: {
    height:     '1px',
    background: 'rgba(255,255,255,0.06)',
    margin:     '14px 0 0',
  },
  section: {
    padding: '14px 18px 0',
  },
  successBanner: {
    margin:        '14px 18px 0',
    padding:       '10px 14px',
    background:    'rgba(16, 185, 129, 0.12)',
    border:        '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius:  '10px',
    color:         '#6ee7b7',
    fontSize:      '13px',
    fontWeight:    600,
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
  },
  errorBanner: {
    margin:        '14px 18px 0',
    padding:       '10px 14px',
    background:    'rgba(239, 68, 68, 0.1)',
    border:        '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius:  '10px',
    color:         '#fca5a5',
    fontSize:      '13px',
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
  },
  retryBtn: {
    marginLeft:   'auto',
    background:   'transparent',
    border:       '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '6px',
    color:        '#fca5a5',
    fontSize:     '12px',
    padding:      '3px 10px',
    cursor:       'pointer',
  },
  footer: {
    display:        'flex',
    alignItems:     'center',
    gap:            '6px',
    padding:        '14px 18px',
    marginTop:      '4px',
    borderTop:      '1px solid rgba(255,255,255,0.04)',
  },
  footerText: {
    fontSize:   '11px',
    color:      '#334155',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  footerDot: {
    color: '#334155',
    fontSize: '11px',
  },
};
