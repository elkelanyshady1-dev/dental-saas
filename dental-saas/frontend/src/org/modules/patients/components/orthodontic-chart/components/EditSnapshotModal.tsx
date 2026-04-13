/**
 * EditSnapshotModal.tsx
 * Domain: clinical-snapshots
 * Layer: Frontend > Components
 *
 * Modal for editing snapshot metadata:
 *   - name (display label)
 *   - appointmentId (optional link)
 *
 * RULES:
 *   ✅ chartState is NEVER editable here — only metadata
 *   ✅ Calls onSave({ name, appointmentId }) — mutation is owned by parent
 *   ✅ Controlled form — no uncontrolled state
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Camera } from 'lucide-react';
import type { SnapshotListItem, VisitType } from '../api/snapshot.api';

const VISIT_TYPE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: 'bonding',    label: 'Bonding Visit' },
  { value: 'adjustment', label: 'Adjustment Visit' },
  { value: 'wire_change', label: 'Wire Change Visit' },
  { value: 'debonding',  label: 'Debonding Visit' },
];

interface EditSnapshotModalProps {
  snapshot: SnapshotListItem | null;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (id: string, patch: { name: string; appointmentId: string | null; visitType: VisitType }) => void;
}

export default function EditSnapshotModal({
  snapshot,
  isOpen,
  isSaving = false,
  onClose,
  onSave,
}: EditSnapshotModalProps) {
  const [name, setName]               = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [visitType, setVisitType]     = useState<VisitType>('adjustment');

  // Populate form when snapshot changes
  useEffect(() => {
    if (snapshot) {
      setName(snapshot.name ?? '');
      setAppointmentId(snapshot.appointmentId ?? '');
      setVisitType((snapshot.visitType as VisitType) ?? 'adjustment');
    }
  }, [snapshot]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshot) return;
    if (!name.trim()) return;
    onSave(snapshot.id, {
      name:          name.trim(),
      appointmentId: appointmentId.trim() || null,
      visitType,
    });
  };

  const inputStyle: React.CSSProperties = {
    width:        '100%',
    padding:      '9px 12px',
    background:   'rgba(255,255,255,0.06)',
    border:       '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color:        '#e2e8f0',
    fontSize:     14,
    outline:      'none',
    boxSizing:    'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display:      'block',
    fontSize:     12,
    fontWeight:   600,
    color:        'rgba(255,255,255,0.5)',
    marginBottom: 6,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 10000,
              backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0 }}
            exit={{   opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            style={{
              position:    'fixed',
              top:         '50%',
              left:        '50%',
              transform:   'translate(-50%, -50%)',
              width:       420,
              maxWidth:    'calc(100vw - 32px)',
              background:  '#1a1f2e',
              border:      '1px solid rgba(255,255,255,0.12)',
              borderRadius: 18,
              boxShadow:   '0 24px 80px rgba(0,0,0,0.6)',
              zIndex:      10001,
              overflow:    'hidden',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={15} color="#a5b4fc" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>Rename Snapshot</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Metadata only — clinical data is immutable</div>
                </div>
              </div>
              <button
                id="edit-snapshot-close"
                onClick={onClose}
                style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', borderRadius: 8 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle} htmlFor="snapshot-name-input">Snapshot Name</label>
                <input
                  id="snapshot-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. Visit 3 – Wire Change"
                  maxLength={120}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                  autoFocus
                  required
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'right' }}>
                  {name.length}/120
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle} htmlFor="snapshot-visit-type">Visit Type</label>
                <select
                  id="snapshot-visit-type"
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value as VisitType)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                >
                  {VISIT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#1a1f2e' }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle} htmlFor="snapshot-appointment-input">Appointment ID (optional)</label>
                <input
                  id="snapshot-appointment-input"
                  type="text"
                  value={appointmentId}
                  onChange={(e) => setAppointmentId(e.target.value)}
                  style={inputStyle}
                  placeholder="MongoDB ObjectId (24 hex chars)"
                  maxLength={24}
                  pattern="[a-fA-F0-9]{24}"
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  Links this snapshot to a specific appointment record.
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '9px 18px',
                    background: 'rgba(255,255,255,0.07)',
                    border:     '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color:      '#94a3b8',
                    fontSize:   13,
                    cursor:     'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  id="edit-snapshot-save"
                  type="submit"
                  disabled={isSaving || !name.trim()}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        6,
                    padding:    '9px 18px',
                    background: isSaving || !name.trim() ? 'rgba(99,102,241,0.4)' : '#6366f1',
                    border:     'none',
                    borderRadius: 8,
                    color:      '#fff',
                    fontSize:   13,
                    fontWeight: 500,
                    cursor:     isSaving || !name.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <Save size={13} />
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
