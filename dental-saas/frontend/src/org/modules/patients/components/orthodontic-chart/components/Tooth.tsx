/**
 * Tooth.tsx — Individual Tooth SVG Renderer
 * ==========================================
 * Renders a single tooth in the orthodontic chart with:
 *   - SVG path data from teeth_data_refined.json
 *   - Status-based coloring and transforms
 *   - Bracket/band/molar-tube overlays
 *   - Anchor point visualization
 *   - FDI / Palmer notation labels
 *   - Prescription info display
 *
 * Performance: Wrapped with React.memo to prevent re-renders
 * when tooth data hasn't changed.
 */

import React from 'react';
import { motion } from 'motion/react';
import { ToothData, ToothStatus, ToothAnchors, getPalmerNotation, DiagnosisValue, AlignmentValue, AlertValue } from '../types';
import { TriangleAlert } from 'lucide-react';
import { ToothBadge } from './ToothBadge';


interface ToothProps {
  data: ToothData;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  onAnchorClick?: (toothId: number, anchorType: keyof ToothAnchors) => void;
  showBrackets: boolean;
  showAnchors?: boolean;
  notationSystem?: 'fdi' | 'palmer' | 'both';
  svgData?: {
    body: string;
    bracket: string;
    band?: string;
    tube?: string;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  };
}

const ToothComponent: React.FC<ToothProps> = ({ 
  data, 
  isSelected, 
  onClick, 
  onContextMenu, 
  onDoubleClick,
  onAnchorClick, 
  showBrackets, 
  showAnchors,
  notationSystem = 'fdi',
  svgData
}) => {
  const { type, isUpper, status } = data;
  const isMolar = [16, 17, 18, 26, 27, 28, 36, 37, 38, 46, 47, 48].includes(data.id);

  const getStatusColor = () => {
    if (isSelected) return '#3b82f6';

    // ── Clinical Tagging Engine: priority order ─────────────────────────
    const cs = data.clinicalStatus;
    const ca = data.clinicalAlerts ?? [];

    // Diagnosis layer
    if (cs?.diagnosis === 'caries')        return '#ef4444'; // red
    if (cs?.diagnosis === 'badly_decayed') return '#dc2626'; // deeper red
    if (cs?.diagnosis === 'root_canal')    return '#f97316'; // orange
    if (cs?.diagnosis === 'missing')       return 'transparent';
    if (cs?.diagnosis === 'extracted')     return 'transparent';

    // Alignment layer
    if (cs?.alignment === 'rotated')            return '#a855f7'; // purple
    if (cs?.alignment === 'displaced_buccal')   return '#2dd4bf'; // teal
    if (cs?.alignment === 'displaced_lingual')  return '#06b6d4'; // cyan
    if (cs?.alignment === 'impacted')           return '#f59e0b'; // amber
    if (cs?.alignment === 'mesial_out')         return '#f97316'; // orange
    if (cs?.alignment === 'distal_out')         return '#f97316'; // orange
    if (cs?.alignment === 'mesial_in')          return '#0ea5e9'; // sky
    if (cs?.alignment === 'distal_in')          return '#0ea5e9'; // sky

    // Alert layer
    if (ca.includes('root_resorption'))    return '#fbbf24'; // yellow
    if (ca.includes('medical_alert'))      return '#f43f5e'; // rose
    if (ca.includes('anchorage_loss'))     return '#8b5cf6'; // violet
    if (ca.includes('poor_hygiene'))       return '#84cc16'; // lime

    // ── Legacy flat status (bracket/band/molar-tube keep original coloring) ──
    if (data.alertNote) return '#ef4444';
    if (status === 'root-resorption') return '#f472b6';
    if (status === 'rotated') return '#a855f7';
    if (status === 'missing' || status === 'extracted') return 'transparent';
    if (status === 'displaced-buccally' || status === 'displaced-lingually') return '#2dd4bf';
    if (status.includes('out') || status.includes('in') || status.includes('tip') || status.includes('torque')) return '#10b981';
    return '#f8fafc';
  };


  const getToothTransform = () => {
    let transform = '';
    if (status === 'rotated') transform += ' rotate(15 20 40)';
    if (status === 'displaced-buccally') transform += ' translate(0, -5)';
    if (status === 'displaced-lingually') transform += ' translate(0, 5)';
    if (status === 'tip-mesial') transform += ' rotate(-10 20 40)';
    if (status === 'tip-distal') transform += ' rotate(10 20 40)';
    if (status === 'mesial-out') transform += ' translate(-3, 0)';
    if (status === 'mesial-in') transform += ' translate(3, 0)';
    return transform;
  };

  const renderToothContent = () => {
    const targetW = 56;
    const targetH = 112;

    // ── Determine effective missing/extracted state (clinical tag takes priority) ──
    const cs = data.clinicalStatus;
    const isMissingState  = cs?.diagnosis === 'missing'  || status === 'missing';
    const isExtractedState = cs?.diagnosis === 'extracted' || status === 'extracted';

    // ── EXTRACTED: Bold red X (no border frame) ───────────────────────────────
    if (isExtractedState) {
      const cx = targetW / 2;
      const cy = targetH / 2;
      const arm = 16; // half-length of each X arm
      return (
        <g>
          {/* Glow filter */}
          <defs>
            <filter id={`xGlow-${data.id}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Animated X */}
          <g filter={`url(#xGlow-${data.id})`}>
            <line
              x1={cx - arm} y1={cy - arm}
              x2={cx + arm} y2={cy + arm}
              stroke="#ef4444" strokeWidth={4} strokeLinecap="round"
              className="transition-all duration-300"
            />
            <line
              x1={cx + arm} y1={cy - arm}
              x2={cx - arm} y2={cy + arm}
              stroke="#ef4444" strokeWidth={4} strokeLinecap="round"
              className="transition-all duration-300"
            />
          </g>
          {/* Pulse ring — rendered via foreignObject to use CSS animation */}
          <circle
            cx={cx} cy={cy} r={arm + 2}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1}
            opacity={0.2}
            className="animate-ping"
            style={{ animationDuration: '2s' }}
          />
        </g>
      );
    }

    // ── MISSING: Ghost silhouette only (no border frame) ────────────────────────
    if (isMissingState) {
      return (
        <g>
          {/* Ghost silhouette path — very faint white */}
          {svgData ? (
            <g
              transform={(() => {
                const { minX, minY, maxX, maxY } = svgData.bbox;
                const w = maxX - minX;
                const h = maxY - minY;
                const s = Math.min((targetW - 8) / w, (targetH - 8) / h);
                const ox = (targetW - w * s) / 2;
                const oy = isUpper ? targetH - h * s : 0;
                return `translate(${ox}, ${oy}) scale(${s}) translate(${-minX}, ${-minY})`;
              })()}
              opacity={0.08}
              dangerouslySetInnerHTML={{ __html: svgData.body }}
            />
          ) : null}
        </g>
      );
    }

    if (svgData) {
      const { minX, minY, maxX, maxY } = svgData.bbox;
      const width = maxX - minX;
      const height = maxY - minY;
      
      const scale = Math.min(targetW / width, targetH / height);
      
      const offsetX = (targetW - width * scale) / 2;
      // Upper teeth: bottom-align so brackets line up at same Y level
      // Lower teeth: top-align so crowns line up at same Y level
      const offsetY = isUpper 
        ? targetH - height * scale   // push to bottom
        : 0;                          // keep at top

      const statusColor = getStatusColor();
      const needsColorOverlay = statusColor !== 'transparent' && statusColor !== '#f8fafc';

      return (
        <g>
          {/* Base Tooth Shape */}
          <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale}) translate(${-minX}, ${-minY})`}>
            <g 
              dangerouslySetInnerHTML={{ __html: svgData.body }} 
              className="transition-all duration-300"
            />
            
            {/* Bracket/Band/Tube */}
            {showBrackets && (
              <>
                {/* Regular Brackets (Non-molars) */}
                {!isMolar && status === 'bracket' && (
                  svgData.bracket ? (
                    <g dangerouslySetInnerHTML={{ __html: svgData.bracket }} />
                  ) : (
                    <rect 
                      x={minX + width * 0.2} 
                      y={minY + height * 0.4} 
                      width={width * 0.6} 
                      height={height * 0.2} 
                      fill={data.bracketColor || "#3b82f6"} 
                      rx={2} 
                    />
                  )
                )}
                
                {/* Bands */}
                {status === 'band' && (
                  svgData.band ? (
                    <g dangerouslySetInnerHTML={{ __html: svgData.band }} />
                  ) : (
                    <rect 
                      x={minX + width * 0.1} 
                      y={minY + height * 0.3} 
                      width={width * 0.8} 
                      height={height * 0.4} 
                      fill={data.bracketColor || "#64748b"} 
                      rx={2} 
                    />
                  )
                )}

                {/* Molar Tubes */}
                {(status === 'molar-tube' || (isMolar && status === 'bracket')) && (
                  svgData.tube ? (
                    <g dangerouslySetInnerHTML={{ __html: svgData.tube }} />
                  ) : svgData.band ? (
                    // Graceful fallback: render band SVG when tube is not yet defined
                    <g dangerouslySetInnerHTML={{ __html: svgData.band }} />
                  ) : (
                    <rect 
                      x={minX + width * 0.2} 
                      y={minY + height * 0.4} 
                      width={width * 0.6} 
                      height={height * 0.2} 
                      fill={data.bracketColor || "#3b82f6"} 
                      rx={2} 
                    />
                  )
                )}
              </>
            )}
          </g>

          {/* Selection Highlight */}
          {isSelected && (
            <rect
              x={-2}
              y={-2}
              width={targetW + 4}
              height={targetH + 4}
              fill="#3b82f6"
              fillOpacity="0.1"
              stroke="#3b82f6"
              strokeWidth="2"
              rx={6}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </g>
      );
    }

    // Fallback to original placeholder paths
    const getPath = () => {
      switch (type) {
        case 'incisor': return `M 5,80 L 35,80 L 32,24 Q 20,0 8,24 Z`;
        case 'canine': return `M 5,80 L 35,80 L 30,32 L 20,0 L 10,32 Z`;
        case 'premolar': return `M 2,80 L 38,80 L 35,40 Q 30,0 20,0 Q 10,0 5,40 Z`;
        case 'molar': return `M 0,80 L 40,80 L 38,48 Q 35,0 20,0 Q 5,0 2,48 Z`;
        default: return '';
      }
    };

    return (
      <g transform={`translate(${(targetW - 40) / 2}, ${(targetH - 80) / 2})`}>
        <path
          d={getPath()}
          fill={getStatusColor()}
          stroke={isSelected ? '#60a5fa' : '#cbd5e1'}
          strokeWidth={isSelected ? 2 : 1}
          className="transition-all duration-300 hover:brightness-90"
        />
        {(status as string) !== 'missing' && (status as string) !== 'extracted' && (
          <path
            d={getPath()}
            fill="url(#toothGradient)"
            opacity={0.3}
            pointerEvents="none"
          />
        )}
        {showBrackets && (status === 'bracket' || status === 'band' || status === 'molar-tube') && (
          <rect 
            x={12} y={50} width={16} height={10} 
            fill={data.bracketColor || (status === 'molar-tube' ? '#a855f7' : '#3b82f6')} 
            rx={2}
          />
        )}
      </g>
    );
  };

  const statusTransform = getToothTransform();

  return (
    <motion.g 
      className="cursor-pointer group" 
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      style={{ 
        transform: statusTransform || undefined,
        transformOrigin: '28px 56px'
      }}
      animate={{ scale: isSelected ? 1.05 : 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      opacity={status === 'impacted' ? 0.55 : status === 'unerupted' ? 0.6 : 1}
      filter={status === 'impacted' ? 'grayscale(35%)' : status === 'unerupted' ? 'grayscale(20%)' : 'none'}
    >
      {renderToothContent()}

      {/* Status Indicators */}
      <g transform="translate(8, 16)">
        {status === 'mesial-out' && (
          <path d="M 5,40 L 0,40 M 0,40 L 3,37 M 0,40 L 3,43" stroke="#10b981" strokeWidth="2" fill="none" />
        )}
        {status === 'mesial-in' && (
          <path d="M 35,40 L 40,40 M 40,40 L 37,37 M 40,40 L 37,43" stroke="#10b981" strokeWidth="2" fill="none" />
        )}
        {status === 'torque' && (
          <path d="M 10,20 Q 20,10 30,20" stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
        )}
      </g>

      {/* Impacted "💤" Sleep Indicator */}
      {(status === 'impacted' || data.clinicalStatus?.alignment === 'impacted') && (
        <g transform="translate(28, 0)">
          <text
            x={0}
            y={isUpper ? -8 : 125}
            textAnchor="middle"
            fontSize="13"
            fontWeight="bold"
            fill="#f97316"
            opacity={0.85}
            className="select-none"
          >
            💤
          </text>
        </g>
      )}

      {/* Label */}
      <g transform="translate(28, 0)">
        <rect
          x="-15"
          y={isUpper ? 120 : -35}
          width="30"
          height="20"
          rx="4"
          fill="#f1f5f9"
          stroke="#94a3b8"
          strokeWidth="1"
        />
        <text
          x={0}
          y={isUpper ? 135 : -20}
          textAnchor="middle"
          fontSize="14"
          fill="#1e293b"
          className="font-black tracking-tight transition-opacity"
        >
          {notationSystem === 'palmer' ? getPalmerNotation(data.id) : 
           notationSystem === 'both' ? `${data.id} (${getPalmerNotation(data.id)})` : 
           data.id}
        </text>
      </g>

      {/* Prescription/Brand/Bonding Height Info */}
      {(data.prescription || data.brand || data.bondingHeight) && (
        <foreignObject 
          x={isUpper ? -5 : 15} 
          y={isUpper ? -95 : 130} 
          width="40" 
          height="80"
        >
          <div className="bg-white rounded-md shadow-sm p-2 border border-slate-200 flex flex-col justify-center items-center h-full">
            <div className="text-[7px] font-bold text-slate-500 uppercase tracking-wider text-center">
              {data.prescription} {data.brand}
            </div>
            <div className="text-[8px] font-bold text-slate-900 text-center leading-tight mt-0.5">
              {data.bondingOption === 'marginal-ridges-level' && 'MR-Level'}
              {data.bondingOption === 'middle-middle' && 'Mid-Mid'}
              {data.bondingOption === 'custom' && data.bondingHeight && `H:${data.bondingHeight}mm`}
              {data.prescriptionValues && ` T:${data.prescriptionValues.tip}° TR:${data.prescriptionValues.torque}°`}
            </div>
          </div>
        </foreignObject>
      )}

      {/* Alert Icon — legacy alertNote */}
      {data.alertNote && (
        <foreignObject 
          x="18" 
          y={isUpper ? 45 : 55} 
          width="20" 
          height="20"
        >
          <div className="flex items-center justify-center w-full h-full">
            <TriangleAlert className="w-4 h-4 text-red-600 animate-pulse" />
          </div>
        </foreignObject>
      )}

      {/* ── Clinical Tagging Badges (skip for missing/extracted — visual is self-describing) ─── */}
      {(data.clinicalStatus?.diagnosis ||
        data.clinicalStatus?.alignment ||
        (data.clinicalAlerts?.length ?? 0) > 0) &&
        data.clinicalStatus?.diagnosis !== 'missing' &&
        data.clinicalStatus?.diagnosis !== 'extracted' &&
        status !== 'missing' &&
        status !== 'extracted' && (
        <foreignObject
          x={-4}
          y={isUpper ? -34 : 118}
          width="64"
          height="32"
        >
          <div className="flex items-center justify-center gap-1.5 px-1 py-1 overflow-visible">
            {data.clinicalStatus?.diagnosis && (
              <ToothBadge 
                status={data.clinicalStatus.diagnosis} 
                size="sm" 
                className="shadow-md border-white/80 ring-1 ring-white/20"
              />
            )}
            {data.clinicalStatus?.alignment && data.clinicalStatus.alignment !== 'impacted' && (
               <ToothBadge 
                status={data.clinicalStatus.alignment} 
                size="sm" 
                className="shadow-md border-white/80 ring-1 ring-white/20"
              />
            )}
            {data.clinicalAlerts?.slice(0, 1).map(alert => (
               <ToothBadge 
                key={alert}
                status={alert} 
                size="sm" 
                isCritical
                className="shadow-md border-white/80 ring-1 ring-white/20"
              />
            ))}
          </div>
        </foreignObject>
      )}
    </motion.g>
  );
};


/**
 * Memoized Tooth component — only re-renders when relevant props change.
 * This is critical for performance since we render 32 teeth simultaneously.
 */
export const Tooth = React.memo(ToothComponent, (prevProps, nextProps) => {
  return (
    prevProps.data.id === nextProps.data.id &&
    prevProps.data.status === nextProps.data.status &&
    prevProps.data.bracketColor === nextProps.data.bracketColor &&
    prevProps.data.alertNote === nextProps.data.alertNote &&
    prevProps.data.prescription === nextProps.data.prescription &&
    prevProps.data.slotSize === nextProps.data.slotSize &&
    prevProps.data.brand === nextProps.data.brand &&
    prevProps.data.bondingHeight === nextProps.data.bondingHeight &&
    prevProps.data.bondingOption === nextProps.data.bondingOption &&
    // Clinical Tagging Engine fields
    prevProps.data.clinicalStatus?.diagnosis === nextProps.data.clinicalStatus?.diagnosis &&
    prevProps.data.clinicalStatus?.alignment  === nextProps.data.clinicalStatus?.alignment  &&
    prevProps.data.clinicalStatus?.condition  === nextProps.data.clinicalStatus?.condition  &&
    JSON.stringify(prevProps.data.clinicalAlerts) === JSON.stringify(nextProps.data.clinicalAlerts) &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.showBrackets === nextProps.showBrackets &&
    prevProps.showAnchors === nextProps.showAnchors &&
    prevProps.notationSystem === nextProps.notationSystem
  );
});

