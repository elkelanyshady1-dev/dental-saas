/**
 * VisitTimer.tsx — Live Visit Session Timer
 *
 * Derives elapsed time from visit.startedAt (server-authoritative epoch ms).
 * NEVER derives from frontend mount time — that would be incorrect after tab
 * restoration or page reload.
 *
 * Uses GlobalTimeContext so the clock is shared across all components and only
 * one setInterval runs for the entire clinical chart subtree.
 *
 * Renders in HH:MM:SS monospace.
 */

import React from 'react';
import { Timer } from 'lucide-react';
import { useGlobalTime } from './GlobalTimeContext';

interface VisitTimerProps {
  /** Server-authoritative epoch milliseconds — from visit.startedAt */
  startedAt: number | string | Date;
  /** Optional className override for the container */
  className?: string;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':');
}

export default function VisitTimer({ startedAt, className }: VisitTimerProps) {
  const now     = useGlobalTime();
  const start   = new Date(startedAt).getTime();
  const elapsed = Math.max(0, now.getTime() - start);
  const isLong  = elapsed >= 60 * 60 * 1000; // warn when over 1 hour

  return (
    <div
      className={className}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '6px',
        padding:        '4px 12px',
        borderRadius:   '10px',
        background:     isLong ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.12)',
        border:         `1px solid ${isLong ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.3)'}`,
        backdropFilter: 'blur(4px)',
      }}
      title={`Visit started at ${new Date(startedAt).toLocaleTimeString()}`}
    >
      <Timer
        size={13}
        style={{ color: isLong ? '#f87171' : '#60a5fa', flexShrink: 0 }}
      />
      <span
        style={{
          fontFamily:    '"JetBrains Mono", "Fira Code", "Courier New", monospace',
          fontSize:      '13px',
          fontWeight:    700,
          letterSpacing: '0.05em',
          color:         isLong ? '#f87171' : '#60a5fa',
          lineHeight:    1,
        }}
      >
        {formatElapsed(elapsed)}
      </span>
    </div>
  );
}
