/**
 * CommandInput.tsx — Clinical Assistant Text Input
 *
 * Controlled input with:
 *   - Debounced onChange for live parsing
 *   - Dynamic suggestion dropdown (autocomplete, smart, frequent)
 *   - Keyboard navigation (Arrow keys, Enter, Tab)
 *   - Match highlighting
 *   - Send button & Voice input integration
 */

import React, { useRef, useEffect, useState } from 'react';
import VoiceInputButton from './VoiceInputButton';
import type { CombinedSuggestion } from '../../assistant/useSuggestions';

interface CommandInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onSuggestion: (example: string) => void;
  suggestions?: CombinedSuggestion[];
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function CommandInput({
  value,
  onChange,
  onSubmit,
  onSuggestion,
  suggestions = [],
  disabled,
  autoFocus,
}: CommandInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const showSuggestions = suggestions.length > 0;
  const isEmpty = value.trim().length === 0;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Reset selected index when exact matches shift or input clears
  useEffect(() => {
    setSelectedIndex(0);
  }, [value, suggestions]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        // Execute the selected suggestion directly
        onSubmit(suggestions[selectedIndex].label);
      } else if (value.trim()) {
        onSubmit(value.trim());
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (showSuggestions && suggestions[selectedIndex]) {
        onChange(suggestions[selectedIndex].label);
      }
    } else if (e.key === 'Escape') {
      onChange('');
    }
  };

  /** Highlight the typed part of the suggestion label */
  const renderHighlightedLabel = (label: string, inputRaw: string) => {
    if (!inputRaw.trim()) return label;
    
    const lowerLabel = label.toLowerCase();
    const lowerInput = inputRaw.trim().toLowerCase();
    const startIdx = lowerLabel.indexOf(lowerInput);
    
    if (startIdx === -1) return label; // no direct substring match

    const endIdx = startIdx + lowerInput.length;
    return (
      <>
        {label.substring(0, startIdx)}
        <strong style={s.highlight}>{label.substring(startIdx, endIdx)}</strong>
        {label.substring(endIdx)}
      </>
    );
  };

  const getTypeLabel = (type: CombinedSuggestion['type']) => {
    switch (type) {
      case 'frequent': return 'Frequent';
      case 'smart': return 'Smart';
      default: return 'Command';
    }
  };

  return (
    <div style={s.root}>
      {/* ── Main input row ─────────────────────────────────────── */}
      <div style={s.inputRow}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder="e.g. rebond UR5 palatal..."
          style={s.input}
          aria-label="Clinical command input"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Voice */}
        <VoiceInputButton
          onTranscript={(text) => {
            onChange(text);
            onSubmit(text);
          }}
          disabled={disabled}
        />

        {/* Send */}
        <button
          onClick={() => {
             if (showSuggestions && selectedIndex >= 0) {
                 onSubmit(suggestions[selectedIndex].label);
             } else if (value.trim()) {
                 onSubmit(value.trim());
             }
          }}
          disabled={disabled || (!value.trim() && !showSuggestions)}
          style={{
            ...s.sendBtn,
            ...((!value.trim() && !showSuggestions) || disabled ? s.sendBtnDisabled : {}),
          }}
          aria-label="Submit command"
          title="Submit (Enter)"
        >
          <SendIcon />
        </button>
      </div>

      {/* ── Suggestions Dropdown ─────────────────────────────── */}
      {showSuggestions && (
        <div style={s.suggestionsList} role="listbox">
          {isEmpty && <div style={s.hintLabel}>✨ Suggested:</div>}
          {suggestions.map((sug, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={sug.label + sug.type}
                role="option"
                aria-selected={isSelected}
                style={{ ...s.suggestionItem, ...(isSelected ? s.suggestionItemSelected : {}) }}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => onSubmit(sug.label)}
              >
                <div style={s.suggestionIcon}>{sug.icon}</div>
                <div style={s.suggestionContent}>
                  <div style={s.suggestionLabel}>
                    {renderHighlightedLabel(sug.label, value)}
                  </div>
                  {sug.reason && <div style={s.suggestionReason}>{sug.reason}</div>}
                </div>
                
                <span style={{
                    ...s.suggestionBadge, 
                    ...(sug.type === 'smart' ? s.badgeSmart : {}),
                    ...(sug.type === 'frequent' ? s.badgeFrequent : {})
                }}>
                  {getTypeLabel(sug.type)}
                </span>
                
                {isSelected && !isEmpty && (
                  <span style={s.keyboardHint}>↹ Tab to fill</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  inputRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         '8px',
    background:  'rgba(255,255,255,0.04)',
    border:      '1px solid rgba(99, 102, 241, 0.25)',
    borderRadius:'12px',
    padding:     '6px 8px',
    transition:  'border-color 0.2s',
  },
  input: {
    flex:            1,
    background:      'transparent',
    border:          'none',
    outline:         'none',
    color:           '#e2e8f0',
    fontSize:        '14px',
    fontFamily:      'Inter, system-ui, sans-serif',
    padding:         '4px 4px',
    caretColor:      '#818cf8',
  },
  sendBtn: {
    width:           '34px',
    height:          '34px',
    borderRadius:    '8px',
    background:      'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border:          'none',
    color:           '#fff',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    cursor:          'pointer',
    flexShrink:      0,
    transition:      'opacity 0.2s, transform 0.1s',
    boxShadow:       '0 2px 8px rgba(99, 102, 241, 0.3)', // Ensure you get the glow!
  },
  sendBtnDisabled: {
    opacity:  0.35,
    cursor:   'not-allowed',
    boxShadow:'none',
  },
  
  // ── Suggestions ──
  suggestionsList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '4px',
    background:    'rgba(15, 15, 26, 0.95)',
    border:        '1px solid rgba(99, 102, 241, 0.15)',
    borderRadius:  '12px',
    padding:       '8px',
    maxHeight:     '220px',
    overflowY:     'auto',
    boxShadow:     '0 8px 32px rgba(0,0,0,0.5)',
  },
  hintLabel: {
    fontSize:    '11px',
    color:       '#f59e0b',
    fontFamily:  'Inter, system-ui, sans-serif',
    letterSpacing:'0.05em',
    textTransform:'uppercase',
    marginBottom:'4px',
    paddingLeft: '4px',
    fontWeight:  600,
  },
  suggestionItem: {
    display:        'flex',
    alignItems:     'center',
    gap:            '10px',
    padding:        '8px 10px',
    borderRadius:   '8px',
    cursor:         'pointer',
    transition:     'background 0.1s',
  },
  suggestionItemSelected: {
    background: 'rgba(99, 102, 241, 0.2)',
  },
  suggestionIcon: {
    fontSize: '16px',
    width:    '20px',
    textAlign:'center',
  },
  suggestionContent: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
  },
  suggestionLabel: {
    color:      '#e2e8f0',
    fontSize:   '13px',
    fontFamily: 'Inter, system-ui, sans-serif',
    whiteSpace: 'nowrap',
    textOverflow:'ellipsis',
    overflow:   'hidden',
  },
  suggestionReason: {
    color:      '#94a3b8',
    fontSize:   '11px',
    fontFamily: 'Inter, system-ui, sans-serif',
    marginTop:  '2px',
    fontStyle:  'italic',
  },
  highlight: {
    color:      '#818cf8',
    fontWeight: 'bold',
  },
  suggestionBadge: {
    fontSize:     '10px',
    padding:      '2px 6px',
    borderRadius: '4px',
    fontFamily:   'Inter, system-ui, sans-serif',
    textTransform:'uppercase',
    letterSpacing:'0.04em',
    fontWeight:   700,
    background:   'rgba(255, 255, 255, 0.1)',
    color:        '#cbd5e1',
  },
  badgeSmart: {
    background: 'rgba(16, 185, 129, 0.15)',
    color:      '#34d399',
  },
  badgeFrequent: {
    background: 'rgba(245, 158, 11, 0.15)',
    color:      '#fbbf24',
  },
  keyboardHint: {
    fontSize:    '10px',
    color:       '#64748b',
    marginLeft:  '4px',
  }
};
