/**
 * ToothBadge.tsx
 * ─────────────────────────────────────────────────────────────────
 * Polished clinical icons for the orthodontic chart.
 * Replaces generic emojis with styled Lucide icons and custom graphics.
 * 
 * Supports: Caries, Root Canal, Missing, Extracted, Rotated, 
 *           Displacement, Impacted, and Clinical Alerts.
 */

import React from 'react';
import { 
  Bug, 
  CircleDot, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Moon, 
  Zap, 
  Trash2, 
  Ban, 
  RotateCw,
  TriangleAlert,
  Activity,
  Heart,
  Droplets,
  Anchor,
  Sparkles,
  Stethoscope,
  Waves
} from 'lucide-react';

const HalitosisIcon = ({ size = 14, color = 'currentColor' }: { size?: number, color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4c0 0-2 1-2 4s2 4 2 7-2 5-2 5" /> {/* mouth/face profile */}
    <path d="M11 8c1.5 0 2.5 1 2.5 2s-1 2-2.5 2" /> {/* odor wave 1 */}
    <path d="M14 11.5c1.5 0 2.5 1 2.5 2s-1 2-2.5 2" /> {/* odor wave 2 */}
    <path d="M11 15c1.5 0 2.5 1 2.5 2s-1 2-2.5 2" /> {/* odor wave 3 */}
  </svg>
);

interface ToothBadgeProps {
  status: string;
  isCritical?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ToothBadge: React.FC<ToothBadgeProps> = ({ 
  status, 
  isCritical = false, 
  className = '',
  size = 'md'
}) => {
  const sizeMap = {
    sm: { box: 'w-5 h-5', icon: 10 },
    md: { box: 'w-7 h-7', icon: 14 },
    lg: { box: 'w-9 h-9', icon: 18 }
  };
  
  const currentSize = sizeMap[size];

  // ── ICON + COLOR SELECTION ───────────────────────────────────────────────

  const getIconData = () => {
    switch (status) {
      // ── Diagnosis ──
      case 'caries':
        return {
          icon: <Bug size={currentSize.icon} />,
          color: '#ef4444',
          bg: 'bg-red-50',
          label: 'Caries'
        };
      case 'root_canal':
        return {
          icon: <Activity size={currentSize.icon} />,
          color: '#f97316',
          bg: 'bg-orange-50',
          label: 'Root Canal'
        };
      case 'badly_decayed':
        return {
          icon: <Zap size={currentSize.icon} />,
          color: '#dc2626',
          bg: 'bg-red-100',
          label: 'Badly Decayed'
        };
      case 'missing':
        return {
          icon: <Ban size={currentSize.icon} />,
          color: '#94a3b8',
          bg: 'bg-slate-50',
          label: 'Missing'
        };
      case 'extracted':
        return {
          icon: <Trash2 size={currentSize.icon} />,
          color: '#64748b',
          bg: 'bg-slate-100',
          label: 'Extracted'
        };

      // ── Alignment ──
      case 'rotated':
        return {
          icon: <RotateCw size={currentSize.icon} />,
          color: '#a855f7',
          bg: 'bg-purple-50',
          label: 'Rotated'
        };
      case 'displaced_buccal':
        return {
          icon: <ArrowUpRight size={currentSize.icon} />,
          color: '#2dd4bf',
          bg: 'bg-teal-50',
          label: 'Buccal'
        };
      case 'displaced_lingual':
        return {
          icon: <ArrowDownLeft size={currentSize.icon} />,
          color: '#06b6d4',
          bg: 'bg-cyan-50',
          label: 'Lingual'
        };
      case 'impacted':
        return {
          icon: <Moon size={currentSize.icon} />,
          color: '#f59e0b',
          bg: 'bg-amber-50',
          label: 'Impacted'
        };
      case 'mesial_out':
      case 'distal_out':
        return {
          icon: <ArrowUpRight size={currentSize.icon} />,
          color: '#f97316',
          bg: 'bg-orange-50',
          label: 'Tipping Out'
        };
      case 'mesial_in':
      case 'distal_in':
        return {
          icon: <ArrowDownLeft size={currentSize.icon} />,
          color: '#0ea5e9',
          bg: 'bg-sky-50',
          label: 'Tipping In'
        };

      // ── Alerts ──
      case 'medical_alert':
        return {
          icon: <Heart size={currentSize.icon} />,
          color: '#f43f5e',
          bg: 'bg-rose-50',
          label: 'Medical'
        };
      case 'root_resorption':
        return {
          icon: <TriangleAlert size={currentSize.icon} strokeWidth={3} />,
          color: '#ef4444',
          bg: 'bg-red-50',
          label: 'Resorption',
          animation: 'animate-pulse',
          borderWeight: '1.5px',
          glow: true
        };
      case 'poor_hygiene':
        return {
          icon: <HalitosisIcon size={currentSize.icon} />,
          color: '#ec4899',
          bg: 'bg-pink-50',
          label: 'Gum'
        };
      case 'anchorage_loss':
        return {
          icon: <TriangleAlert size={currentSize.icon} strokeWidth={3} />,
          color: '#ef4444',
          bg: 'bg-red-50',
          label: 'Anchorage',
          animation: 'animate-pulse',
          borderWeight: '1.5px',
          glow: true
        };

      default:
        return {
          icon: <Sparkles size={currentSize.icon} />,
          color: '#64748b',
          bg: 'bg-slate-50',
          label: status
        };
    }
  };

  const data = getIconData() as any;

  return (
    <div 
      className={`relative rounded-xl border flex items-center justify-center transition-all duration-300 ${currentSize.box} ${data.bg} ${data.animation || ''} ${className}`}
      style={{ 
        borderWidth: data.borderWeight || '1px',
        borderColor: `${data.color}${data.glow ? '80' : '40'}`,
        color: data.color,
        boxShadow: (isCritical || data.glow) ? `0 0 12px ${data.color}40` : 'none',
        animationDuration: (data.animation === 'animate-pulse') ? '3s' : undefined
      }}
    >
      {/* ── Pulse animation for critical alerts or specific pings ── */}
      {(isCritical || data.ping) && (
        <span className="absolute inset-0 rounded-xl animate-ping opacity-25" style={{ backgroundColor: data.color }} />
      )}
      
      {data.icon}
    </div>
  );
};
