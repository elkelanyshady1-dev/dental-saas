/**
 * RecallModal.tsx — End-of-Visit Recall Scheduling Modal
 * Domain: orthodontic-visits
 * Layer: UI Component
 *
 * Triggered after ending a visit.
 * Allows clinician to set the next recall interval.
 *
 * RULES:
 *   ✅ Uses useMutation + invalidateQueries (React Query rules)
 *   ❌ No useState(apiData) — FORBIDDEN
 *   ❌ No manual refetch()
 */

import React, { useState, useMemo } from 'react';
import { Calendar, X, Clock, Check, CalendarDays } from 'lucide-react';
import { useCreateRecall } from '../hooks/useVisitReport';
import type { RecallInterval } from '../api/visitReport.api';
import './RecallModal.css';

// ── Interval options ─────────────────────────────────────────────────────────

interface IntervalOption {
  value: RecallInterval;
  label: string;
  days: number;
}

const INTERVAL_OPTIONS: IntervalOption[] = [
  { value: '2_weeks',  label: '2 Weeks',   days: 14  },
  { value: '3_weeks',  label: '3 Weeks',   days: 21  },
  { value: '1_month',  label: '1 Month',   days: 30  },
  { value: '6_weeks',  label: '6 Weeks',   days: 42  },
  { value: '3_months', label: '3 Months',  days: 90  },
  { value: '6_months', label: '6 Months',  days: 180 },
];

// ── Date calculation ─────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ── Props ────────────────────────────────────────────────────────────────────

interface RecallModalProps {
  visitId: string;
  patientId: string;
  branchId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

const RecallModal: React.FC<RecallModalProps> = ({
  visitId,
  patientId,
  branchId,
  onClose,
  onSuccess,
}) => {
  const [selectedInterval, setSelectedInterval] = useState<RecallInterval | null>(null);
  const [customDate, setCustomDate] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);

  const createRecallMutation = useCreateRecall();

  // Compute suggested date from selected interval
  const suggestedDate = useMemo(() => {
    if (useCustom && customDate) return new Date(customDate);
    if (!selectedInterval) return null;
    const opt = INTERVAL_OPTIONS.find(o => o.value === selectedInterval);
    return opt ? addDays(new Date(), opt.days) : null;
  }, [selectedInterval, useCustom, customDate]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSelectInterval = (interval: RecallInterval) => {
    setSelectedInterval(interval);
    setUseCustom(false);
  };

  const handleCustomToggle = () => {
    setUseCustom(true);
    setSelectedInterval('custom');
  };

  const handleConfirm = () => {
    if (!selectedInterval && !useCustom) return;

    createRecallMutation.mutate(
      {
        visitId,
        patientId,
        branchId,
        interval: useCustom ? 'custom' : selectedInterval!,
        customDate: useCustom && customDate ? customDate : null,
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
      }
    );
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const canConfirm = (selectedInterval && !useCustom) || (useCustom && customDate);

  return (
    <div className="rm-backdrop" onClick={handleBackdropClick}>
      <div className="rm-dialog" role="dialog" aria-modal="true" aria-label="Schedule Recall">

        {/* ── Close ────────────────────────────────────────────────── */}
        <button className="rm-close-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="rm-header">
          <div className="rm-header__icon-wrap">
            <Calendar size={22} />
          </div>
          <h2 className="rm-header__title">Schedule Recall</h2>
          <p className="rm-header__subtitle">Set the next appointment interval for this patient</p>
        </div>

        {/* ── Interval Grid ────────────────────────────────────────── */}
        <div className="rm-intervals">
          {INTERVAL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`rm-interval-btn ${selectedInterval === opt.value && !useCustom ? 'rm-interval-btn--selected' : ''}`}
              onClick={() => handleSelectInterval(opt.value)}
            >
              <Clock size={14} className="rm-interval-btn__icon" />
              <span className="rm-interval-btn__label">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* ── Custom Date ──────────────────────────────────────────── */}
        <div className="rm-custom-section">
          <button
            className={`rm-custom-toggle ${useCustom ? 'rm-custom-toggle--active' : ''}`}
            onClick={handleCustomToggle}
          >
            <CalendarDays size={14} />
            Custom Date
          </button>
          {useCustom && (
            <input
              type="date"
              className="rm-date-input"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={toISODate(new Date())}
              autoFocus
            />
          )}
        </div>

        {/* ── Preview ──────────────────────────────────────────────── */}
        {suggestedDate && (
          <div className="rm-preview">
            <Calendar size={14} className="rm-preview__icon" />
            <span className="rm-preview__label">Suggested Date:</span>
            <span className="rm-preview__date">{formatDate(suggestedDate)}</span>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div className="rm-footer">
          <button
            className="rm-btn rm-btn--skip"
            onClick={onClose}
            disabled={createRecallMutation.isPending}
          >
            Skip Recall
          </button>
          <button
            className="rm-btn rm-btn--confirm"
            onClick={handleConfirm}
            disabled={!canConfirm || createRecallMutation.isPending}
          >
            {createRecallMutation.isPending ? (
              <>
                <div className="rm-spinner" />
                Creating...
              </>
            ) : (
              <>
                <Check size={15} />
                Confirm Recall
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default RecallModal;
