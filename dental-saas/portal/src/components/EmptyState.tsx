/**
 * EmptyState.tsx
 * Reusable empty state component with icon, message, and optional CTA
 */

import React from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  iconColor?: string;
  iconBg?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  iconColor = 'text-slate-300',
  iconBg = 'bg-slate-50',
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-12 md:py-16 px-6 text-center"
  >
    <div className={`w-16 h-16 ${iconBg} rounded-2xl flex items-center justify-center ${iconColor} mb-5`}>
      <Icon className="w-8 h-8" />
    </div>
    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-2">{title}</h3>
    {description && (
      <p className="text-xs font-medium text-slate-400 max-w-xs leading-relaxed mb-6">{description}</p>
    )}
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
      >
        {actionLabel}
      </button>
    )}
  </motion.div>
);

export default EmptyState;
