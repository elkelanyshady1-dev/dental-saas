/**
 * PreviewModal.tsx — Clinical Command Preview Confirmation
 *
 * Shows the list of parsed actions with human-readable descriptions.
 * Requires explicit [Confirm] before execution.
 *
 * Also handles:
 *   - Duplicate warnings (action already in state)
 *   - Fallback "Add to Visit Notes?" for unrecognized commands
 */

import React from 'react';
import type { ValidationResult } from '../../assistant/useCommandEngine';
import type { CommandResult } from '../../assistant/commandParser';

interface PreviewModalProps {
  parseResult: CommandResult | null;
  validations: ValidationResult[];
  onConfirm: () => void;
  onCancel: () => void;
  onAddNote: () => void;
  isExecuting?: boolean;
}

export default function PreviewModal({
  parseResult,
  validations,
  onConfirm,
  onCancel,
  onAddNote,
  isExecuting,
}: PreviewModalProps) {
  if (!parseResult) return null;

  // ── Fallback: Unrecognized command ───────────────────────────────────────
  if (!parseResult.recognized) {
    return (
      <div style={s.card}>
        <div style={s.fallbackHeader}>
          <span style={s.fallbackIcon} aria-hidden="true">❓</span>
          <div>
            <div style={s.fallbackTitle}>Command not recognized</div>
            <div style={s.fallbackRaw}>"{parseResult.rawText}"</div>
          </div>
        </div>
        <div style={s.fallbackPrompt}>Add to Visit Notes instead?</div>
        <div style={s.actions}>
          <button onClick={onAddNote} style={s.btnNote} aria-label="Add to visit notes">
            Add Note
          </button>
          <button onClick={onCancel} style={s.btnCancel} aria-label="Cancel">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Preview: Recognized command ──────────────────────────────────────────
  const hasAnyNonDuplicate = validations.some(v => !v.isDuplicate);
  const allDuplicates      = validations.length > 0 && validations.every(v => v.isDuplicate);

  return (
    <div style={s.card} role="dialog" aria-label="Command preview" aria-modal="true">
      {/* Header */}
      <div style={s.previewHeader}>
        <span style={s.warningBadge} aria-hidden="true">⚠️</span>
        <span style={s.previewTitle}>Preview</span>
        <span style={s.commandIcon} aria-hidden="true">{parseResult.icon}</span>
        <span style={s.commandName}>{parseResult.commandName}</span>
      </div>

      {/* Action list */}
      <ul style={s.actionList} aria-label="Actions to execute">
        {validations.map((v, i) => (
          <li key={i} style={{ ...s.actionItem, ...(v.isDuplicate ? s.actionItemDupe : {}) }}>
            <span style={s.bullet} aria-hidden="true">•</span>
            <div style={s.actionContent}>
              <span style={v.isDuplicate ? s.actionDescDupe : s.actionDesc}>
                {v.action.description}
              </span>
              {v.isDuplicate && (
                <span style={s.dupeBadge} role="status">⚡ Already applied</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* All-duplicate warning */}
      {allDuplicates && (
        <div style={s.dupeWarning} role="alert">
          All actions are already applied in the current state.
        </div>
      )}

      {/* Actions */}
      <div style={s.actions}>
        <button
          onClick={onConfirm}
          disabled={!hasAnyNonDuplicate || isExecuting}
          style={{
            ...s.btnConfirm,
            ...(!hasAnyNonDuplicate || isExecuting ? s.btnDisabled : {}),
          }}
          aria-label="Confirm and execute"
          aria-busy={isExecuting}
        >
          {isExecuting ? (
            <span style={s.spinner} aria-hidden="true" />
          ) : (
            <CheckIcon />
          )}
          Confirm
        </button>
        <button onClick={onCancel} style={s.btnCancel} aria-label="Cancel">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card: {
    background:    'rgba(255, 255, 255, 0.04)',
    border:        '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius:  '12px',
    padding:       '14px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
    marginTop:     '4px',
  },
  // Preview header
  previewHeader: {
    display:    'flex',
    alignItems: 'center',
    gap:        '6px',
  },
  warningBadge: {
    fontSize: '15px',
  },
  previewTitle: {
    fontSize:   '12px',
    color:      '#f59e0b',
    fontWeight: 700,
    fontFamily: 'Inter, system-ui, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flex:       1,
  },
  commandIcon: {
    fontSize: '15px',
  },
  commandName: {
    fontSize:   '13px',
    color:      '#c4b5fd',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
  },
  // Action list
  actionList: {
    listStyle: 'none',
    margin:    0,
    padding:   0,
    display:   'flex',
    flexDirection: 'column',
    gap:       '6px',
  },
  actionItem: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '8px',
  },
  actionItemDupe: {
    opacity: 0.5,
  },
  bullet: {
    color:      '#818cf8',
    flexShrink: 0,
    marginTop:  '1px',
  },
  actionContent: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
  },
  actionDesc: {
    fontSize:   '13px',
    color:      '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  actionDescDupe: {
    fontSize:        '13px',
    color:           '#94a3b8',
    fontFamily:      'Inter, system-ui, sans-serif',
    textDecoration:  'line-through',
  },
  dupeBadge: {
    fontSize:    '11px',
    color:       '#f59e0b',
    fontFamily:  'Inter, system-ui, sans-serif',
  },
  dupeWarning: {
    fontSize:    '12px',
    color:       '#f87171',
    fontFamily:  'Inter, system-ui, sans-serif',
    background:  'rgba(239, 68, 68, 0.08)',
    borderRadius:'6px',
    padding:     '6px 10px',
  },
  // Fallback
  fallbackHeader: {
    display:    'flex',
    alignItems: 'flex-start',
    gap:        '10px',
  },
  fallbackIcon: {
    fontSize:   '20px',
    marginTop:  '1px',
    flexShrink: 0,
  },
  fallbackTitle: {
    fontSize:   '13px',
    color:      '#f87171',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 700,
  },
  fallbackRaw: {
    fontSize:   '12px',
    color:      '#94a3b8',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontStyle:  'italic',
    marginTop:  '2px',
  },
  fallbackPrompt: {
    fontSize:   '13px',
    color:      '#e2e8f0',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  // Buttons
  actions: {
    display: 'flex',
    gap:     '8px',
  },
  btnConfirm: {
    display:        'flex',
    alignItems:     'center',
    gap:            '6px',
    padding:        '8px 16px',
    borderRadius:   '8px',
    background:     'linear-gradient(135deg, #059669, #10b981)',
    border:         'none',
    color:          '#fff',
    fontSize:       '13px',
    fontFamily:     'Inter, system-ui, sans-serif',
    fontWeight:     600,
    cursor:         'pointer',
    transition:     'opacity 0.2s, transform 0.1s',
    boxShadow:      '0 2px 8px rgba(16, 185, 129, 0.25)',
  },
  btnNote: {
    display:        'flex',
    alignItems:     'center',
    gap:            '6px',
    padding:        '8px 16px',
    borderRadius:   '8px',
    background:     'transparent',
    border:         '1px solid rgba(139, 92, 246, 0.5)',
    color:          '#c4b5fd',
    fontSize:       '13px',
    fontFamily:     'Inter, system-ui, sans-serif',
    fontWeight:     600,
    cursor:         'pointer',
    transition:     'all 0.2s',
  },
  btnCancel: {
    padding:        '8px 14px',
    borderRadius:   '8px',
    background:     'transparent',
    border:         '1px solid rgba(255,255,255,0.1)',
    color:          '#94a3b8',
    fontSize:       '13px',
    fontFamily:     'Inter, system-ui, sans-serif',
    cursor:         'pointer',
    transition:     'all 0.2s',
  },
  btnDisabled: {
    opacity:  0.4,
    cursor:   'not-allowed',
    boxShadow:'none',
  },
  spinner: {
    width:         '12px',
    height:        '12px',
    border:        '2px solid rgba(255,255,255,0.3)',
    borderTopColor:'white',
    borderRadius:  '50%',
    animation:     'spin 0.7s linear infinite',
    display:       'inline-block',
  },
};
