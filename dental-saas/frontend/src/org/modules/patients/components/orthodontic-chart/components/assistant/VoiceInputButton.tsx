/**
 * VoiceInputButton.tsx — Web Speech API Voice Input
 *
 * Provides a mic button that listens, transcribes, and returns text.
 * Uses window.SpeechRecognition | webkitSpeechRecognition.
 *
 * PROPS:
 *   onTranscript(text) — called with final transcript
 *   disabled           — disables mic while panel is busy
 */

import React, { useState, useRef, useCallback } from 'react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

// SpeechRecognition cross-browser type (not in all TS DOM libs)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

export default function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported] = useState(() =>
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  );
  const recognitionRef = useRef<AnySpeechRecognition>(null);

  const startListening = useCallback(() => {
    if (!isSupported || disabled) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionClass = w.SpeechRecognition || w.webkitSpeechRecognition;
    const recognition: AnySpeechRecognition = new SpeechRecognitionClass();
    recognition.lang            = 'en-US';
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;
    recognition.continuous      = false;

    recognition.onstart  = () => setIsRecording(true);
    recognition.onend    = () => setIsRecording(false);
    recognition.onerror  = () => setIsRecording(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript) onTranscript(transcript.trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, disabled, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  const toggle = () => {
    if (isRecording) stopListening();
    else startListening();
  };

  if (!isSupported) {
    return (
      <button
        disabled
        style={styles.micBtn}
        title="Voice input not supported in this browser"
        aria-label="Voice input unavailable"
      >
        <MicOffIcon />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled && !isRecording}
      style={{
        ...styles.micBtn,
        ...(isRecording ? styles.micBtnRecording : {}),
        ...(disabled && !isRecording ? styles.micBtnDisabled : {}),
      }}
      title={isRecording ? 'Stop recording' : 'Start voice input'}
      aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
      aria-pressed={isRecording}
    >
      {isRecording ? (
        <>
          <MicActiveIcon />
          <span style={styles.recordingDot} aria-hidden="true" />
        </>
      ) : (
        <MicIcon />
      )}
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function MicActiveIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  micBtn: {
    position:        'relative',
    width:           '38px',
    height:          '38px',
    borderRadius:    '50%',
    background:      'rgba(99, 102, 241, 0.15)',
    border:          '1px solid rgba(99, 102, 241, 0.3)',
    color:           '#a5b4fc',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    cursor:          'pointer',
    transition:      'all 0.2s ease',
    flexShrink:      0,
  },
  micBtnRecording: {
    background:   'rgba(239, 68, 68, 0.2)',
    border:       '1px solid rgba(239, 68, 68, 0.5)',
    color:        '#fca5a5',
    boxShadow:    '0 0 0 3px rgba(239, 68, 68, 0.15)',
    animation:    'pulse 1.5s infinite',
  },
  micBtnDisabled: {
    opacity:      0.4,
    cursor:       'not-allowed',
  },
  recordingDot: {
    position:        'absolute',
    top:             '6px',
    right:           '6px',
    width:           '7px',
    height:          '7px',
    borderRadius:    '50%',
    background:      '#ef4444',
    animation:       'blink 1s infinite',
  },
};
