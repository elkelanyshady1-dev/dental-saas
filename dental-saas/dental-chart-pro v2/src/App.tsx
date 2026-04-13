import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  User, 
  Settings, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Save,
  ChevronRight,
  AlertCircle,
  Info,
  X,
  Trash2,
  RefreshCw,
  Move,
  ShieldAlert,
  Stethoscope,
  Square,
  ChevronDown,
  CircleDot,
  Search,
  Bell,
  Grid,
  CreditCard,
  Calendar,
  FileText,
  LayoutDashboard,
  Users,
  MessageSquare,
  MessageCircle,
  Mail,
  Smartphone,
  UserPen,
  Smile,
  Pill,
  Phone,
  MoreHorizontal,
  MoreVertical,
  Wand2,
  DoorOpen,
  PanelLeft,
  Plus,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Link as LinkIcon,
  Download,
  FileImage,
  FileCode,
  FileText as FileTextIcon,
  Undo2,
  Redo2,
  TriangleAlert
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { ActionPanel } from './components/orthodontics/ActionPanel';
import { OrthodonticAppointmentProvider, useOrthodonticAppointment } from './context/OrthodonticAppointmentContext';
import PatientOrthodonticModule from './components/orthodontics/patient/PatientOrthodonticModule';
import { Tooth } from './components/Tooth';
import { 
  UPPER_TEETH, 
  LOWER_TEETH, 
  ToothData, 
  ToothStatus, 
  getPalmerNotation, 
  ElasticConnection, 
  ElasticType, 
  ElasticSize,
  Appliance,
  ApplianceType,
  BracketPrescription,
  BracketBrand,
  PowerChainConfig,
  PowerChainType,
  PowerChainDirection,
  ToothAnchors,
  Miniscrew,
  IPRMarker,
  SpaceMarker,
  Accessory,
  Snapshot,
  Action
} from './types';

const POWERCHAIN_COLORS = {
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f97316",
  gray: "#64748b",
  clear: "#e5e7eb"
};

const QuadrantIcon = ({ q }: { q: 1 | 2 | 3 | 4 }) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeOpacity="0.2" />
    <line x1="12" y1="3" x2="12" y2="21" strokeOpacity="0.2" />
    <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.2" />
    {q === 1 && <rect x="12" y="3" width="9" height="9" fill="currentColor" fillOpacity="0.5" />}
    {q === 2 && <rect x="3" y="3" width="9" height="9" fill="currentColor" fillOpacity="0.5" />}
    {q === 3 && <rect x="3" y="12" width="9" height="9" fill="currentColor" fillOpacity="0.5" />}
    {q === 4 && <rect x="12" y="12" width="9" height="9" fill="currentColor" fillOpacity="0.5" />}
  </svg>
);

function ForceArrow({ start, end, magnitude }: { start: { x: number, y: number }, end: { x: number, y: number }, magnitude?: string }) {
  return (
    <g>
      <line 
        x1={start.x} y1={start.y} 
        x2={end.x} y2={end.y} 
        stroke="#facc15" 
        strokeWidth="2" 
        markerEnd="url(#arrowhead-yellow)" 
      />
      {magnitude && (
        <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 5} fontSize="10" fill="#854d0e" textAnchor="middle" fontWeight="bold">
          {magnitude}
        </text>
      )}
    </g>
  );
}

function PowerChain({ config, getAnchorCoords, onRemove }: { config: PowerChainConfig, getAnchorCoords: (id: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const spacing = config.type === 'open' ? 8 : config.type === 'long' ? 14 : 4;
  const radius = 3;
  
  const allTeethIds = [config.anchorTeeth[0], ...config.activeTeeth, config.anchorTeeth[1]];
  // Connect mesial to distal across teeth
  const points: { x: number, y: number }[] = [];
  allTeethIds.forEach((id) => {
    points.push(getAnchorCoords(id, 'mesial'));
    points.push(getAnchorCoords(id, 'distal'));
  });
  
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
      loops.push({
        x: p1.x + dx * t,
        y: p1.y + dy * t
      });
    }
  }

  return (
    <g className="power-chain cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <motion.g
        animate={{ scale: [0.98, 1.02, 0.98] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        {loops.map((loop, i) => (
          <circle
            key={i}
            cx={loop.x}
            cy={loop.y}
            r={radius}
            fill="none"
            stroke={config.color}
            strokeWidth="1.5"
            strokeOpacity="0.8"
          />
        ))}
        {config.type === 'closed' && (
          <path
            d={`M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`}
            fill="none"
            stroke={config.color}
            strokeWidth="2"
            strokeOpacity="0.4"
          />
        )}
      </motion.g>
      <title>Click to remove Power Chain</title>
    </g>
  );
}

function MiniscrewComponent({ config, getAnchorCoords, onRemove }: { config: Miniscrew, getAnchorCoords: (tid: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const pos = getAnchorCoords(config.toothId, config.anchorType);
  
  return (
    <g className="miniscrew cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <circle cx={pos.x} cy={pos.y} r="15" fill="#94a3b8" stroke="#475569" strokeWidth="2.5" />
      <path d={`M ${pos.x - 9} ${pos.y} L ${pos.x + 9} ${pos.y} M ${pos.x} ${pos.y - 9} L ${pos.x} ${pos.y + 9}`} stroke="white" strokeWidth="2.5" />
      
      {config.forceArrow && (
        <ForceArrow 
          start={pos} 
          end={getAnchorCoords(config.forceArrow.targetToothId, config.forceArrow.targetAnchorType)}
          magnitude={config.forceArrow.magnitude}
        />
      )}
      <title>{`Miniscrew (TAD)${config.brand ? ` - ${config.brand}` : ''}${config.length ? ` (${config.length} x ${config.diameter})` : ''}`}</title>
    </g>
  );
}

function IPRTag({ config, getAnchorCoords, onRemove }: { config: IPRMarker, getAnchorCoords: (tid: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const pos = getAnchorCoords(config.toothId, config.anchorType);
  return (
    <g className="ipr-tag cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <rect x={pos.x - 14} y={pos.y - 10} width="28" height="20" rx="6" fill="#fee2e2" stroke="#ef4444" strokeWidth="1.5" />
      <text x={pos.x} y={pos.y + 4} fontSize="9" textAnchor="middle" fill="#b91c1c" fontWeight="bold">{config.value}</text>
      <title>IPR Marker</title>
    </g>
  );
}

function SpaceTag({ config, getAnchorCoords, onRemove }: { config: SpaceMarker, getAnchorCoords: (tid: number, type: keyof ToothAnchors) => { x: number, y: number }, onRemove: () => void }) {
  const pos = getAnchorCoords(config.toothId, config.anchorType);
  return (
    <g className="space-tag cursor-pointer" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
      <rect x={pos.x - 14} y={pos.y - 10} width="28" height="20" rx="6" fill="#f0fdf4" stroke="#22c55e" strokeWidth="1.5" />
      <text x={pos.x} y={pos.y + 4} fontSize="9" textAnchor="middle" fill="#15803d" fontWeight="bold">{config.value}</text>
      <title>Space Marker</title>
    </g>
  );
}

function MiniscrewQuickAction({ 
  x, y, 
  onClose, 
  onApply 
}: { 
  x: number, y: number, 
  onClose: () => void, 
  onApply: (length: string, diameter: string, brand: string) => void 
}) {
  const [length, setLength] = useState("8mm");
  const [diameter, setDiameter] = useState("1.6mm");
  const [brand, setBrand] = useState("VectorTAS");

  return (
    <div 
      className="absolute z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 w-48 animate-in fade-in zoom-in duration-200"
      style={{ left: x, top: y, transform: 'translate(-50%, -100%)', marginTop: '-10px', pointerEvents: 'auto' }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add Miniscrew</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>
      </div>
      
      <div className="space-y-2">
        <div>
          <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Brand</label>
          <select 
            value={brand} 
            onChange={(e) => setBrand(e.target.value)}
            className="w-full text-[10px] p-1 border border-slate-100 rounded bg-slate-50"
          >
            <option>VectorTAS</option>
            <option>Forestadent</option>
            <option>Dentsply</option>
            <option>Bio-Ray</option>
          </select>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Length</label>
            <select 
              value={length} 
              onChange={(e) => setLength(e.target.value)}
              className="w-full text-[10px] p-1 border border-slate-100 rounded bg-slate-50"
            >
              <option>6mm</option>
              <option>8mm</option>
              <option>10mm</option>
              <option>12mm</option>
            </select>
          </div>
          <div>
            <label className="text-[8px] font-bold text-slate-400 uppercase block mb-1">Diameter</label>
            <select 
              value={diameter} 
              onChange={(e) => setDiameter(e.target.value)}
              className="w-full text-[10px] p-1 border border-slate-100 rounded bg-slate-50"
            >
              <option>1.4mm</option>
              <option>1.6mm</option>
              <option>1.8mm</option>
              <option>2.0mm</option>
            </select>
          </div>
        </div>
        
        <button 
          onClick={() => onApply(length, diameter, brand)}
          className="w-full py-1.5 bg-blue-600 text-white rounded text-[10px] font-bold hover:bg-blue-700 transition-colors mt-1"
        >
          Place TAD
        </button>
      </div>
    </div>
  );
}

function OrthodonticApp() {
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'patients' | 'calendar' | 'financial' | 'settings'>('patients');
  const [patientTab, setPatientTab] = useState<'OVERVIEW' | 'TIMELINE' | 'CLINICAL' | 'ORTHODONTIC' | 'TREATMENTS' | 'APPOINTMENTS' | 'FINANCIAL'>('ORTHODONTIC');
  const [isPrivate, setIsPrivate] = useState(false);
  const { addAction } = useOrthodonticAppointment();
  const [upperTeeth, setUpperTeeth] = useState<ToothData[]>(UPPER_TEETH);
  const [lowerTeeth, setLowerTeeth] = useState<ToothData[]>(LOWER_TEETH);
  const [selectedToothIds, setSelectedToothIds] = useState<number[]>([]);
  const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [activeCategory, setActiveCategory] = useState<'bracket' | 'conditions' | 'todo' | 'elastics' | 'alerts' | 'appliances' | 'prescription' | 'brand' | 'accessories' | null>(null);
  const [activeSubCategory, setActiveSubCategory] = useState<'1st' | '2nd' | '3rd' | null>(null);
  const [notationSystem, setNotationSystem] = useState<'fdi' | 'palmer' | 'both'>('both');
  
  const [showArchwire, setShowArchwire] = useState(true);
  const [showBrackets, setShowBrackets] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showAnchors, setShowAnchors] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isMaximized, setIsMaximized] = useState(false);
  const [elastics, setElastics] = useState<ElasticConnection[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [miniscrews, setMiniscrews] = useState<Miniscrew[]>([]);
  const [iprMarkers, setIprMarkers] = useState<IPRMarker[]>([]);
  const [spaceMarkers, setSpaceMarkers] = useState<SpaceMarker[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [treatmentPlan, setTreatmentPlan] = useState<string[]>(['44s Extraction', 'Expansion']);
  const [problemList, setProblemList] = useState<string[]>(['Crowding', 'Class II Div 1']);
  const [activeElasticType, setActiveElasticType] = useState<ElasticType | null>(null);
  const [activeApplianceType, setActiveApplianceType] = useState<ApplianceType | null>(null);
  const [powerChains, setPowerChains] = useState<PowerChainConfig[]>([]);
  const [activePowerChainType, setActivePowerChainType] = useState<PowerChainType | null>(null);
  const [activePowerChainColor, setActivePowerChainColor] = useState<string>(POWERCHAIN_COLORS.purple);
  const [customColor, setCustomColor] = useState("");
  const [miniscrewDialog, setMiniscrewDialog] = useState<{ toothId: number, anchorType: Miniscrew['anchorType'], x: number, y: number } | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => {
    const saved = localStorage.getItem('ortho-snapshots');
    return saved ? JSON.parse(saved) : [];
  });
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    localStorage.setItem('ortho-snapshots', JSON.stringify(snapshots));
  }, [snapshots]);

  const saveSnapshot = async (actions: Action[] = [], notes: string = '', attachments: any[] = []) => {
    if (chartRef.current) {
      try {
        const thumbnail = await toPng(chartRef.current as unknown as HTMLElement, { 
          backgroundColor: '#ffffff',
          pixelRatio: 0.5,
          width: 400,
          height: 200
        });
        
        const newSnapshot: Snapshot = {
          id: Math.random().toString(36).substr(2, 9),
          caseId: 'current-case',
          appointmentId: 'current-appt',
          createdAt: Date.now(),
          thumbnail,
          chartState: {
            upperTeeth: JSON.parse(JSON.stringify(upperTeeth)),
            lowerTeeth: JSON.parse(JSON.stringify(lowerTeeth)),
            elastics: JSON.parse(JSON.stringify(elastics)),
            appliances: JSON.parse(JSON.stringify(appliances)),
            powerChains: JSON.parse(JSON.stringify(powerChains)),
            miniscrews: JSON.parse(JSON.stringify(miniscrews)),
            iprMarkers: JSON.parse(JSON.stringify(iprMarkers)),
            spaceMarkers: JSON.parse(JSON.stringify(spaceMarkers)),
            accessories: JSON.parse(JSON.stringify(accessories)),
          },
          actions: JSON.parse(JSON.stringify(actions)),
          notes,
          attachments: [] 
        };
        
        setSnapshots(prev => [newSnapshot, ...prev]);
      } catch (err) {
        console.error('Failed to save snapshot:', err);
      }
    }
  };

  const loadSnapshot = (snapshot: Snapshot) => {
    const { chartState } = snapshot;
    setUpperTeeth(chartState.upperTeeth);
    setLowerTeeth(chartState.lowerTeeth);
    setElastics(chartState.elastics);
    setAppliances(chartState.appliances);
    setPowerChains(chartState.powerChains || []);
    setMiniscrews(chartState.miniscrews || []);
    setIprMarkers(chartState.iprMarkers || []);
    setSpaceMarkers(chartState.spaceMarkers || []);
    saveHistory(
      chartState.upperTeeth, 
      chartState.lowerTeeth, 
      chartState.elastics, 
      chartState.appliances, 
      chartState.powerChains || [], 
      chartState.miniscrews || [], 
      chartState.iprMarkers || [], 
      chartState.spaceMarkers || [],
      chartState.accessories || []
    );
  };

  const deleteSnapshot = (id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id));
  };

  const getCoords = (tooth: ToothData) => {
    const isUpper = tooth.isUpper;
    const teeth = isUpper ? upperTeeth : lowerTeeth;
    const index = teeth.findIndex(t => t.id === tooth.id);
    const x = 160 + index * 45 + 20;
    const y = (isUpper ? 50 : 300) + 40;
    return { x, y };
  };

  const getAnchorCoords = (toothId: number, anchorType: keyof ToothAnchors) => {
    const tooth = [...upperTeeth, ...lowerTeeth].find(t => t.id === toothId);
    if (!tooth) return { x: 0, y: 0 };
    const base = getCoords(tooth);
    const isUpper = tooth.isUpper;
    
    if (isUpper) {
      return {
        x: base.x - 20 + tooth.anchors[anchorType].x,
        y: 50 + tooth.anchors[anchorType].y
      };
    } else {
      // Mandibular arch is flipped: translate(160, 300) scale(1, -1)
      return {
        x: base.x - 20 + tooth.anchors[anchorType].x,
        y: 300 - tooth.anchors[anchorType].y
      };
    }
  };

  const handleAnchorClick = (toothId: number, anchorType: keyof ToothAnchors) => {
    const coords = getAnchorCoords(toothId, anchorType);
    setMiniscrewDialog({ toothId, anchorType: anchorType as Miniscrew['anchorType'], x: coords.x, y: coords.y });
  };

  const allTeeth = useMemo(() => [...upperTeeth, ...lowerTeeth], [upperTeeth, lowerTeeth]);
  const alertTeeth = useMemo(() => allTeeth.filter(t => t.alertNote), [allTeeth]);

  const caseSummary = useMemo(() => {
    const prescriptions = Array.from(new Set(allTeeth.map(t => t.prescription).filter(Boolean)));
    const brands = Array.from(new Set(allTeeth.map(t => t.brand).filter(Boolean)));
    const activeAppliances = Array.from(new Set(appliances.map(a => a.type)));
    const activeElastics = Array.from(new Set(elastics.map(e => e.type)));
    
    return { prescriptions, brands, activeAppliances, activeElastics, alerts: alertTeeth };
  }, [allTeeth, alertTeeth, appliances, elastics]);

  // History for Undo/Redo
  const [history, setHistory] = useState<{ 
    upperTeeth: ToothData[], 
    lowerTeeth: ToothData[], 
    elastics: ElasticConnection[], 
    appliances: Appliance[],
    powerChains: PowerChainConfig[],
    miniscrews: Miniscrew[],
    iprMarkers: IPRMarker[],
    spaceMarkers: SpaceMarker[],
    accessories: Accessory[]
  }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveHistory = (
    u: ToothData[], 
    l: ToothData[], 
    e: ElasticConnection[], 
    a: Appliance[], 
    p: PowerChainConfig[],
    m: Miniscrew[],
    ipr: IPRMarker[],
    s: SpaceMarker[],
    acc: Accessory[] = accessories
  ) => {
    const newState = { 
      upperTeeth: JSON.parse(JSON.stringify(u)), 
      lowerTeeth: JSON.parse(JSON.stringify(l)), 
      elastics: JSON.parse(JSON.stringify(e)),
      appliances: JSON.parse(JSON.stringify(a)),
      powerChains: JSON.parse(JSON.stringify(p)),
      miniscrews: JSON.parse(JSON.stringify(m)),
      iprMarkers: JSON.parse(JSON.stringify(ipr)),
      spaceMarkers: JSON.parse(JSON.stringify(s)),
      accessories: JSON.parse(JSON.stringify(acc))
    };
    const newHistory = history.slice(0, historyIndex + 1);
    const updatedHistory = [...newHistory, newState].slice(-50);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex >= 0) {
      const prevIndex = historyIndex - 1;
      if (prevIndex >= 0) {
        const prevState = history[prevIndex];
        setUpperTeeth(prevState.upperTeeth);
        setLowerTeeth(prevState.lowerTeeth);
        setElastics(prevState.elastics);
        setAppliances(prevState.appliances);
        setPowerChains(prevState.powerChains || []);
        setMiniscrews(prevState.miniscrews || []);
        setIprMarkers(prevState.iprMarkers || []);
        setSpaceMarkers(prevState.spaceMarkers || []);
        setAccessories(prevState.accessories || []);
      } else {
        setUpperTeeth(UPPER_TEETH);
        setLowerTeeth(LOWER_TEETH);
        setElastics([]);
        setAppliances([]);
        setPowerChains([]);
        setMiniscrews([]);
        setIprMarkers([]);
        setSpaceMarkers([]);
        setAccessories([]);
      }
      setHistoryIndex(prevIndex);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextState = history[nextIndex];
      setUpperTeeth(nextState.upperTeeth);
      setLowerTeeth(nextState.lowerTeeth);
      setElastics(nextState.elastics);
      setAppliances(nextState.appliances);
      setPowerChains(nextState.powerChains || []);
      setMiniscrews(nextState.miniscrews || []);
      setIprMarkers(nextState.iprMarkers || []);
      setSpaceMarkers(nextState.spaceMarkers || []);
      setAccessories(nextState.accessories || []);
      setHistoryIndex(nextIndex);
    }
  };

  const selectedTooth = useMemo(() => {
    return [...upperTeeth, ...lowerTeeth].find(t => selectedToothIds.includes(t.id));
  }, [selectedToothIds, upperTeeth, lowerTeeth]);

  const handleToothClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedToothIds(prev => 
        prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
      );
    } else {
      setSelectedToothIds([id]);
    }
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveCategory(showBrackets ? 'bracket' : null); // Auto-open bracket category if brackets are enabled
    setActiveSubCategory(null);
  };

  const addElastic = (type: ElasticType, size: ElasticSize) => {
    if (selectedToothIds.length < 2) return;
    
    // Sort toothIds to ensure they are in order for power chains
    const sortedIds = [...selectedToothIds].sort((a, b) => {
      const t1 = [...upperTeeth, ...lowerTeeth].find(t => t.id === a);
      const t2 = [...upperTeeth, ...lowerTeeth].find(t => t.id === b);
      if (!t1 || !t2) return 0;
      return t1.position - t2.position;
    });

    const newElastic: ElasticConnection = {
      id: Math.random().toString(36).substr(2, 9),
      toothIds: sortedIds,
      type,
      size
    };
    
    const newElastics = [...elastics, newElastic];
    setElastics(newElastics);

    addAction({
      type: 'add_elastic',
      tooth: sortedIds.join(', '),
      description: `${type} elastic (${size}) applied`,
    });

    saveHistory(upperTeeth, lowerTeeth, newElastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const updateBracketPrescription = (ids: number[], prescription: BracketPrescription) => {
    const updateList = (list: ToothData[]) => 
      list.map(t => ids.includes(t.id) ? { ...t, prescription } : t);
    const newUpper = updateList(upperTeeth);
    const newLower = updateList(lowerTeeth);
    setUpperTeeth(newUpper);
    setLowerTeeth(newLower);
    saveHistory(newUpper, newLower, elastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const updateBracketBrand = (ids: number[], brand: BracketBrand) => {
    const updateList = (list: ToothData[]) => 
      list.map(t => ids.includes(t.id) ? { ...t, brand } : t);
    const newUpper = updateList(upperTeeth);
    const newLower = updateList(lowerTeeth);
    setUpperTeeth(newUpper);
    setLowerTeeth(newLower);
    saveHistory(newUpper, newLower, elastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const addAppliance = (type: ApplianceType) => {
    if (selectedToothIds.length < 1) return;
    if (type !== 'Mini Screw' && selectedToothIds.length < 2) return;

    const isUpper = selectedToothIds.every(id => id < 30);
    const isLower = selectedToothIds.every(id => id >= 30);
    if (!isUpper && !isLower) return; // Must be in same arch

    const newAppliance: Appliance = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      toothIds: [...selectedToothIds],
      isUpper
    };
    const newAppliances = [...appliances, newAppliance];
    setAppliances(newAppliances);

    addAction({
      type: 'add_appliance',
      tooth: selectedToothIds.join(', '),
      description: `${type} appliance placed`,
    });

    saveHistory(upperTeeth, lowerTeeth, elastics, newAppliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const removeAppliance = (id: string) => {
    const appliance = appliances.find(a => a.id === id);
    const newAppliances = appliances.filter(a => a.id !== id);
    setAppliances(newAppliances);

    if (appliance) {
      addAction({
        type: 'remove_appliance',
        tooth: appliance.toothIds.join(', '),
        description: `${appliance.type} appliance removed`,
      });
    }

    saveHistory(upperTeeth, lowerTeeth, elastics, newAppliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
  };

  const removeElastic = (id: string) => {
    const elastic = elastics.find(e => e.id === id);
    const newElastics = elastics.filter(e => e.id !== id);
    setElastics(newElastics);

    if (elastic) {
      addAction({
        type: 'remove_elastic',
        tooth: elastic.toothIds.join(', '),
        description: `${elastic.type} elastic removed`,
      });
    }

    saveHistory(upperTeeth, lowerTeeth, newElastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
  };

  const addPowerChain = (type: PowerChainType, color: string, direction?: PowerChainDirection) => {
    if (selectedToothIds.length < 2) return;
    const isUpper = selectedToothIds.every(id => id < 30);
    const isLower = selectedToothIds.every(id => id >= 30);
    if (!isUpper && !isLower) return;

    // Sort teeth from left to right (or right to left depending on arch)
    const sortedIds = [...selectedToothIds].sort((a, b) => {
      const t1 = allTeeth.find(t => t.id === a);
      const t2 = allTeeth.find(t => t.id === b);
      if (!t1 || !t2) return 0;
      // For upper arch, 18 is far right, 28 is far left.
      // We want a consistent order. Let's use position and quadrant.
      return a - b; 
    });

    const newPowerChain: PowerChainConfig = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      color,
      anchorTeeth: [sortedIds[0]],
      activeTeeth: sortedIds.slice(1),
      direction,
      isUpper
    };

    const newPowerChains = [...powerChains, newPowerChain];
    setPowerChains(newPowerChains);

    addAction({
      type: 'add_powerchain',
      tooth: sortedIds.join(', '),
      description: `${type} power chain (${color}) added`,
    });

    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, newPowerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const removePowerChain = (id: string) => {
    const pc = powerChains.find(p => p.id === id);
    const newPowerChains = powerChains.filter(p => p.id !== id);
    setPowerChains(newPowerChains);

    if (pc) {
      addAction({
        type: 'remove_powerchain',
        tooth: pc.anchorTeeth.concat(pc.activeTeeth).join(', '),
        description: `${pc.type} power chain removed`,
      });
    }

    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, newPowerChains, miniscrews, iprMarkers, spaceMarkers);
  };

  const addMiniscrew = (toothId: number, anchorType: Miniscrew['anchorType'], length?: string, diameter?: string, brand?: string, angle: number = 0) => {
    const newMiniscrew: Miniscrew = {
      id: Math.random().toString(36).substr(2, 9),
      toothId,
      anchorType,
      angle,
      length,
      diameter,
      brand
    };
    const newMiniscrews = [...miniscrews, newMiniscrew];
    setMiniscrews(newMiniscrews);

    addAction({
      type: 'add_miniscrew',
      tooth: toothId.toString(),
      description: `Miniscrew placed ${anchorType}`,
    });

    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, powerChains, newMiniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
    setMiniscrewDialog(null);
  };

  const removeMiniscrew = (id: string) => {
    const screw = miniscrews.find(m => m.id === id);
    const newMiniscrews = miniscrews.filter(m => m.id !== id);
    setMiniscrews(newMiniscrews);

    if (screw) {
      addAction({
        type: 'remove_miniscrew',
        tooth: screw.toothId.toString(),
        description: `Miniscrew removed from ${screw.anchorType}`,
      });
    }

    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, powerChains, newMiniscrews, iprMarkers, spaceMarkers);
  };

  const addIPRMarker = (toothId: number, anchorType: 'mesial' | 'distal', value: string) => {
    const newMarker: IPRMarker = {
      id: Math.random().toString(36).substr(2, 9),
      toothId,
      anchorType,
      value
    };
    const newMarkers = [...iprMarkers, newMarker];
    setIprMarkers(newMarkers);
    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, powerChains, miniscrews, newMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const removeIPRMarker = (id: string) => {
    const newMarkers = iprMarkers.filter(m => m.id !== id);
    setIprMarkers(newMarkers);
    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, powerChains, miniscrews, newMarkers, spaceMarkers);
  };

  const addSpaceMarker = (toothId: number, anchorType: 'mesial' | 'distal', value: string) => {
    const newMarker: SpaceMarker = {
      id: Math.random().toString(36).substr(2, 9),
      toothId,
      anchorType,
      value
    };
    const newMarkers = [...spaceMarkers, newMarker];
    setSpaceMarkers(newMarkers);

    addAction({
      type: 'add_space',
      tooth: toothId.toString(),
      description: `Space of ${value}mm recorded ${anchorType}`,
    });

    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, powerChains, miniscrews, iprMarkers, newMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
  };

  const removeSpaceMarker = (id: string) => {
    const newMarkers = spaceMarkers.filter(m => m.id !== id);
    setSpaceMarkers(newMarkers);
    saveHistory(upperTeeth, lowerTeeth, elastics, appliances, powerChains, miniscrews, iprMarkers, newMarkers);
  };

  const exportAsPNG = async () => {
    if (chartRef.current) {
      try {
        const dataUrl = await toPng(chartRef.current as unknown as HTMLElement, { 
          backgroundColor: '#ffffff',
          pixelRatio: 2,
          style: {
            transform: 'scale(1)',
          }
        });
        const link = document.createElement('a');
        link.download = `dental-chart-${new Date().getTime()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error('Failed to export PNG:', err);
      }
    }
  };

  const exportAsSVG = () => {
    if (chartRef.current) {
      const svgData = chartRef.current.outerHTML;
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const link = document.createElement('a');
      link.download = `dental-chart-${new Date().getTime()}.svg`;
      link.href = svgUrl;
      link.click();
    }
  };

  const exportAsPDF = async () => {
    if (chartRef.current) {
      try {
        const dataUrl = await toPng(chartRef.current as unknown as HTMLElement, { 
          backgroundColor: '#ffffff',
          pixelRatio: 2
        });
        const pdf = new jsPDF('l', 'px', [1100, 500]);
        pdf.addImage(dataUrl, 'PNG', 0, 0, 1100, 500);
        pdf.save(`dental-chart-${new Date().getTime()}.pdf`);
      } catch (err) {
        console.error('Failed to export PDF:', err);
      }
    }
  };

  const selectQuadrant = (quadrant: number) => {
    const ids = [...upperTeeth, ...lowerTeeth]
      .filter(t => Math.floor(t.id / 10) === quadrant)
      .map(t => t.id);
    setSelectedToothIds(ids);
    setMenuPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  const selectArch = (isUpper: boolean) => {
    const ids = (isUpper ? upperTeeth : lowerTeeth).map(t => t.id);
    setSelectedToothIds(ids);
    setMenuPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  };

  const updateToothStatus = (ids: number[], newStatus: ToothStatus) => {
    const updateList = (list: ToothData[]) => 
      list.map(t => ids.includes(t.id) ? { ...t, status: newStatus } : t);
    
    const newUpper = updateList(upperTeeth);
    const newLower = updateList(lowerTeeth);
    
    setUpperTeeth(newUpper);
    setLowerTeeth(newLower);

    ids.forEach(id => {
      addAction({
        type: 'update_status',
        tooth: id.toString(),
        description: `${newStatus.replace('-', ' ')} on ${id}`,
      });
    });

    saveHistory(newUpper, newLower, elastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
    setActiveSubCategory(null);
  };

  const updateBracketColor = (ids: number[], color: string) => {
    const updateList = (list: ToothData[]) => 
      list.map(t => ids.includes(t.id) ? { ...t, bracketColor: color } : t);
    
    const newUpper = updateList(upperTeeth);
    const newLower = updateList(lowerTeeth);
    
    setUpperTeeth(newUpper);
    setLowerTeeth(newLower);
    saveHistory(newUpper, newLower, elastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
    setActiveSubCategory(null);
  };

  const updateToothAlert = (ids: number[], note: string | undefined) => {
    const updateList = (list: ToothData[]) => 
      list.map(t => ids.includes(t.id) ? { 
        ...t, 
        alertNote: note, 
        status: (note ? 'alert' : (t.status === 'alert' ? 'healthy' : t.status)) as ToothStatus
      } : t);
    
    const newUpper = updateList(upperTeeth);
    const newLower = updateList(lowerTeeth);
    
    setUpperTeeth(newUpper);
    setLowerTeeth(newLower);
    saveHistory(newUpper, newLower, elastics, appliances, powerChains, miniscrews, iprMarkers, spaceMarkers);
    setSelectedToothIds([]);
    setMenuPosition(null);
    setActiveCategory(null);
    setActiveSubCategory(null);
  };

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (selectedToothIds.length > 0) {
        setSelectedToothIds([]);
        setMenuPosition(null);
        setActiveCategory(null);
        setActiveSubCategory(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [selectedToothIds]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0f2f5] text-slate-900 font-sans">
      {/* Left Icon Sidebar */}
      <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-6 z-20">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white mb-4">
          <Activity className="w-6 h-6" />
        </div>
        <SidebarIcon icon={<LayoutDashboard className="w-5 h-5" />} active={currentPage === 'dashboard'} onClick={() => setCurrentPage('dashboard')} />
        <SidebarIcon icon={<Users className="w-5 h-5" />} active={currentPage === 'patients'} onClick={() => setCurrentPage('patients')} />
        <SidebarIcon icon={<Calendar className="w-5 h-5" />} active={currentPage === 'calendar'} onClick={() => setCurrentPage('calendar')} />
        <SidebarIcon icon={<FileText className="w-5 h-5" />} active={currentPage === 'financial'} onClick={() => setCurrentPage('financial')} />
        <SidebarIcon icon={<CreditCard className="w-5 h-5" />} />
        <SidebarIcon icon={<Grid className="w-5 h-5" />} />
        <div className="mt-auto flex flex-col gap-6 pb-4">
          <SidebarIcon icon={<MessageSquare className="w-5 h-5" />} />
          <SidebarIcon icon={<Settings className="w-5 h-5" />} active={currentPage === 'settings'} onClick={() => setCurrentPage('settings')} />
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm">
            <img src="https://picsum.photos/seed/doc/100/100" alt="User" referrerPolicy="no-referrer" />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation */}
        <header className="h-16 bg-[#1a2332] flex items-center justify-between px-8 z-10 shadow-lg">
          <div className="flex items-center gap-6 w-1/3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search patient, treatment or appointment..." 
                className="w-full bg-slate-800/40 border border-slate-700/50 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:bg-slate-800/60 transition-all outline-none"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-slate-700 rounded text-[10px] text-slate-400 font-mono">⌘K</div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 p-2 rounded-lg">
              <Grid className="w-5 h-5 text-blue-400" />
            </div>
          </div>

          <div className="flex items-center gap-5 w-1/3 justify-end">
            <div className="flex items-center gap-2 bg-slate-800/40 hover:bg-slate-800/60 px-3 py-1.5 rounded-xl text-xs text-slate-300 cursor-pointer transition-colors border border-slate-700/30">
              <span className="font-bold">EN</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </div>
            <div className="flex items-center gap-2 bg-slate-800/40 hover:bg-slate-800/60 px-3 py-1.5 rounded-xl text-xs text-slate-300 cursor-pointer transition-colors border border-slate-700/30">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium">Main Branch</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </div>
            <div className="relative">
              <Bell className="w-5 h-5 text-slate-400 hover:text-white cursor-pointer transition-colors" />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#1a2332]" />
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center cursor-pointer hover:bg-blue-600/30 transition-colors border border-blue-500/20">
              <User className="w-4 h-4 text-blue-400" />
            </div>
          </div>
        </header>

        {/* Sub Header / Patient Info */}
        {currentPage === 'patients' && (
          <div className="bg-[#1a2332] text-white px-8 py-2.5 flex items-center gap-6 border-t border-white/5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Patient File</span>
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">Orthodontic Analysis</span>
            </div>
            <div className="h-4 w-px bg-white/10 mx-2" />
            <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
              <div className="flex items-center gap-1.5 hover:text-white cursor-pointer transition-colors">
                <Activity className="w-3 h-3" />
                <span>VITAL SIGNS</span>
              </div>
              <div className="flex items-center gap-1.5 hover:text-white cursor-pointer transition-colors">
                <FileText className="w-3 h-3" />
                <span>MEDICAL HISTORY</span>
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <button className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-white"><FileText className="w-4 h-4" /></button>
              <button className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-white"><CreditCard className="w-4 h-4" /></button>
              <button className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-white"><Calendar className="w-4 h-4" /></button>
              <button className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-white"><MoreHorizontal className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {currentPage === 'patients' ? (
            <>
              {/* Patient Profile Card */}
              <div className="p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex items-start gap-8 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600" />
              
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-slate-100 overflow-hidden border-2 border-slate-100 shadow-inner group-hover:scale-105 transition-transform duration-500">
                  <img src="https://picsum.photos/seed/patient/200/200" alt="Patient" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl border-4 border-white flex items-center justify-center shadow-sm">
                  <Activity className="w-4 h-4 text-white" />
                </div>
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-3">
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">احمد علي محمد</h2>
                  <div className="flex gap-1.5">
                    <span className="bg-slate-900 text-white text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                      ID: 69B5702A
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-y-3 gap-x-8 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <span className="tracking-wide">DOB: 12/05/1998 (25Y)</span>
                  </div>
                </div>

                {/* Financial Summary (Moved to middle) */}
                <div className="mt-6 flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Balance</span>
                        <button 
                          onClick={() => setIsPrivate(!isPrivate)}
                          className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
                          title={isPrivate ? "Show amounts" : "Hide amounts"}
                        >
                          {isPrivate ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                        </button>
                      </div>
                      <span className={`text-lg font-black text-slate-900 leading-none transition-all duration-300 ${isPrivate ? 'blur-md select-none' : ''}`}>$0.00</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Due</span>
                      <span className={`text-lg font-black text-red-500 leading-none transition-all duration-300 ${isPrivate ? 'blur-md select-none' : ''}`}>$0.00</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Payments</span>
                      <span className={`text-lg font-black text-emerald-600 leading-none transition-all duration-300 ${isPrivate ? 'blur-md select-none' : ''}`}>$0.00</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons (Moved slightly right to avoid overlap with ID) */}
              <div className="absolute top-4 left-[58%] -translate-x-1/2 flex items-center bg-slate-50/50 border border-slate-100 rounded-2xl p-1 gap-1 shadow-sm">
                <button className="bg-white border border-slate-100 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm hover:bg-slate-50 transition-all group">
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-600 group-hover:text-blue-600" />
                    <Plus className="w-2 h-2 text-slate-600 absolute -bottom-0.5 -right-0.5 bg-white rounded-full" />
                  </div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[10px] font-bold text-slate-700">Add</span>
                    <span className="text-[10px] font-bold text-slate-700">Balance</span>
                  </div>
                </button>
                
                <button className="px-4 py-2 flex items-center gap-3 hover:bg-white/50 rounded-xl transition-all group">
                  <Wand2 className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[10px] font-bold text-slate-600">Magic</span>
                    <span className="text-[10px] font-bold text-slate-600">Link</span>
                  </div>
                </button>

                <button className="px-4 py-2 flex items-center gap-3 hover:bg-white/50 rounded-xl transition-all group">
                  <PanelLeft className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[10px] font-bold text-slate-600">Portal</span>
                  </div>
                </button>

                <div className="w-px h-6 bg-slate-200 mx-1" />

                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white/50 rounded-lg transition-all">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>

              {/* Edit & Contact Buttons (Moved upward and absolute) */}
              <div className="absolute top-4 right-4 flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                <button className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors shadow-sm" title="Edit Patient">
                  <UserPen className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1.5" />
                <div className="flex gap-0.5">
                  <button className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="WhatsApp">
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Call">
                    <Phone className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="SMS">
                    <Smartphone className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Email">
                    <Mail className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 ml-auto self-end">
                <div className="flex items-center gap-3 mb-1">
                  {/* Last Appointment */}
                  <div className="flex flex-col items-end px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Last Appt</span>
                    <span className="text-[11px] font-bold text-slate-700">12 Mar 2024</span>
                  </div>

                  {/* Next Appointment */}
                  <div className="flex flex-col items-end px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100">
                    <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Next Appt</span>
                    <span className="text-[11px] font-bold text-blue-700">28 Mar 2024</span>
                  </div>

                  {/* New Appointment Button */}
                  <div className="flex gap-2 ml-2">
                    <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 border border-blue-700 rounded-xl hover:bg-blue-700 transition-all shadow-md group">
                      <div className="w-5 h-5 rounded-lg bg-blue-500/30 flex items-center justify-center">
                        <Calendar className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-white whitespace-nowrap">New Appointment</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-8 mt-6 border-b border-slate-200 px-2">
              <Tab label="PATIENT TIMELINE" icon={<Activity className="w-4 h-4" />} active={patientTab === 'TIMELINE'} onClick={() => setPatientTab('TIMELINE')} />
              <Tab label="CLINICAL" icon={<Stethoscope className="w-4 h-4" />} active={patientTab === 'CLINICAL'} onClick={() => setPatientTab('CLINICAL')} />
              <Tab label="ORTHODONTIC" icon={<Smile className="w-4 h-4" />} active={patientTab === 'ORTHODONTIC'} onClick={() => setPatientTab('ORTHODONTIC')} />
              <Tab label="TREATMENTS" icon={<Pill className="w-4 h-4" />} active={patientTab === 'TREATMENTS'} onClick={() => setPatientTab('TREATMENTS')} />
              <Tab label="APPOINTMENTS" icon={<Calendar className="w-4 h-4" />} active={patientTab === 'APPOINTMENTS'} onClick={() => setPatientTab('APPOINTMENTS')} />
              <Tab label="FINANCIAL" icon={<FileText className="w-4 h-4" />} active={patientTab === 'FINANCIAL'} onClick={() => setPatientTab('FINANCIAL')} />
            </div>

            {patientTab === 'ORTHODONTIC' ? (
              <PatientOrthodonticModule patientId="69B5702A" />
            ) : (
              <div className="p-8 flex items-center justify-center text-slate-400 font-medium">
                {patientTab} Content Coming Soon
              </div>
            )}
            </div>
          </>
        ) : (
          <DashboardView type={currentPage} />
        )}
      </div>
    </div>
  </div>
);
}

function DashboardView({ type }: { type: string }) {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight capitalize">{type}</h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Welcome back, Dr. Shady</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-blue-700 transition-all flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add New {type.slice(0, -1)}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Total Patients" value="1,284" change="+12%" icon={<Users className="w-5 h-5" />} color="blue" />
        <StatCard title="Today's Appts" value="18" change="+3" icon={<Calendar className="w-5 h-5" />} color="emerald" />
        <StatCard title="Pending Tasks" value="7" change="-2" icon={<Activity className="w-5 h-5" />} color="rose" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Recent Activity</h3>
          <button className="text-xs font-bold text-blue-600 hover:underline">View All</button>
        </div>
        <div className="divide-y divide-slate-50">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-slate-800">Patient Name {i}</h4>
                <p className="text-xs text-slate-500">Orthodontic checkup completed</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">2h ago</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, change, icon, color }: { title: string, value: string, change: string, icon: React.ReactNode, color: 'blue' | 'emerald' | 'rose' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100'
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colors[color]}`}>
          {icon}
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${change.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {change}
        </span>
      </div>
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</h4>
      <span className="text-2xl font-black text-slate-800 tracking-tight">{value}</span>
    </div>
  );
}

function SidebarIcon({ icon, active = false, onClick }: { icon: React.ReactNode, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 rounded-xl transition-all ${active ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
    >
      {icon}
    </button>
  );
}

function Tab({ label, icon, active = false, onClick }: { label: string, icon?: React.ReactNode, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`pb-3 text-[10px] font-bold tracking-widest transition-all border-b-2 flex items-center gap-2 ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
    >
      {icon && <span className={active ? 'text-blue-600' : 'text-slate-400'}>{icon}</span>}
      {label}
    </button>
  );
}

function CategoryMenu({ label, icon, active, onClick, children }: { label: string, icon: React.ReactNode, active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <div>
      <button 
        onClick={onClick}
        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${active ? 'bg-slate-50 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <ChevronDown className={`w-3 h-3 transition-transform ${active ? 'rotate-180' : ''}`} />
      </button>
      {active && <div className="p-1 space-y-0.5">{children}</div>}
    </div>
  );
}

function ActionButton({ icon, label, onClick, variant = 'default' }: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void,
  variant?: 'default' | 'danger' | 'warning',
  key?: React.Key
}) {
  const colors = {
    default: 'hover:bg-blue-50 text-slate-600 hover:text-blue-600',
    danger: 'hover:bg-red-50 text-slate-600 hover:text-red-600',
    warning: 'hover:bg-orange-50 text-slate-600 hover:text-orange-600'
  };

  return (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${colors[variant]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function Toggle({ label, checked, onChange, compact = false }: { label: string, checked: boolean, onChange: (v: boolean) => void, compact?: boolean }) {
  return (
    <div className={`flex items-center group cursor-pointer ${compact ? 'gap-2' : 'justify-between'}`} onClick={() => onChange(!checked)}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-700 transition-colors whitespace-nowrap">{label}</span>
      <div className={`w-7 h-4 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </div>
    </div>
  );
}



function ToolbarButton({ icon, onClick, active = false, title, disabled = false }: { icon: React.ReactNode, onClick: () => void, active?: boolean, title?: string, disabled?: boolean }) {
  return (
    <button 
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-2 border rounded-lg transition-all shadow-sm ${
        disabled ? 'opacity-30 cursor-not-allowed bg-slate-50 border-slate-100 text-slate-300' :
        active 
          ? 'bg-blue-600 border-blue-600 text-white' 
          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
      }`}
    >
      {icon}
    </button>
  );
}

export default function App() {
  return (
    <OrthodonticAppointmentProvider>
      <OrthodonticApp />
    </OrthodonticAppointmentProvider>
  );
}
