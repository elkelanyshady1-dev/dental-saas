/**
 * VisitCard.tsx — Timeline Card for Visit Summary
 * Domain: orthodontic-visits
 * Layer: UI Component
 *
 * Displays a compact visit summary card for the clinical timeline.
 * Shows: visit number, date, wires, alerts, key actions, recall info.
 *
 * RULES:
 *   ✅ Read-only — NO mutations
 *   ✅ All display data from DTO (server-computed)
 *   ❌ Frontend NEVER computes domain data
 */

import React from 'react';
import {
  FileText,
  Calendar,
  AlertTriangle,
  Zap,
  ChevronRight,
  Clock,
} from 'lucide-react';
import type { VisitCardDTO } from '../api/visitReport.api';
import './VisitCard.css';

// ── Visit type configuration ─────────────────────────────────────────────────

const VISIT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  adjustment:   { label: 'Adjustment',   color: 'var(--visit-type-adjustment)' },
  diagnostic:   { label: 'Diagnostic',   color: 'var(--visit-type-diagnostic)' },
  bonding:      { label: 'Bonding',      color: 'var(--visit-type-bonding)' },
  debonding:    { label: 'Debonding',    color: 'var(--visit-type-debonding)' },
  retention:    { label: 'Retention',    color: 'var(--visit-type-retention)' },
  emergency:    { label: 'Emergency',    color: 'var(--visit-type-emergency)' },
  records:      { label: 'Records',      color: 'var(--visit-type-records)' },
  consultation: { label: 'Consultation', color: 'var(--visit-type-consultation)' },
};

// ── Date formatter ───────────────────────────────────────────────────────────

function formatDate(raw: string | number | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRecallDate(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Props ────────────────────────────────────────────────────────────────────

interface VisitCardProps {
  visit: VisitCardDTO;
  onClick?: (visitId: string) => void;
  isActive?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

const VisitCard: React.FC<VisitCardProps> = ({ visit, onClick, isActive = false }) => {
  const typeConfig = VISIT_TYPE_CONFIG[visit.visitType] ?? VISIT_TYPE_CONFIG.adjustment;

  return (
    <div
      className={`visit-card ${isActive ? 'visit-card--active' : ''}`}
      onClick={() => onClick?.(visit.visitId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(visit.visitId)}
      id={`visit-card-${visit.visitId}`}
    >
      {/* ── Left accent border ─────────────────────────────────────── */}
      <div className="visit-card__accent" style={{ backgroundColor: typeConfig.color }} />

      {/* ── Header row ─────────────────────────────────────────────── */}
      <div className="visit-card__header">
        <div className="visit-card__header-left">
          <span className="visit-card__visit-number">Visit #{visit.visitNumber}</span>
          <span
            className="visit-card__type-badge"
            style={{ backgroundColor: `${typeConfig.color}18`, color: typeConfig.color, borderColor: `${typeConfig.color}30` }}
          >
            {typeConfig.label}
          </span>
        </div>
        <div className="visit-card__header-right">
          <span className="visit-card__date">{formatDate(visit.visitDate)}</span>
          <ChevronRight className="visit-card__chevron" size={14} />
        </div>
      </div>

      {/* ── Wires section ──────────────────────────────────────────── */}
      {(visit.wires.upper || visit.wires.lower) && (
        <div className="visit-card__wires">
          {visit.wires.upper && (
            <div className="visit-card__wire-item">
              <span className="visit-card__wire-label">Upper</span>
              <span className="visit-card__wire-value">{visit.wires.upper}</span>
            </div>
          )}
          {visit.wires.lower && (
            <div className="visit-card__wire-item">
              <span className="visit-card__wire-label">Lower</span>
              <span className="visit-card__wire-value">{visit.wires.lower}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts ──────────────────────────────────────────────────── */}
      {visit.alerts.length > 0 && (
        <div className="visit-card__alerts">
          {visit.alerts.slice(0, 3).map((alert, i) => (
            <span key={i} className="visit-card__alert-badge">
              <AlertTriangle size={10} />
              {alert}
            </span>
          ))}
        </div>
      )}

      {/* ── Key Actions ─────────────────────────────────────────────── */}
      {visit.keyActions.length > 0 && (
        <div className="visit-card__actions">
          {visit.keyActions.slice(0, 3).map((action, i) => (
            <div key={i} className="visit-card__action-item">
              <Zap size={10} className="visit-card__action-icon" />
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Recall info ─────────────────────────────────────────────── */}
      {visit.recall && (
        <div className="visit-card__recall">
          <Calendar size={12} className="visit-card__recall-icon" />
          <span className="visit-card__recall-text">
            Next: {formatRecallDate(visit.recall.suggestedDate)}
          </span>
        </div>
      )}

      {/* ── Status indicator ────────────────────────────────────────── */}
      {visit.status === 'active' && (
        <div className="visit-card__status-active">
          <Clock size={10} />
          <span>In Progress</span>
        </div>
      )}
    </div>
  );
};

export default VisitCard;
