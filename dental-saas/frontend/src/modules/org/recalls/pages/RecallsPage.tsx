/**
 * RecallsPage.tsx — Full Recall Domain Dashboard Page
 * Domain: recalls
 * Layer: Frontend > Page
 *
 * Sections:
 *   1. Header with title + subtitle
 *   2. Stats cards (Due Today, Overdue, This Week, Completed)
 *   3. Filter bar (Search, Status, Date Range)
 *   4. Data table with actions
 *   5. Pagination
 *
 * RULES:
 *   ✅ useQuery for all server state — NO useState(apiData)
 *   ✅ useMutation + invalidateQueries for writes
 *   ❌ No manual refetch()
 */

import React, { useState, useCallback } from 'react';
import {
  useRecallList,
  useRecallStats,
  useUpdateRecallStatus,
  useCancelRecall,
} from '../hooks/useRecallDomain';
import type { RecallListItem, RecallListFilters } from '../api/recallDomain.api';
import './RecallsPage.css';

// ── Status configuration ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',   color: '#92400e', bg: '#fef3c7' },
  sent:      { label: 'Sent',      color: '#1e40af', bg: '#dbeafe' },
  booked:    { label: 'Booked',    color: '#065f46', bg: '#d1fae5' },
  completed: { label: 'Completed', color: '#166534', bg: '#bbf7d0' },
  cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
  overdue:   { label: 'Overdue',   color: '#991b1b', bg: '#fecaca' },
};

const TYPE_LABELS: Record<string, string> = {
  orthodontic: 'Orthodontic',
  general:     'General',
  hygiene:     'Hygiene',
  follow_up:   'Follow-up',
  post_op:     'Post-Op',
};

// ── Date formatters ──────────────────────────────────────────────────────────

function formatDate(raw: string | null): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isOverdue(dueDate: string, status: string): boolean {
  if (['completed', 'cancelled', 'booked'].includes(status)) return false;
  return new Date(dueDate) < new Date();
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

// ── Component ────────────────────────────────────────────────────────────────

const RecallsPage: React.FC = () => {
  // ── Filter state (UI-only, not server data) ─────────────────────────────
  const [filters, setFilters] = useState<RecallListFilters>({
    page: 1,
    limit: 15,
    status: undefined,
    search: undefined,
  });

  const [searchInput, setSearchInput] = useState('');

  // ── Server state via React Query ────────────────────────────────────────
  const { data: listData, isLoading, isFetching } = useRecallList(filters);
  const { data: stats } = useRecallStats();
  const updateStatusMutation = useUpdateRecallStatus();
  const cancelMutation = useCancelRecall();

  const recalls = listData?.recalls ?? [];
  const meta = listData?.meta ?? { total: 0, page: 1, limit: 15, pages: 0 };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSearch = useCallback(() => {
    setFilters(prev => ({ ...prev, search: searchInput.trim() || undefined, page: 1 }));
  }, [searchInput]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleStatusFilter = useCallback((status: string) => {
    setFilters(prev => ({ ...prev, status: status === 'all' ? undefined : status, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }));
  }, []);

  const handleSendReminder = useCallback((recall: RecallListItem) => {
    updateStatusMutation.mutate({ recallId: recall.id, status: 'sent' });
  }, [updateStatusMutation]);

  const handleMarkComplete = useCallback((recall: RecallListItem) => {
    updateStatusMutation.mutate({ recallId: recall.id, status: 'completed' });
  }, [updateStatusMutation]);

  const handleCancel = useCallback((recall: RecallListItem) => {
    cancelMutation.mutate(recall.id);
  }, [cancelMutation]);

  return (
    <div className="rp-container" id="recalls-page">

      {/* ═══ HEADER ═════════════════════════════════════════════════════ */}
      <div className="rp-header">
        <div className="rp-header__text">
          <h1 className="rp-header__title">Recalls</h1>
          <p className="rp-header__subtitle">Manage upcoming patient recall appointments</p>
        </div>
      </div>

      {/* ═══ STATS CARDS ════════════════════════════════════════════════ */}
      <div className="rp-stats">
        <StatCard label="Due Today" value={stats?.dueToday ?? 0} color="#f59e0b" icon="📅" />
        <StatCard label="Overdue"   value={stats?.overdue ?? 0}   color="#ef4444" icon="⚠️" />
        <StatCard label="This Week" value={stats?.thisWeek ?? 0}  color="#3b82f6" icon="📊" />
        <StatCard label="Completed" value={stats?.completed ?? 0} color="#10b981" icon="✅" />
      </div>

      {/* ═══ FILTER BAR ═════════════════════════════════════════════════ */}
      <div className="rp-filters">
        <div className="rp-filters__search">
          <svg className="rp-filters__search-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            id="recall-search-input"
            type="text"
            className="rp-filters__input"
            placeholder="Search patient name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onBlur={handleSearch}
          />
        </div>

        <select
          id="recall-status-filter"
          className="rp-filters__select"
          value={filters.status || 'all'}
          onChange={(e) => handleStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="booked">Booked</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="overdue">Overdue</option>
        </select>

        <input
          id="recall-date-from"
          type="date"
          className="rp-filters__date"
          value={filters.dateFrom || ''}
          onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value || undefined, page: 1 }))}
          placeholder="From"
        />
        <input
          id="recall-date-to"
          type="date"
          className="rp-filters__date"
          value={filters.dateTo || ''}
          onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value || undefined, page: 1 }))}
          placeholder="To"
        />
      </div>

      {/* ═══ TABLE ══════════════════════════════════════════════════════ */}
      <div className="rp-table-wrap">
        {isLoading ? (
          <div className="rp-loading">
            <div className="rp-loading__spinner" />
            <p>Loading recalls...</p>
          </div>
        ) : recalls.length === 0 ? (
          <div className="rp-empty">
            <span className="rp-empty__icon">📋</span>
            <p className="rp-empty__title">No recalls found</p>
            <p className="rp-empty__text">Recalls are created automatically when visits are completed.</p>
          </div>
        ) : (
          <table className="rp-table" id="recalls-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Contact</th>
                <th>Due Date</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recalls.map((recall) => {
                const overdue = isOverdue(recall.dueDate, recall.status);
                const displayStatus = overdue ? 'overdue' : recall.status;
                const statusCfg = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG.pending;

                return (
                  <tr key={recall.id} className={overdue ? 'rp-row--overdue' : ''}>
                    {/* Patient */}
                    <td>
                      <div className="rp-patient">
                        <div className="rp-patient__avatar">{getInitials(recall.patientName)}</div>
                        <span className="rp-patient__name">{recall.patientName || 'Unknown'}</span>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="rp-cell--mono">{recall.contactPhone || '—'}</td>

                    {/* Due Date */}
                    <td>
                      <span className={`rp-date ${overdue ? 'rp-date--overdue' : ''}`}>
                        {formatDate(recall.dueDate)}
                      </span>
                      {overdue && <span className="rp-overdue-badge">Overdue</span>}
                    </td>

                    {/* Type */}
                    <td>
                      <span className="rp-type-badge">{TYPE_LABELS[recall.type] ?? recall.type}</span>
                    </td>

                    {/* Reason */}
                    <td className="rp-cell--reason">{recall.reason || '—'}</td>

                    {/* Status */}
                    <td>
                      <span
                        className="rp-status-badge"
                        style={{ color: statusCfg.color, backgroundColor: statusCfg.bg }}
                      >
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="rp-actions">
                        {recall.status === 'pending' && (
                          <button
                            className="rp-action-btn rp-action-btn--send"
                            title="Send Reminder"
                            onClick={() => handleSendReminder(recall)}
                            disabled={updateStatusMutation.isPending}
                          >
                            📨
                          </button>
                        )}
                        {['pending', 'sent'].includes(recall.status) && (
                          <button
                            className="rp-action-btn rp-action-btn--complete"
                            title="Mark Complete"
                            onClick={() => handleMarkComplete(recall)}
                            disabled={updateStatusMutation.isPending}
                          >
                            ✅
                          </button>
                        )}
                        {!['completed', 'cancelled'].includes(recall.status) && (
                          <button
                            className="rp-action-btn rp-action-btn--cancel"
                            title="Cancel"
                            onClick={() => handleCancel(recall)}
                            disabled={cancelMutation.isPending}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Loading overlay for pagination transitions */}
        {isFetching && !isLoading && (
          <div className="rp-fetching-overlay" />
        )}
      </div>

      {/* ═══ PAGINATION ═════════════════════════════════════════════════ */}
      {meta.pages > 1 && (
        <div className="rp-pagination">
          <span className="rp-pagination__info">
            Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total} recalls
          </span>
          <div className="rp-pagination__buttons">
            <button
              className="rp-page-btn"
              disabled={meta.page <= 1}
              onClick={() => handlePageChange(meta.page - 1)}
            >
              ‹ Prev
            </button>
            {Array.from({ length: Math.min(meta.pages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(meta.page - 2, meta.pages - 4));
              const page = start + i;
              if (page > meta.pages) return null;
              return (
                <button
                  key={page}
                  className={`rp-page-btn ${page === meta.page ? 'rp-page-btn--active' : ''}`}
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </button>
              );
            })}
            <button
              className="rp-page-btn"
              disabled={meta.page >= meta.pages}
              onClick={() => handlePageChange(meta.page + 1)}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── StatCard sub-component ───────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number; color: string; icon: string }> = ({
  label, value, color, icon,
}) => (
  <div className="rp-stat-card">
    <div className="rp-stat-card__header">
      <span className="rp-stat-card__icon">{icon}</span>
      <span className="rp-stat-card__label">{label}</span>
    </div>
    <span className="rp-stat-card__value" style={{ color }}>{value}</span>
  </div>
);

export default RecallsPage;
