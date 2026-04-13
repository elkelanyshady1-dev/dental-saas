import React from 'react';
import { motion } from 'framer-motion';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DuplicateActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  actionLabel?: string;
  contextParams?: {
    tooth?: string | number;
    arch?: string;
  };
}

export default function DuplicateActionModal({
  open,
  onClose,
  onConfirm,
  actionLabel = "This action",
  contextParams,
}: DuplicateActionModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="bg-white w-[420px] rounded-2xl shadow-2xl p-6"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 text-red-600 shrink-0">
            <ExclamationTriangleIcon className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">
            Duplicate Action Detected
          </h2>
        </div>

        {/* Body */}
        <div className="mb-6">
          <p className="text-sm text-gray-600">
            <strong>{actionLabel}</strong> has already been applied.<br />
            Do you want to overwrite it?
          </p>
          {(contextParams?.tooth || contextParams?.arch) && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
              <p className="text-xs text-gray-500 font-medium flex items-center gap-2">
                {contextParams.tooth && <span>Tooth: <span className="font-bold text-gray-700">{contextParams.tooth}</span></span>}
                {contextParams.tooth && contextParams.arch && <span className="text-gray-300">|</span>}
                {contextParams.arch && <span>Arch: <span className="font-bold text-gray-700">{contextParams.arch.charAt(0).toUpperCase() + contextParams.arch.slice(1)}</span></span>}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 font-medium text-sm transition-colors shadow-sm shadow-red-200"
          >
            Overwrite
          </button>
        </div>
      </motion.div>
    </div>
  );
}
