/**
 * AppModal.jsx — Reusable Confirmation Modal
 *
 * Replaces native browser alert() / confirm() with a styled modal.
 * Supports async actions, loading states, and multiple variants.
 *
 * Usage:
 *   const { isOpen, modalData, openModal, closeModal } = useModal();
 *   openModal({ title: 'Delete?', type: 'danger', onConfirm: async () => {...} });
 *   <AppModal isOpen={isOpen} onClose={closeModal} {...modalData} />
 */

import React from 'react';
import { AlertTriangle, XCircle, CheckCircle, Info, X } from 'lucide-react';

const TYPE_CONFIG = {
  default: {
    icon: Info,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    confirmBg: 'bg-blue-600 hover:bg-blue-700',
  },
  danger: {
    icon: XCircle,
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    confirmBg: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    confirmBg: 'bg-amber-600 hover:bg-amber-700',
  },
  success: {
    icon: CheckCircle,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    confirmBg: 'bg-emerald-600 hover:bg-emerald-700',
  },
};

export default function AppModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'default',
  loading = false,
  showClose = true,
}) {
  if (!isOpen) return null;

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.default;
  const Icon = config.icon;

  const handleConfirm = async () => {
    if (loading) return;
    if (onConfirm) {
      await onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="p-6 pb-0">
          {showClose && (
            <button
              onClick={onClose}
              disabled={loading}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${config.iconBg}`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h2 id="modal-title" className="text-lg font-semibold text-slate-900 mb-1">
                {title}
              </h2>
              {description && (
                <p className="text-sm text-slate-500 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 pt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>

          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${config.confirmBg}`}
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}