import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tooth } from '../../Tooth';
import teethData from '../../../assets/data/teeth_data_refined.json';
import { 
  ToothData, 
  ElasticConnection, 
  Appliance, 
  Miniscrew, 
  IPRMarker, 
  SpaceMarker, 
  PowerChainConfig,
  Accessory,
  ToothAnchors,
  ArchwireConfig,
  ArchwireSize,
  getPalmerNotation
} from '../../../types';
import { Settings, Trash2, RefreshCw, CircleDot, Square, ShieldAlert, Move, Stethoscope, RotateCcw, X, AlertCircle, Activity, Link as LinkIcon, FileText, Plus, FileCode, Grid, TriangleAlert } from 'lucide-react';

interface OrthodonticChartCanvasProps {
  upperTeeth: ToothData[];
  lowerTeeth: ToothData[];
  selectedToothIds: number[];
  onToothClick: (id: number) => void;
  onToothContextMenu: (e: React.MouseEvent, id: number) => void;
  onAnchorClick: (toothId: number, anchorType: keyof ToothAnchors) => void;
  elastics: ElasticConnection[];
  appliances: Appliance[];
  miniscrews: Miniscrew[];
  iprMarkers: IPRMarker[];
  spaceMarkers: SpaceMarker[];
  powerChains: PowerChainConfig[];
  accessories: Accessory[];
  upperArchwire?: ArchwireConfig;
  lowerArchwire?: ArchwireConfig;
  showBrackets: boolean;
  showArchwire: boolean;
  showAnchors: boolean;
  showAnnotations: boolean;
  zoom: number;
  notationSystem: 'fdi' | 'palmer' | 'both';
  getAnchorCoords: (id: number, type: keyof ToothAnchors) => { x: number, y: number };
  removeElastic: (id: string) => void;
  removeAppliance: (id: string) => void;
  removeMiniscrew: (id: string) => void;
  removeIPRMarker: (id: string) => void;
  removeSpaceMarker: (id: string) => void;
  removePowerChain: (id: string) => void;
  removeAccessory: (id: string) => void;
  selectedMiniscrewId?: string | null;
  onMiniscrewClick?: (id: string) => void;
}

const OrthodonticChartCanvas: React.FC<OrthodonticChartCanvasProps> = ({
  upperTeeth,
  lowerTeeth,
  selectedToothIds,
  onToothClick,
  onToothContextMenu,
  onAnchorClick,
  elastics,
  appliances,
  miniscrews,
  iprMarkers,
  spaceMarkers,
  powerChains,
  accessories,
  upperArchwire,
  lowerArchwire,
  showBrackets,
  showArchwire,
  showAnchors,
  showAnnotations,
  zoom,
  notationSystem,
  getAnchorCoords,
  removeElastic,
  removeAppliance,
  removeMiniscrew,
  removeIPRMarker,
  removeSpaceMarker,
  removePowerChain,
  removeAccessory,
  selectedMiniscrewId,
  onMiniscrewClick
}) => {
  const chartRef = useRef<SVGSVGElement>(null);

  return (
    <div className="relative w-full h-full bg-white rounded-2xl border border-slate-200 shadow-inner overflow-hidden flex items-center justify-center p-4">
      <div 
        className="w-full h-full transition-transform duration-300 ease-out flex items-center justify-center"
        style={{ transform: `scale(${zoom})` }}
      >
        <svg ref={chartRef} viewBox="0 0 1100 500" className="w-full h-full">
          <defs>
            <linearGradient id="toothGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="white" stopOpacity="0.8" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="linear-gradient" x1="2266.19" y1="777.54" x2="2218.61" y2="898.52" gradientTransform="translate(456.99 61.78) scale(.42)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e3dcc9"/>
              <stop offset=".62" stopColor="#efefe5"/>
              <stop offset="1" stopColor="#e5e4df"/>
            </linearGradient>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
            </marker>
            <marker id="arrowhead-yellow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#facc15" />
            </marker>
          </defs>

          {/* Upper Arch */}
          <g transform="translate(50, 50)">
            {upperTeeth.map((tooth, i) => {
              const svgTooth = (teethData as any)[tooth.id.toString()];
              return (
                <g key={tooth.id} transform={`translate(${i * 65}, 0)`}>
                  <Tooth 
                    data={tooth} 
                    isSelected={selectedToothIds.includes(tooth.id)} 
                    onClick={() => onToothClick(tooth.id)}
                    onContextMenu={(e) => onToothContextMenu(e, tooth.id)}
                    onAnchorClick={onAnchorClick}
                    showBrackets={showBrackets}
                    showAnchors={showAnchors}
                    notationSystem={notationSystem}
                    svgData={svgTooth ? {
                      body: svgTooth.body,
                      bracket: svgTooth.bracket,
                      band: svgTooth.band,
                      tube: svgTooth.tube,
                      bbox: svgTooth.bbox
                    } : undefined}
                  />
                </g>
              );
            })}
          </g>

          {/* Lower Arch */}
          <g transform="translate(50, 300)">
            {lowerTeeth.map((tooth, i) => {
              const svgTooth = (teethData as any)[tooth.id.toString()];
              return (
                <g key={tooth.id} transform={`translate(${i * 65}, 0)`}>
                  <Tooth 
                    data={tooth} 
                    isSelected={selectedToothIds.includes(tooth.id)} 
                    onClick={() => onToothClick(tooth.id)}
                    onContextMenu={(e) => onToothContextMenu(e, tooth.id)}
                    onAnchorClick={onAnchorClick}
                    showBrackets={showBrackets}
                    showAnchors={showAnchors}
                    notationSystem={notationSystem}
                    svgData={svgTooth ? {
                      body: svgTooth.body,
                      bracket: svgTooth.bracket,
                      band: svgTooth.band,
                      tube: svgTooth.tube,
                      bbox: svgTooth.bbox
                    } : undefined}
                  />
                </g>
              );
            })}
          </g>

          {/* Independent Anchor Points Layer */}
          {showAnchors && (
            <g>
              {/* Upper Anchors */}
              {upperTeeth.map((tooth) => {
                const pos = getAnchorCoords(tooth.id, 'apical');
                const izcPos = tooth.anchors.infrazygomatic ? getAnchorCoords(tooth.id, 'infrazygomatic') : null;
                return (
                  <g key={`anchors-upper-${tooth.id}`}>
                    <circle 
                      cx={pos.x} 
                      cy={pos.y} 
                      r="6" 
                      fill="#3b82f6" 
                      fillOpacity="0.15"
                      stroke="#3b82f6"
                      strokeWidth="1.5"
                      className="cursor-pointer hover:fill-opacity-40 hover:scale-125 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnchorClick(tooth.id, 'apical');
                      }}
                    />
                    {izcPos && (
                      <g 
                        className="cursor-pointer group"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnchorClick(tooth.id, 'infrazygomatic');
                        }}
                      >
                        <rect 
                          x={izcPos.x - 8} 
                          y={izcPos.y - 8} 
                          width="16" 
                          height="16" 
                          fill="#3b82f6" 
                          fillOpacity="0.1" 
                          stroke="#3b82f6" 
                          strokeWidth="1.5"
                          strokeDasharray="3 2"
                          className="group-hover:fill-opacity-30 transition-all"
                        />
                        <text x={izcPos.x} y={izcPos.y + 3} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#3b82f6" className="pointer-events-none">IZC</text>
                      </g>
                    )}
                  </g>
                );
              })}
              {/* Lower Anchors */}
              {lowerTeeth.map((tooth) => {
                const pos = getAnchorCoords(tooth.id, 'apical');
                return (
                  <circle 
                    key={`anchor-lower-${tooth.id}`}
                    cx={pos.x} 
                    cy={pos.y} 
                    r="6" 
                    fill="#3b82f6" 
                    fillOpacity="0.15"
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    className="cursor-pointer hover:fill-opacity-40 hover:scale-125 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnchorClick(tooth.id, 'apical');
                    }}
                  />
                );
              })}
            </g>
          )}

          {/* Archwire Visualization */}
          {showArchwire && (
            <g>
              <g opacity="0.6">
                {(() => {
                  const uStart = getAnchorCoords(upperTeeth[0].id, 'mesial');
                  const uEnd = getAnchorCoords(upperTeeth[upperTeeth.length - 1].id, 'mesial');
                  const uMid = getAnchorCoords(upperTeeth[Math.floor(upperTeeth.length / 2)].id, 'mesial');
                  
                  const lStart = getAnchorCoords(lowerTeeth[0].id, 'mesial');
                  const lEnd = getAnchorCoords(lowerTeeth[lowerTeeth.length - 1].id, 'mesial');
                  const lMid = getAnchorCoords(lowerTeeth[Math.floor(lowerTeeth.length / 2)].id, 'mesial');

                  return (
                    <>
                      <path 
                        d={`M ${uStart.x},${uStart.y} Q ${uMid.x},${uMid.y + 4} ${uEnd.x},${uEnd.y}`} 
                        fill="none" 
                        stroke="#94a3b8" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                      />
                      <path 
                        d={`M ${lStart.x},${lStart.y} Q ${lMid.x},${lMid.y} ${lEnd.x},${lEnd.y}`} 
                        fill="none" 
                        stroke="#94a3b8" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                      />
                    </>
                  );
                })()}
              </g>

              {/* Archwire Labels in the center */}
              <g transform="translate(550, 240)">
                {/* Upper Archwire Label */}
                {upperArchwire && (
                  <g transform="translate(0, -30)">
                    <rect x="-80" y="-15" width="160" height="30" rx="15" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" />
                    <text textAnchor="middle" dominantBaseline="middle" className="text-[11px] font-bold fill-blue-600 uppercase tracking-wider">
                      Upper: {upperArchwire.material} {upperArchwire.size}
                    </text>
                  </g>
                )}
                
                {/* Lower Archwire Label */}
                {lowerArchwire && (
                  <g transform="translate(0, 0)">
                    <rect x="-80" y="-15" width="160" height="30" rx="15" fill="#f8fafc" stroke="#64748b" strokeWidth="1" strokeDasharray="4 2" />
                    <text textAnchor="middle" dominantBaseline="middle" className="text-[11px] font-bold fill-slate-600 uppercase tracking-wider">
                      Lower: {lowerArchwire.material} {lowerArchwire.size}
                    </text>
                  </g>
                )}

                {/* Placeholder if none selected but showArchwire is on */}
                {!upperArchwire && !lowerArchwire && (
                  <text textAnchor="middle" dominantBaseline="middle" className="text-[10px] font-medium fill-slate-300 italic uppercase tracking-widest">
                    No archwires selected
                  </text>
                )}
              </g>
            </g>
          )}

          {/* Power Chains */}
          {powerChains.map(pc => (
            <g key={pc.id}>
              <PowerChain 
                config={pc} 
                getAnchorCoords={getAnchorCoords} 
                onRemove={() => removePowerChain(pc.id)} 
                miniscrews={miniscrews}
              />
            </g>
          ))}

          {/* Accessories */}
          {accessories.map(acc => (
            <g key={acc.id}>
              <AccessoryComponent config={acc} getAnchorCoords={getAnchorCoords} onRemove={() => removeAccessory(acc.id)} />
            </g>
          ))}

          {/* Miniscrews */}
          {miniscrews.map(ms => (
            <g key={ms.id}>
              <MiniscrewComponent 
                config={ms} 
                getAnchorCoords={getAnchorCoords} 
                onRemove={() => removeMiniscrew(ms.id)} 
                isSelected={selectedMiniscrewId === ms.id}
                onClick={() => onMiniscrewClick?.(ms.id)}
              />
            </g>
          ))}

          {/* IPR Markers */}
          {iprMarkers.map(ipr => (
            <g key={ipr.id}>
              <IPRTag config={ipr} getAnchorCoords={getAnchorCoords} onRemove={() => removeIPRMarker(ipr.id)} />
            </g>
          ))}

          {/* Space Markers */}
          {spaceMarkers.map(sm => (
            <g key={sm.id}>
              <SpaceTag config={sm} getAnchorCoords={getAnchorCoords} onRemove={() => removeSpaceMarker(sm.id)} />
            </g>
          ))}

          {/* Appliances */}
          {appliances.map(app => {
            const p1 = getAnchorCoords(app.toothIds[0], 'mesial');
            const p2 = getAnchorCoords(app.toothIds[app.toothIds.length - 1], 'mesial');
            return (
              <g key={app.id} className="cursor-pointer group" onClick={(e) => { e.stopPropagation(); removeAppliance(app.id); }}>
                <path 
                  d={`M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2} ${app.isUpper ? p1.y - 40 : p1.y + 40} ${p2.x} ${p2.y}`} 
                  fill="none" 
                  stroke="#64748b" 
                  strokeWidth="4" 
                  strokeLinecap="round"
                  className="group-hover:stroke-blue-400 transition-colors"
                />
                <text x={(p1.x + p2.x) / 2} y={app.isUpper ? p1.y - 45 : p1.y + 55} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#475569">{app.type}</text>
              </g>
            );
          })}

          {/* Elastics */}
          {elastics.map(elastic => {
            const points = elastic.toothIds.map(id => getAnchorCoords(id, 'mesial'));
            const isClosedShape = points.length > 2;
            const midPoint = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
            
            const generatePath = () => {
              const sortedPoints = [...points];
              if (isClosedShape) {
                const center = sortedPoints.reduce((acc, p) => ({ x: acc.x + p.x / sortedPoints.length, y: acc.y + p.y / sortedPoints.length }), { x: 0, y: 0 });
                sortedPoints.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
              }

              if (sortedPoints.length === 2) {
                const p1 = sortedPoints[0];
                const p2 = sortedPoints[1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const nx = -dy / dist;
                const ny = dx / dist;
                const curveAmount = 15;
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const cpX = midX + nx * curveAmount;
                const cpY = midY + ny * curveAmount;
                return `M ${p1.x} ${p1.y} Q ${cpX} ${cpY} ${p2.x} ${p2.y}`;
              } else {
                const path = sortedPoints.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
                return isClosedShape ? `${path} Z` : path;
              }
            };

            return (
              <g key={elastic.id} className="cursor-pointer group" onClick={(e) => { e.stopPropagation(); removeElastic(elastic.id); }}>
                <path d={generatePath()} fill={isClosedShape ? "rgba(234, 179, 8, 0.05)" : "none"} stroke="transparent" strokeWidth="12" className="group-hover:stroke-yellow-400/20 transition-all" />
                <path d={generatePath()} fill={isClosedShape ? "rgba(234, 179, 8, 0.15)" : "none"} stroke="#eab308" strokeWidth="3" strokeDasharray="4 2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:stroke-yellow-600 transition-all" />
                <circle cx={midPoint.x} cy={midPoint.y} r="8" fill="white" stroke="#eab308" strokeWidth="1" />
                <text x={midPoint.x} y={midPoint.y} textAnchor="middle" dominantBaseline="middle" fontSize="6" fontWeight="bold" fill="#854d0e">{elastic.size.replace('"', '')}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

function AccessoryComponent({ config, getAnchorCoords, onRemove }: { config: Accessory, getAnchorCoords: (id: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const points = config.toothIds.map(id => getAnchorCoords(id, 'mesial'));
  const midPoint = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });

  if (config.type === 'compressed-coil' && points.length >= 2) {
    const p1 = points[0];
    const p2 = points[points.length - 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(dist / 4);
    const coilPoints: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = p1.x + dx * t;
      const y = p1.y + dy * t + (i % 2 === 0 ? -3 : 3);
      coilPoints.push(`${x},${y}`);
    }

    return (
      <g className="cursor-pointer group" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
        <polyline points={coilPoints.join(' ')} fill="none" stroke="#94a3b8" strokeWidth="2" className="group-hover:stroke-blue-400 transition-colors" />
        <text x={midPoint.x} y={config.isUpper ? midPoint.y - 15 : midPoint.y + 20} textAnchor="middle" fontSize="6" fontWeight="bold" fill="#64748b" className="uppercase tracking-tighter">Coil</text>
      </g>
    );
  }

  if (config.type === 'torque-spring') {
    return (
      <g className="cursor-pointer group" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
        <path d={`M ${midPoint.x - 5} ${midPoint.y} Q ${midPoint.x} ${config.isUpper ? midPoint.y - 15 : midPoint.y + 15} ${midPoint.x + 5} ${midPoint.y}`} fill="none" stroke="#f43f5e" strokeWidth="2" className="group-hover:stroke-blue-400 transition-colors" />
        <text x={midPoint.x} y={config.isUpper ? midPoint.y - 20 : midPoint.y + 25} textAnchor="middle" fontSize="6" fontWeight="bold" fill="#e11d48" className="uppercase tracking-tighter">Torque</text>
      </g>
    );
  }

  if (config.type === 'rotational-wedge') {
    return (
      <g className="cursor-pointer group" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
        <rect x={midPoint.x - 4} y={midPoint.y - 4} width="8" height="8" rx="1" fill="#10b981" className="group-hover:fill-blue-400 transition-colors" />
        <text x={midPoint.x} y={config.isUpper ? midPoint.y - 12 : midPoint.y + 18} textAnchor="middle" fontSize="6" fontWeight="bold" fill="#059669" className="uppercase tracking-tighter">Wedge</text>
      </g>
    );
  }

  return null;
}

// Helper components (PowerChain, MiniscrewComponent, IPRTag, SpaceTag)
// These should ideally be in separate files or defined here if they are small enough.

function PowerChain({ config, getAnchorCoords, onRemove, miniscrews }: { 
  config: PowerChainConfig, 
  getAnchorCoords: (id: number, type: keyof ToothAnchors) => { x: number, y: number }, 
  onRemove: () => void,
  miniscrews: Miniscrew[]
}) {
  const spacing = config.type === 'open' ? 8 : config.type === 'long' ? 14 : 4;
  const radius = 3;
  const points: { x: number, y: number }[] = [];

  if (config.miniscrewId) {
    const ms = miniscrews.find(m => m.id === config.miniscrewId);
    if (ms) {
      points.push(getAnchorCoords(ms.toothId, ms.anchorType));
    }
    const teethIds = [...config.activeTeeth, config.anchorTeeth[0]];
    teethIds.forEach((id) => {
      points.push(getAnchorCoords(id, 'mesial'));
      points.push(getAnchorCoords(id, 'distal'));
    });
  } else {
    const allTeethIds = [config.anchorTeeth[0], ...config.activeTeeth, config.anchorTeeth[1]];
    allTeethIds.forEach((id) => {
      points.push(getAnchorCoords(id, 'mesial'));
      points.push(getAnchorCoords(id, 'distal'));
    });
  }
  const loops: { x: number, y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / spacing));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      loops.push({ x: p1.x + dx * t, y: p1.y + dy * t });
    }
  }
  return (
    <g className="power-chain cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <motion.g animate={{ scale: [0.98, 1.02, 0.98] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
        {loops.map((loop, i) => (
          <circle key={i} cx={loop.x} cy={loop.y} r={radius} fill="none" stroke={config.color} strokeWidth="1.5" strokeOpacity="0.8" />
        ))}
      </motion.g>
    </g>
  );
}

function MiniscrewComponent({ config, getAnchorCoords, onRemove, isSelected, onClick }: { 
  config: Miniscrew, 
  getAnchorCoords: (tid: number, type: keyof ToothAnchors) => { x: number, y: number }, 
  onRemove: () => void,
  isSelected?: boolean,
  onClick?: () => void
}) {
  const pos = getAnchorCoords(config.toothId, config.anchorType);
  return (
    <g 
      className="miniscrew cursor-pointer group" 
      onClick={(e) => { 
        e.stopPropagation(); 
        if (e.shiftKey) {
          onRemove();
        } else {
          onClick?.();
        }
      }}
    >
      <circle 
        cx={pos.x} 
        cy={pos.y} 
        r="15" 
        fill={isSelected ? "#3b82f6" : "#94a3b8"} 
        stroke={isSelected ? "#1d4ed8" : "#475569"} 
        strokeWidth={isSelected ? "4" : "2.5"} 
        className="transition-all"
      />
      <path d={`M ${pos.x - 9} ${pos.y} L ${pos.x + 9} ${pos.y} M ${pos.x} ${pos.y - 9} L ${pos.x} ${pos.y + 9}`} stroke="white" strokeWidth="2.5" />
      <text x={pos.x} y={pos.y + 25} textAnchor="middle" fontSize="8" fontWeight="bold" fill={isSelected ? "#1d4ed8" : "#64748b"} className="uppercase tracking-tighter">
        {isSelected ? "Selected" : "Miniscrew"}
      </text>
      {config.forceArrow && (
        <ForceArrow start={pos} end={getAnchorCoords(config.forceArrow.targetToothId, config.forceArrow.targetAnchorType)} magnitude={config.forceArrow.magnitude} />
      )}
    </g>
  );
}

function ForceArrow({ start, end, magnitude }: { start: { x: number, y: number }, end: { x: number, y: number }, magnitude?: string }) {
  return (
    <g>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#facc15" strokeWidth="2" markerEnd="url(#arrowhead-yellow)" />
      {magnitude && (
        <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 5} fontSize="10" fill="#854d0e" textAnchor="middle" fontWeight="bold">
          {magnitude}
        </text>
      )}
    </g>
  );
}

function IPRTag({ config, getAnchorCoords, onRemove }: { config: IPRMarker, getAnchorCoords: (tid: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const pos = getAnchorCoords(config.toothId, config.anchorType);
  return (
    <g className="ipr-tag cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <rect x={pos.x - 14} y={pos.y - 10} width="28" height="20" rx="6" fill="#fee2e2" stroke="#ef4444" strokeWidth="1.5" />
      <text x={pos.x} y={pos.y + 4} fontSize="9" textAnchor="middle" fill="#b91c1c" fontWeight="bold">{config.value}</text>
    </g>
  );
}

function SpaceTag({ config, getAnchorCoords, onRemove }: { config: SpaceMarker, getAnchorCoords: (tid: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const pos = getAnchorCoords(config.toothId, config.anchorType);
  return (
    <g className="space-tag cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <rect x={pos.x - 14} y={pos.y - 10} width="28" height="20" rx="6" fill="#f0fdf4" stroke="#22c55e" strokeWidth="1.5" />
      <text x={pos.x} y={pos.y + 4} fontSize="9" textAnchor="middle" fill="#15803d" fontWeight="bold">{config.value}</text>
    </g>
  );
}

export default OrthodonticChartCanvas;
