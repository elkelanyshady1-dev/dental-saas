import React from 'react';
import { motion } from 'motion/react';
import { ToothData, ToothStatus, ToothAnchors, getPalmerNotation } from '../types';
import { TriangleAlert } from 'lucide-react';

interface ToothProps {
  data: ToothData;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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

export const Tooth: React.FC<ToothProps> = ({ 
  data, 
  isSelected, 
  onClick, 
  onContextMenu, 
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
    if (data.alertNote) return '#ef4444';
    if (status === 'root-resorption') return '#f472b6'; // Pink-400
    if (status === 'rotated') return '#a855f7'; // Purple-500
    if (status === 'impacted') return '#f97316'; // Orange-500
    if (status === 'unerupted') return '#8b5cf6'; // Violet-500
    if (status === 'missing' || status === 'extracted') return 'transparent';
    if (status === 'displaced-buccally' || status === 'displaced-lingually') return '#2dd4bf'; // Teal-400
    if (status.includes('out') || status.includes('in') || status.includes('tip') || status.includes('torque')) return '#10b981'; // Emerald-500 for To-Do
    return '#f8fafc';
  };

  const getToothTransform = () => {
    let transform = '';
    if (status === 'rotated') transform += ' rotate(15 20 40)';
    if (status === 'displaced-buccally') transform += ' translate(0, -5)';
    if (status === 'displaced-lingually') transform += ' translate(0, 5)';
    if (status === 'tip-mesial') transform += ' rotate(-10 20 40)';
    if (status === 'tip-distal') transform += ' rotate(10 20 40)';
    if (status === 'impacted') transform += ' translate(0, -15) scale(0.8)';
    if (status === 'unerupted') transform += ' translate(0, -20) scale(0.6)';
    if (status === 'mesial-out') transform += ' translate(-3, 0)';
    if (status === 'mesial-in') transform += ' translate(3, 0)';
    return transform;
  };

  const renderToothContent = () => {
    const targetW = 56;
    const targetH = 112;

    if (status === 'missing' || status === 'extracted') {
      if (status === 'extracted') {
        return (
          <g stroke="#ef4444" strokeWidth="3" strokeLinecap="round" transform={`translate(${(targetW - 40) / 2}, ${(targetH - 80) / 2})`}>
            <line x1="5" y1="20" x2="35" y2="60" />
            <line x1="35" y1="20" x2="5" y2="60" />
          </g>
        );
      }
      return null;
    }

    if (svgData) {
      const { minX, minY, maxX, maxY } = svgData.bbox;
      const width = maxX - minX;
      const height = maxY - minY;
      
      const scale = Math.min(targetW / width, targetH / height);
      
      const offsetX = (targetW - width * scale) / 2;
      const offsetY = (targetH - height * scale) / 2;

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

          {/* Status Color Overlay */}
          {needsColorOverlay && !isSelected && (
            <rect
              x={0}
              y={0}
              width={targetW}
              height={targetH}
              fill={statusColor}
              fillOpacity="0.25"
              style={{ mixBlendMode: 'multiply', pointerEvents: 'none' }}
              rx={4}
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
        {(status as any) !== 'missing' && (status as any) !== 'extracted' && (
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

  return (
    <motion.g 
      className="cursor-pointer group" 
      onClick={onClick}
      onContextMenu={onContextMenu}
      transform={getToothTransform()}
      animate={isSelected ? {
        scale: [1, 1.05, 1],
        transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      } : { scale: 1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{ originX: "28px", originY: "56px" }}
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

      {/* Impacted/Unerupted Tooth Movement Visualization */}
      {(status === 'impacted' || status === 'unerupted') && data.targetPosition && (
        <g>
          <line 
            x1="28" y1="56" 
            x2={data.targetPosition.x - (data.isUpper ? 160 : 160)} 
            y2={data.targetPosition.y - (data.isUpper ? 50 : 300)} 
            stroke={status === 'impacted' ? "#f97316" : "#8b5cf6"} 
            strokeWidth="2" 
            strokeDasharray="4 4" 
          />
          <circle 
            cx={data.targetPosition.x - (data.isUpper ? 160 : 160)} 
            cy={data.targetPosition.y - (data.isUpper ? 50 : 300)} 
            r="10" 
            fill="none" 
            stroke={status === 'impacted' ? "#f97316" : "#8b5cf6"} 
            strokeWidth="2" 
            strokeDasharray="2 2" 
          />
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

      {/* Alert Icon */}
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
    </motion.g>
  );
};
