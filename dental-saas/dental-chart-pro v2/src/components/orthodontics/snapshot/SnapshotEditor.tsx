import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Trash2, 
  RefreshCw, 
  CircleDot, 
  Square, 
  ShieldAlert, 
  Move, 
  Stethoscope, 
  X, 
  AlertCircle, 
  Activity, 
  Link as LinkIcon, 
  Plus, 
  FileCode, 
  Grid, 
  ChevronDown,
  TriangleAlert
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { 
  Appointment, 
  ToothData, 
  ElasticConnection, 
  ElasticSize,
  Appliance, 
  Miniscrew, 
  IPRMarker, 
  SpaceMarker, 
  PowerChainConfig,
  PowerChainType,
  Accessory,
  AccessoryType,
  Action,
  Snapshot,
  ToothAnchors,
  UPPER_TEETH,
  LOWER_TEETH,
  BracketPrescription,
  BracketBrand,
  BracketSlotSize,
  ArchwireMaterial,
  ArchwireSize,
  ArchwireConfig,
  ToothStatus
} from '../../../types';
import { getPrescription, ToothID } from '../../../../prescriptions';
import AppointmentInfoHeader from './AppointmentInfoHeader';
import AppointmentActionPanel from './AppointmentActionPanel';
import OrthodonticChartCanvas from './OrthodonticChartCanvas';

interface SnapshotEditorProps {
  appointment: Appointment;
  onBack: () => void;
  onSave: (snapshot: Snapshot) => void;
}

const POWERCHAIN_COLORS = {
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f97316",
  gray: "#64748b",
  clear: "#e5e7eb"
};

const BRACKET_PRESCRIPTIONS: BracketPrescription[] = ['MBT', 'Roth', 'Bidimensional', 'Standard Edgewise', 'Ricketts'];
const BRACKET_SLOT_SIZES: BracketSlotSize[] = ['0.022', '0.018'];
const BRACKET_ACTIONS = ['Bonding', 'Rebonding', 'Repositioning'] as const;
type BracketAction = typeof BRACKET_ACTIONS[number];

const ARCHWIRE_MATERIALS: ArchwireMaterial[] = ['NiTi', 'SS', 'TMA', 'Copper NiTi'];
const ARCHWIRE_SIZES: ArchwireSize[] = ['0.012', '0.014', '0.016', '0.018', '0.020', '16x22', '17x25', '19x25', '21x25'];

const SnapshotEditor: React.FC<SnapshotEditorProps> = ({ appointment, onBack, onSave }) => {
  // State
  const [upperTeeth, setUpperTeeth] = useState<ToothData[]>(UPPER_TEETH);
  const [lowerTeeth, setLowerTeeth] = useState<ToothData[]>(LOWER_TEETH);
  const [selectedToothIds, setSelectedToothIds] = useState<number[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>('status');
  const [elastics, setElastics] = useState<ElasticConnection[]>([]);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [miniscrews, setMiniscrews] = useState<Miniscrew[]>([]);
  const [iprMarkers, setIprMarkers] = useState<IPRMarker[]>([]);
  const [spaceMarkers, setSpaceMarkers] = useState<SpaceMarker[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [powerChains, setPowerChains] = useState<PowerChainConfig[]>([]);
  const [upperArchwire, setUpperArchwire] = useState<ArchwireConfig | undefined>();
  const [lowerArchwire, setLowerArchwire] = useState<ArchwireConfig | undefined>();
  const [actions, setActions] = useState<Action[]>([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([
    {
      id: 'snap-1',
      caseId: appointment.caseId,
      appointmentId: appointment.id,
      createdAt: Date.now() - 1000 * 60 * 15, // 15 mins ago
      thumbnail: '',
      chartState: {
        upperTeeth: [...UPPER_TEETH],
        lowerTeeth: [...LOWER_TEETH],
        elastics: [],
        appliances: [],
        miniscrews: [],
        iprMarkers: [],
        spaceMarkers: [],
        powerChains: [],
        accessories: []
      },
      notes: 'Initial state check',
      actions: [{ id: '1', type: 'status_change', description: 'Initial check', timestamp: Date.now() - 1000 * 60 * 15, tooth: '' }],
      attachments: []
    },
    {
      id: 'snap-2',
      caseId: appointment.caseId,
      appointmentId: appointment.id,
      createdAt: Date.now() - 1000 * 60 * 5, // 5 mins ago
      thumbnail: '',
      chartState: {
        upperTeeth: [...UPPER_TEETH],
        lowerTeeth: [...LOWER_TEETH],
        elastics: [],
        appliances: [],
        miniscrews: [],
        iprMarkers: [],
        spaceMarkers: [],
        powerChains: [],
        accessories: []
      },
      notes: 'Mid-session update',
      actions: [{ id: '2', type: 'status_change', description: 'Bracket check', timestamp: Date.now() - 1000 * 60 * 5, tooth: '' }],
      attachments: []
    }
  ]);
  const [history, setHistory] = useState<Snapshot['chartState'][]>([]);
  
  // UI State
  const [showBrackets, setShowBrackets] = useState(true);
  const [showArchwire, setShowArchwire] = useState(true);
  const [showAnchors, setShowAnchors] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [notationSystem, setNotationSystem] = useState<'fdi' | 'palmer' | 'both'>('fdi');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, toothId: number } | null>(null);
  const [selectedPowerChainType, setSelectedPowerChainType] = useState<PowerChainType>('closed');
  const [selectedPowerChainColor, setSelectedPowerChainColor] = useState<string>(POWERCHAIN_COLORS.gray);
  const [activeActionBarCategory, setActiveActionBarCategory] = useState<string | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState<BracketPrescription>('MBT');
  const [selectedSlotSize, setSelectedSlotSize] = useState<BracketSlotSize>('0.022');
  const [selectedBrand, setSelectedBrand] = useState<BracketBrand>('3M');
  const [selectedBondingHeight, setSelectedBondingHeight] = useState<string>('');
  const [selectedBondingOption, setSelectedBondingOption] = useState<'marginal-ridges-level' | 'middle-middle' | 'custom'>('custom');
  const [selectedBracketAction, setSelectedBracketAction] = useState<BracketAction>('Bonding');
  const [selectedArchwireMaterial, setSelectedArchwireMaterial] = useState<ArchwireMaterial>('NiTi');
  const [selectedArchwireSize, setSelectedArchwireSize] = useState<ArchwireSize>('0.014');
  const [selectedMiniscrewId, setSelectedMiniscrewId] = useState<string | null>(null);
  const [miniscrewConfig, setMiniscrewConfig] = useState<{ toothId: number, anchorType: keyof ToothAnchors } | null>(null);
  const [miniscrewToRemove, setMiniscrewToRemove] = useState<string | null>(null);
  const [msForm, setMsForm] = useState({ brand: 'Ormco', diameter: '1.6mm', length: '8mm' });

  const [bracketBrands, setBracketBrands] = useState<string[]>(['3M', 'Ormco', 'American Orthodontics', 'Dentsply Sirona', 'Forestadent', 'GAC']);
  const [archwireBrands, setArchwireBrands] = useState<string[]>(['3M', 'Ormco', 'GAC', 'Forestadent']);
  const [elasticBrands, setElasticBrands] = useState<string[]>(['3M', 'Ormco', 'American Orthodontics']);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedArchwireBrand, setSelectedArchwireBrand] = useState<string>('3M');
  const [selectedElasticBrand, setSelectedElasticBrand] = useState<string>('3M');
  const [newBrandInput, setNewBrandInput] = useState({ type: '', value: '' });

  const chartContainerRef = useRef<HTMLDivElement>(null);

  const isMolarSelected = selectedToothIds.some(id => {
    const tooth = upperTeeth.find(t => t.id === id) || lowerTeeth.find(t => t.id === id);
    return tooth?.type === 'molar';
  });
  const isNonMolarSelected = selectedToothIds.some(id => {
    const tooth = upperTeeth.find(t => t.id === id) || lowerTeeth.find(t => t.id === id);
    return tooth?.type !== 'molar';
  });

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Handlers
  const saveToHistory = () => {
    const currentState: Snapshot['chartState'] = {
      upperTeeth: [...upperTeeth],
      lowerTeeth: [...lowerTeeth],
      elastics: [...elastics],
      appliances: [...appliances],
      powerChains: [...powerChains],
      miniscrews: [...miniscrews],
      iprMarkers: [...iprMarkers],
      spaceMarkers: [...spaceMarkers],
      accessories: [...accessories],
      upperArchwire: upperArchwire ? { ...upperArchwire } : undefined,
      lowerArchwire: lowerArchwire ? { ...lowerArchwire } : undefined
    };
    setHistory(prev => [...prev, currentState].slice(-20)); // Keep last 20 states
  };

  const undo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    
    setUpperTeeth(previousState.upperTeeth);
    setLowerTeeth(previousState.lowerTeeth);
    setElastics(previousState.elastics);
    setAppliances(previousState.appliances);
    setPowerChains(previousState.powerChains);
    setMiniscrews(previousState.miniscrews);
    setIprMarkers(previousState.iprMarkers);
    setSpaceMarkers(previousState.spaceMarkers);
    setAccessories(previousState.accessories);
    setUpperArchwire(previousState.upperArchwire);
    setLowerArchwire(previousState.lowerArchwire);
    
    setActions(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      description: 'Undid last action',
      timestamp: Date.now(),
      type: 'undo',
      tooth: ''
    }]);
  };

  const logAction = (description: string, toothId?: number) => {
    const newAction: Action = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type: 'status_change',
      description,
      tooth: toothId?.toString() || ''
    };
    setActions(prev => [newAction, ...prev]);
  };

  const handleToothClick = (id: number) => {
    setContextMenu(null);
    setSelectedToothIds(prev => 
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  };

  const handleToothContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If tooth not selected, select it
    if (!selectedToothIds.includes(id)) {
      setSelectedToothIds([id]);
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      toothId: id
    });
  };

  const updateToothStatus = (status: any) => {
    if (selectedToothIds.length === 0) return;
    saveToHistory();
    const update = (teeth: ToothData[]) => teeth.map(t => {
      if (!selectedToothIds.includes(t.id)) return t;

      let finalStatus = status;
      if (t.type === 'molar' && status === 'bracket') {
        finalStatus = 'molar-tube';
      } else if (t.type !== 'molar' && (status === 'band' || status === 'molar-tube')) {
        finalStatus = 'bracket';
      }

      return { ...t, status: finalStatus };
    });
    setUpperTeeth(update);
    setLowerTeeth(update);
    logAction(`Changed status to ${status}`, selectedToothIds[0]);
    // Clear selection after status update to provide feedback that action was applied
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };

  const setTargetPosition = (toothId: number, position: { x: number, y: number }) => {
    saveToHistory();
    const update = (teeth: ToothData[]) => teeth.map(t => {
      if (t.id === toothId) {
        return { ...t, targetPosition: position };
      }
      return t;
    });
    setUpperTeeth(update);
    setLowerTeeth(update);
    logAction(`Set target position for tooth ${toothId}`, toothId);
    setContextMenu(null);
  };

  const bondBrackets = (applianceType: 'bracket' | 'band' | 'molar-tube' = 'bracket') => {
    if (selectedToothIds.length === 0) return;
    saveToHistory();
    const update = (teeth: ToothData[]) => teeth.map(t => {
      if (!selectedToothIds.includes(t.id)) return t;
      
      let finalApplianceType = applianceType;
      if (t.type === 'molar' && applianceType === 'bracket') {
        finalApplianceType = 'molar-tube'; // Default to tube for molars if bracket is selected
      } else if (t.type !== 'molar' && (applianceType === 'band' || applianceType === 'molar-tube')) {
        finalApplianceType = 'bracket'; // Default to bracket for non-molars
      }

      return { 
        ...t, 
        status: (selectedBracketAction === 'Repositioning' ? 'repositioning' : finalApplianceType) as ToothStatus, 
        prescription: selectedPrescription, 
        slotSize: selectedSlotSize,
        brand: selectedBrand,
        bondingHeight: selectedBondingOption === 'custom' ? (selectedBondingHeight ? parseFloat(selectedBondingHeight) : undefined) : undefined,
        bondingOption: selectedBondingOption,
        prescriptionValues: getPrescription(selectedPrescription as any, t.id as ToothID)
      };
    });
    setUpperTeeth(update);
    setLowerTeeth(update);
    logAction(`${selectedBracketAction} ${applianceType}: ${selectedPrescription} ${selectedSlotSize} (${selectedBrand})${selectedBondingOption === 'marginal-ridges-level' ? ' MR-Level' : selectedBondingOption === 'middle-middle' ? ' Mid-Mid' : selectedBondingHeight ? ` H:${selectedBondingHeight}mm` : ''}`, selectedToothIds[0]);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };
  
  const setArchwire = (arch: 'upper' | 'lower') => {
    saveToHistory();
    const config: ArchwireConfig = {
      material: selectedArchwireMaterial,
      size: selectedArchwireSize,
      brand: selectedArchwireBrand
    };
    if (arch === 'upper') {
      setUpperArchwire(config);
    } else {
      setLowerArchwire(config);
    }
    logAction(`Set ${arch} archwire: ${selectedArchwireMaterial} ${selectedArchwireSize} (${selectedArchwireBrand})`);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };

  const removeArchwire = (arch: 'upper' | 'lower') => {
    saveToHistory();
    if (arch === 'upper') {
      setUpperArchwire(undefined);
    } else {
      setLowerArchwire(undefined);
    }
    logAction(`Removed ${arch} archwire`);
  };

  const addElastic = (type: any, size: ElasticSize) => {
    if (selectedToothIds.length < 2) return;
    saveToHistory();
    const newElastic: ElasticConnection = {
      id: Math.random().toString(36).substr(2, 9),
      toothIds: [...selectedToothIds],
      type,
      size,
      brand: selectedElasticBrand
    };
    setElastics(prev => [...prev, newElastic]);
    logAction(`Added ${type} elastic (${size}) - ${selectedElasticBrand}`);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };

  const addPowerChain = (type: PowerChainType, color: string) => {
    if (!selectedMiniscrewId && selectedToothIds.length < 2) return;
    if (selectedMiniscrewId && selectedToothIds.length < 1) return;
    
    saveToHistory();
    
    const sorted = [...selectedToothIds].sort((a, b) => a - b);
    const isUpper = sorted[0] < 30;
    const teeth = isUpper ? upperTeeth : lowerTeeth;
    
    const indices = sorted.map(id => teeth.findIndex(t => t.id === id)).filter(idx => idx !== -1);
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    const rangeTeeth = teeth.slice(minIdx, maxIdx + 1).map(t => t.id);

    const newPC: PowerChainConfig = {
      id: Math.random().toString(36).substr(2, 9),
      anchorTeeth: selectedMiniscrewId ? [rangeTeeth[rangeTeeth.length - 1]] : [rangeTeeth[0], rangeTeeth[rangeTeeth.length - 1]],
      activeTeeth: selectedMiniscrewId ? rangeTeeth.slice(0, -1) : rangeTeeth.slice(1, -1),
      type,
      color,
      direction: 'mesial',
      isUpper,
      miniscrewId: selectedMiniscrewId || undefined
    };
    setPowerChains(prev => [...prev, newPC]);
    logAction(`Added ${type} power chain ${selectedMiniscrewId ? 'from miniscrew' : ''}`);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
    setSelectedMiniscrewId(null);
  };

  const addAccessory = (type: AccessoryType) => {
    if (selectedToothIds.length === 0) return;
    saveToHistory();
    const isUpper = selectedToothIds[0] < 30;
    const newAccessory: Accessory = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      toothIds: [...selectedToothIds],
      isUpper
    };
    setAccessories(prev => [...prev, newAccessory]);
    logAction(`Added ${type.replace('-', ' ')}`);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };

  const removeAccessory = (id: string) => {
    saveToHistory();
    setAccessories(prev => prev.filter(a => a.id !== id));
    logAction(`Removed accessory`);
  };

  const addMiniscrew = (config: { brand: string, diameter: string, length: string }) => {
    if (!miniscrewConfig) return;
    saveToHistory();
    
    const toothId = miniscrewConfig.toothId;
    const anchorType = miniscrewConfig.anchorType;
    
    const getAdjacentTooth = (tid: number, atype: keyof ToothAnchors): number | null => {
      const quadrant = Math.floor(tid / 10);
      const position = tid % 10;
      
      // In our model, 'apical' anchors are also placed in the interproximal space
      // For right side (Q1, Q4), apical is to the right (towards higher position numbers)
      // For left side (Q2, Q3), apical is to the left (towards higher position numbers)
      // Wait, let's check calculateAnchors again.
      // Q1: 18..11. apicalX = w + gap/2 (right). 16's right is 15. So tid - 1.
      // Q2: 21..28. apicalX = -gap/2 (left). 21's left is 22. So tid + 1.
      
      if (atype === 'mesial') {
        if (position === 1) {
          if (quadrant === 1) return 21;
          if (quadrant === 2) return 11;
          if (quadrant === 3) return 41;
          if (quadrant === 4) return 31;
          return null;
        }
        return tid - 1;
      } else if (atype === 'distal') {
        if (position === 8) return null;
        return tid + 1;
      } else if (atype === 'apical') {
        // Apical anchors are between teeth in this model
        if (quadrant === 1 || quadrant === 4) {
          // Right side: apical is to the right (towards midline)
          if (position === 1) {
            return quadrant === 1 ? 21 : 31;
          }
          return tid - 1;
        } else {
          // Left side: apical is to the left (away from midline)
          if (position === 8) return null;
          return tid + 1;
        }
      }
      return null;
    };

    const otherTooth = getAdjacentTooth(toothId, anchorType);
    let positionText = `tooth ${toothId}`;
    if (anchorType === 'infrazygomatic') {
      positionText = `at infrazygomatic crest (IZC) above tooth ${toothId}`;
    } else if (otherTooth) {
      const [t1, t2] = [toothId, otherTooth].sort((a, b) => a - b);
      positionText = `interradicular between tooth ${t1} and ${t2}`;
    } else if (anchorType === 'apical') {
      positionText = `apical to tooth ${toothId}`;
    }

    const newMS: Miniscrew = {
      id: Math.random().toString(36).substr(2, 9),
      toothId: toothId,
      anchorType: anchorType,
      angle: 90,
      brand: config.brand,
      diameter: config.diameter,
      length: config.length
    };
    setMiniscrews(prev => [...prev, newMS]);
    logAction(`Added ${config.brand} miniscrew (${config.diameter}x${config.length}) ${positionText}`);
    setMiniscrewConfig(null);
  };

  const addIPR = (value: string) => {
    if (selectedToothIds.length !== 1) return;
    saveToHistory();
    const newIPR: IPRMarker = {
      id: Math.random().toString(36).substr(2, 9),
      toothId: selectedToothIds[0],
      anchorType: 'mesial',
      value
    };
    setIprMarkers(prev => [...prev, newIPR]);
    logAction(`Added IPR (${value}) to tooth ${selectedToothIds[0]}`);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };

  const addSpace = (value: string) => {
    if (selectedToothIds.length !== 1) return;
    saveToHistory();
    const newSpace: SpaceMarker = {
      id: Math.random().toString(36).substr(2, 9),
      toothId: selectedToothIds[0],
      anchorType: 'mesial',
      value
    };
    setSpaceMarkers(prev => [...prev, newSpace]);
    logAction(`Added space marker (${value}) to tooth ${selectedToothIds[0]}`);
    setSelectedToothIds([]);
    setActiveActionBarCategory(null);
  };

  const getAnchorCoords = (toothId: number, anchorType: keyof ToothAnchors) => {
    const isUpper = toothId < 30;
    const teeth = isUpper ? upperTeeth : lowerTeeth;
    const index = teeth.findIndex(t => t.id === toothId);
    const tooth = teeth[index];
    
    const baseX = 50 + index * 65;
    const baseY = isUpper ? 50 : 300;
    
    // Tooth internal anchor
    const anchor = tooth.anchors[anchorType];
    if (!anchor) return { x: baseX + 20, y: baseY + 30 }; // Fallback to center
    
    if (isUpper) {
      return { x: baseX + anchor.x + 8, y: baseY + anchor.y + 37 };
    } else {
      // Lower arch is flipped in the visual representation
      return { x: baseX + anchor.x + 8, y: baseY + (80 - anchor.y) };
    }
  };

  const removeElastic = (id: string) => {
    saveToHistory();
    setElastics(prev => prev.filter(e => e.id !== id));
    logAction('Removed elastic');
  };

  const removeAppliance = (id: string) => {
    saveToHistory();
    setAppliances(prev => prev.filter(a => a.id !== id));
    logAction('Removed appliance');
  };

  const removeIPRMarker = (id: string) => {
    saveToHistory();
    setIprMarkers(prev => prev.filter(i => i.id !== id));
    logAction('Removed IPR marker');
  };

  const removeSpaceMarker = (id: string) => {
    saveToHistory();
    setSpaceMarkers(prev => prev.filter(s => s.id !== id));
    logAction('Removed space marker');
  };

  const removePowerChain = (id: string) => {
    saveToHistory();
    setPowerChains(prev => prev.filter(p => p.id !== id));
    logAction('Removed power chain');
  };

  const handleSaveSnapshot = async () => {
    if (!chartContainerRef.current) return;
    setIsSaving(true);
    
    try {
      const dataUrl = await toPng(chartContainerRef.current, { quality: 0.95 });
      const newSnapshot: Snapshot = {
        id: Math.random().toString(36).substr(2, 9),
        caseId: appointment.caseId,
        appointmentId: appointment.id,
        createdAt: Date.now(),
        thumbnail: dataUrl,
        chartState: {
          upperTeeth,
          lowerTeeth,
          elastics,
          appliances,
          miniscrews,
          iprMarkers,
          spaceMarkers,
          accessories,
          powerChains
        },
        notes,
        actions,
        attachments: []
      };
      
      setSnapshots(prev => [newSnapshot, ...prev]);
      onSave(newSnapshot);
      logAction('Saved snapshot');
    } catch (err) {
      console.error('Failed to save snapshot:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreSnapshot = (snapshot: Snapshot) => {
    const { chartState } = snapshot;
    setUpperTeeth(chartState.upperTeeth);
    setLowerTeeth(chartState.lowerTeeth);
    setElastics(chartState.elastics);
    setAppliances(chartState.appliances);
    setMiniscrews(chartState.miniscrews);
    setIprMarkers(chartState.iprMarkers);
    setSpaceMarkers(chartState.spaceMarkers);
    setAccessories(chartState.accessories || []);
    setPowerChains(chartState.powerChains);
    setNotes(snapshot.notes || '');
    setActions(snapshot.actions || []);
    logAction(`Restored snapshot from ${new Date(snapshot.createdAt).toLocaleDateString()}`);
  };

  return (
    <div className="fixed inset-0 bg-slate-100 flex flex-col z-50 overflow-hidden">
      <AppointmentInfoHeader 
        appointment={appointment} 
        onBack={onBack} 
        snapshots={snapshots}
        onRestoreSnapshot={handleRestoreSnapshot}
        onEndAppointment={onBack}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Actions & Notes */}
        <AppointmentActionPanel 
          actions={actions} 
          notes={notes} 
          onNotesChange={setNotes} 
          onSaveSnapshot={handleSaveSnapshot}
          isSaving={isSaving}
        />

        {/* Center: Chart Area */}
        <div className="flex-1 flex flex-col relative bg-slate-50 overflow-hidden">
          {/* Chart Header / Toolbar */}
          <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-20">
            <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button 
                  onClick={() => setNotationSystem('fdi')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${notationSystem === 'fdi' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  FDI
                </button>
                <button 
                  onClick={() => setNotationSystem('palmer')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${notationSystem === 'palmer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  PALMER
                </button>
                <button 
                  onClick={() => setNotationSystem('both')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${notationSystem === 'both' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  BOTH
                </button>
              </div>
              <div className="h-4 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <ToolbarButton icon={<ZoomIn className="w-4 h-4" />} onClick={() => setZoom(prev => Math.min(prev + 0.1, 2))} title="Zoom In" />
                <ToolbarButton icon={<ZoomOut className="w-4 h-4" />} onClick={() => setZoom(prev => Math.max(prev - 0.1, 0.5))} title="Zoom Out" />
                <ToolbarButton icon={<Maximize2 className="w-4 h-4" />} onClick={() => { setZoom(1); }} title="Reset Zoom" />
                <div className="h-4 w-px bg-slate-200" />
                <ToolbarButton 
                  icon={<RotateCcw className="w-4 h-4" />} 
                  onClick={undo} 
                  title="Undo Action" 
                  disabled={history.length === 0}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <Toggle label="Brackets" checked={showBrackets} onChange={setShowBrackets} compact />
              <Toggle label="Archwire" checked={showArchwire} onChange={setShowArchwire} compact />
              <Toggle label="Anchors" checked={showAnchors} onChange={setShowAnchors} compact />
              <div className="h-4 w-px bg-slate-200" />
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action Bar with Categories */}
          <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-2 z-10">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Quick Actions:</div>
            
            <div className="flex items-center gap-1">
              <ActionBarCategory 
                label="Status" 
                icon={<Activity className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'status'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'status' ? null : 'status')}
                disabled={selectedToothIds.length === 0}
              >
                <div className="flex items-center gap-1 p-1">
                  <ActionButton icon={<CircleDot className="w-3.5 h-3.5" />} label="Normal" onClick={() => updateToothStatus('normal')} />
                  {isNonMolarSelected && <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Bracket" onClick={() => updateToothStatus('bracket')} />}
                  {isMolarSelected && <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Band" onClick={() => updateToothStatus('band')} />}
                  {isMolarSelected && <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Molar Tube" onClick={() => updateToothStatus('molar-tube')} />}
                  <ActionButton icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Impacted" onClick={() => updateToothStatus('impacted')} variant="warning" />
                  <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} label="Extracted" onClick={() => updateToothStatus('extracted')} variant="danger" />
                </div>
              </ActionBarCategory>

              <ActionBarCategory 
                label="Brackets" 
                icon={<Square className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'brackets'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'brackets' ? null : 'brackets')}
                disabled={selectedToothIds.length === 0}
              >
                <div className="p-3 w-64 flex flex-col gap-3">
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Action</div>
                    <div className="grid grid-cols-3 gap-1">
                      {BRACKET_ACTIONS.map(a => (
                        <button
                          key={a}
                          onClick={() => setSelectedBracketAction(a)}
                          className={`px-1 py-1.5 rounded-lg text-[9px] font-bold border transition-all ${
                            selectedBracketAction === a 
                              ? 'bg-blue-50 border-blue-200 text-blue-600' 
                              : 'border-slate-100 text-slate-500 hover:border-slate-200'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Prescription</div>
                    <div className="grid grid-cols-2 gap-1">
                      {BRACKET_PRESCRIPTIONS.map(p => (
                        <button
                          key={p}
                          onClick={() => setSelectedPrescription(p)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                            selectedPrescription === p 
                              ? 'bg-blue-50 border-blue-200 text-blue-600' 
                              : 'border-slate-100 text-slate-500 hover:border-slate-200'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Slot Size</div>
                    <div className="flex gap-1">
                      {BRACKET_SLOT_SIZES.map(s => (
                        <button
                          key={s}
                          onClick={() => setSelectedSlotSize(s)}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                            selectedSlotSize === s 
                              ? 'bg-blue-50 border-blue-200 text-blue-600' 
                              : 'border-slate-100 text-slate-500 hover:border-slate-200'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bonding Position</div>
                    <select 
                      value={selectedBondingOption}
                      onChange={(e) => setSelectedBondingOption(e.target.value as 'marginal-ridges-level' | 'middle-middle' | 'custom')}
                      className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="marginal-ridges-level">Marginal Ridges Level</option>
                      <option value="middle-middle">Middle-Middle</option>
                      <option value="custom">Custom (mm)</option>
                    </select>
                  </div>
                  
                  {selectedBondingOption === 'custom' && (
                    <div className="space-y-1.5">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bonding Height (mm)</div>
                      <input 
                        type="number"
                        value={selectedBondingHeight}
                        onChange={(e) => setSelectedBondingHeight(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Enter height"
                      />
                    </div>
                  )}
                  
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Brand</div>
                    <select 
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {bracketBrands.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {isNonMolarSelected && (
                    <button
                      onClick={() => bondBrackets('bracket')}
                      className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm"
                    >
                      Bond Brackets
                    </button>
                  )}
                  {isMolarSelected && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => bondBrackets('band')}
                        className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-sm"
                      >
                        Bond Band
                      </button>
                      <button
                        onClick={() => bondBrackets('molar-tube')}
                        className="flex-1 py-2 bg-purple-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-purple-700 transition-all shadow-sm"
                      >
                        Bond Tube
                      </button>
                    </div>
                  )}
                </div>
              </ActionBarCategory>

              <ActionBarCategory 
                label="Archwire" 
                icon={<Activity className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'archwire'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'archwire' ? null : 'archwire')}
              >
                <div className="p-3 w-64 flex flex-col gap-3">
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Material</div>
                    <div className="grid grid-cols-2 gap-1">
                      {ARCHWIRE_MATERIALS.map(m => (
                        <button
                          key={m}
                          onClick={() => setSelectedArchwireMaterial(m)}
                          className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                            selectedArchwireMaterial === m 
                              ? 'bg-blue-50 border-blue-200 text-blue-600' 
                              : 'border-slate-100 text-slate-500 hover:border-slate-200'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Size</div>
                    <select 
                      value={selectedArchwireSize}
                      onChange={(e) => setSelectedArchwireSize(e.target.value as ArchwireSize)}
                      className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {ARCHWIRE_SIZES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Brand</div>
                    <select 
                      value={selectedArchwireBrand}
                      onChange={(e) => setSelectedArchwireBrand(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {archwireBrands.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => setArchwire('upper')}
                      className="py-2 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-blue-700 transition-all shadow-sm"
                    >
                      Set Upper
                    </button>
                    <button
                      onClick={() => setArchwire('lower')}
                      className="py-2 bg-slate-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-slate-700 transition-all shadow-sm"
                    >
                      Set Lower
                    </button>
                  </div>
                  
                  {(upperArchwire || lowerArchwire) && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
                      {upperArchwire && (
                        <button 
                          onClick={() => removeArchwire('upper')}
                          className="text-[9px] text-red-500 hover:text-red-600 font-bold flex items-center justify-center gap-1 py-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove Upper
                        </button>
                      )}
                      {lowerArchwire && (
                        <button 
                          onClick={() => removeArchwire('lower')}
                          className="text-[9px] text-red-500 hover:text-red-600 font-bold flex items-center justify-center gap-1 py-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove Lower
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </ActionBarCategory>

              <ActionBarCategory 
                label="Elastics" 
                icon={<LinkIcon className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'elastics'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'elastics' ? null : 'elastics')}
                disabled={selectedToothIds.length < 2}
              >
                <div className="p-3 w-48 flex flex-col gap-3">
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Brand</div>
                    <select 
                      value={selectedElasticBrand}
                      onChange={(e) => setSelectedElasticBrand(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {elasticBrands.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Class II" onClick={() => addElastic('class-II', '3/16"')} />
                    <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Class III" onClick={() => addElastic('class-III', '3/16"')} />
                    <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Triangle" onClick={() => addElastic('triangle', '1/4"')} />
                  </div>
                </div>
              </ActionBarCategory>

              <ActionBarCategory 
                label="Chains" 
                icon={<Grid className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'chains'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'chains' ? null : 'chains')}
                disabled={selectedMiniscrewId ? selectedToothIds.length < 1 : selectedToothIds.length < 2}
              >
                <div className="flex flex-col gap-2 p-2 min-w-[200px]">
                  {selectedMiniscrewId && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CircleDot className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">Miniscrew Anchor</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedMiniscrewId(null); }} className="p-1 hover:bg-blue-100 rounded-full transition-colors">
                        <X className="w-3 h-3 text-blue-400" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</span>
                    <div className="flex items-center gap-1">
                      {(['closed', 'open', 'long'] as PowerChainType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setSelectedPowerChainType(type)}
                          className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                            selectedPowerChainType === type 
                              ? 'bg-blue-500 text-white shadow-sm' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Color</span>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(POWERCHAIN_COLORS).map(([name, color]) => (
                        <button
                          key={name}
                          onClick={() => setSelectedPowerChainColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                            selectedPowerChainColor === color ? 'border-blue-500 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: color }}
                          title={name}
                        >
                          {selectedPowerChainColor === color && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => addPowerChain(selectedPowerChainType, selectedPowerChainColor)}
                    className="mt-1 w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3 h-3" />
                    Apply Chain
                  </button>
                </div>
              </ActionBarCategory>

              <ActionBarCategory 
                label="Accessories" 
                icon={<Settings className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'accessories'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'accessories' ? null : 'accessories')}
                disabled={selectedToothIds.length === 0}
              >
                <div className="flex items-center gap-1 p-1">
                  <ActionButton icon={<RefreshCw className="w-3.5 h-3.5" />} label="Comp. Coil" onClick={() => addAccessory('compressed-coil')} disabled={selectedToothIds.length < 2} />
                  <ActionButton icon={<RotateCcw className="w-3.5 h-3.5" />} label="Torque Spring" onClick={() => addAccessory('torque-spring')} disabled={selectedToothIds.length !== 1} />
                  <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Rot. Wedge" onClick={() => addAccessory('rotational-wedge')} disabled={selectedToothIds.length !== 1} />
                </div>
              </ActionBarCategory>
            </div>

            {selectedToothIds.length > 0 && (
              <div className="ml-auto flex items-center gap-3">
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  {selectedToothIds.length} Teeth Selected
                </span>
                <button 
                  onClick={() => setSelectedToothIds([])}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Main Chart Canvas */}
          <div className="flex-1 p-8 overflow-hidden flex items-center justify-center" ref={chartContainerRef}>
            <OrthodonticChartCanvas 
              upperTeeth={upperTeeth}
              lowerTeeth={lowerTeeth}
              selectedToothIds={selectedToothIds}
              selectedMiniscrewId={selectedMiniscrewId}
              onToothClick={handleToothClick}
              onToothContextMenu={handleToothContextMenu}
              onAnchorClick={(tid, type) => setMiniscrewConfig({ toothId: tid, anchorType: type })}
              onMiniscrewClick={(id) => setSelectedMiniscrewId(prev => prev === id ? null : id)}
              elastics={elastics}
              appliances={appliances}
              miniscrews={miniscrews}
              iprMarkers={iprMarkers}
              spaceMarkers={spaceMarkers}
              powerChains={powerChains}
              accessories={accessories}
              upperArchwire={upperArchwire}
              lowerArchwire={lowerArchwire}
              showBrackets={showBrackets}
              showArchwire={showArchwire}
              showAnchors={showAnchors}
              showAnnotations={showAnnotations}
              zoom={zoom}
              notationSystem={notationSystem}
              getAnchorCoords={getAnchorCoords}
              removeElastic={removeElastic}
              removeAppliance={removeAppliance}
              removeMiniscrew={(id) => setMiniscrewToRemove(id)}
              removeIPRMarker={removeIPRMarker}
              removeSpaceMarker={removeSpaceMarker}
              removePowerChain={removePowerChain}
              removeAccessory={removeAccessory}
            />
          </div>

          {/* Context Menu */}
          <AnimatePresence>
            {contextMenu && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                style={{ left: contextMenu.x, top: contextMenu.y }}
                className="fixed z-[100] bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-2 w-56 flex flex-col gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tooth {contextMenu.toothId} Actions</span>
                </div>
                
                <div className="space-y-1">
                  <ContextMenuCategory label="Status" icon={<Activity className="w-3.5 h-3.5" />}>
                    <ActionButton icon={<CircleDot className="w-3.5 h-3.5" />} label="Normal" onClick={() => updateToothStatus('normal')} />
                    {isNonMolarSelected && <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Bracket" onClick={() => updateToothStatus('bracket')} />}
                    {isMolarSelected && <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Band" onClick={() => updateToothStatus('band')} />}
                    {isMolarSelected && <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Molar Tube" onClick={() => updateToothStatus('molar-tube')} />}
                    <ActionButton icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Impacted" onClick={() => updateToothStatus('impacted')} variant="warning" />
                    <ActionButton icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Unerupted" onClick={() => updateToothStatus('unerupted')} variant="warning" />
                    {([...upperTeeth, ...lowerTeeth].find(t => t.id === contextMenu.toothId)?.status === 'impacted' || 
                      [...upperTeeth, ...lowerTeeth].find(t => t.id === contextMenu.toothId)?.status === 'unerupted') && (
                      <ActionButton icon={<Move className="w-3.5 h-3.5" />} label="Set Target Position" onClick={() => {
                        // For now, let's just set it to a dummy position, 
                        // as implementing a full canvas click handler is more complex.
                        // The user can refine this later.
                        setTargetPosition(contextMenu.toothId, { x: 200, y: 150 });
                      }} />
                    )}
                    <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} label="Extracted" onClick={() => updateToothStatus('extracted')} variant="danger" />
                  </ContextMenuCategory>

                  <ContextMenuCategory label={isMolarSelected && !isNonMolarSelected ? "Appliances" : "Brackets"} icon={<Square className="w-3.5 h-3.5" />}>
                    <div className="p-2 flex flex-col gap-2">
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Prescription</div>
                        <select 
                          value={selectedPrescription}
                          onChange={(e) => setSelectedPrescription(e.target.value as BracketPrescription)}
                          className="w-full px-2 py-1 rounded-lg text-[9px] font-bold border border-slate-200 text-slate-600 focus:outline-none"
                        >
                          {BRACKET_PRESCRIPTIONS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Brand</div>
                        <select 
                          value={selectedBrand}
                          onChange={(e) => setSelectedBrand(e.target.value)}
                          className="w-full px-2 py-1 rounded-lg text-[9px] font-bold border border-slate-200 text-slate-600 focus:outline-none"
                        >
                          {bracketBrands.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Slot Size</div>
                        <select 
                          value={selectedSlotSize}
                          onChange={(e) => setSelectedSlotSize(e.target.value as BracketSlotSize)}
                          className="w-full px-2 py-1 rounded-lg text-[9px] font-bold border border-slate-200 text-slate-600 focus:outline-none"
                        >
                          {BRACKET_SLOT_SIZES.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Brand</div>
                        <select 
                          value={selectedBrand}
                          onChange={(e) => setSelectedBrand(e.target.value)}
                          className="w-full px-2 py-1 rounded-lg text-[9px] font-bold border border-slate-200 text-slate-600 focus:outline-none"
                        >
                          {bracketBrands.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                      {isNonMolarSelected && (
                        <button
                          onClick={() => bondBrackets('bracket')}
                          className="w-full py-1.5 bg-blue-600 text-white rounded-lg font-bold text-[9px] uppercase tracking-wider hover:bg-blue-700 transition-all"
                        >
                          Bond Bracket
                        </button>
                      )}
                      {isMolarSelected && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => bondBrackets('band')}
                            className="flex-1 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-[9px] uppercase tracking-wider hover:bg-indigo-700 transition-all"
                          >
                            Bond Band
                          </button>
                          <button
                            onClick={() => bondBrackets('molar-tube')}
                            className="flex-1 py-1.5 bg-purple-600 text-white rounded-lg font-bold text-[9px] uppercase tracking-wider hover:bg-purple-700 transition-all"
                          >
                            Bond Tube
                          </button>
                        </div>
                      )}
                    </div>
                  </ContextMenuCategory>

                  <ContextMenuCategory label="Elastics" icon={<LinkIcon className="w-3.5 h-3.5" />}>
                    <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Class II" onClick={() => addElastic('class-II', '3/16"')} disabled={selectedToothIds.length < 2} />
                    <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Class III" onClick={() => addElastic('class-III', '3/16"')} disabled={selectedToothIds.length < 2} />
                    <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Triangle" onClick={() => addElastic('triangle', '1/4"')} disabled={selectedToothIds.length < 2} />
                  </ContextMenuCategory>

                  <ContextMenuCategory label="Chains" icon={<Grid className="w-3.5 h-3.5" />}>
                    <div className="p-2 flex flex-col gap-2 min-w-[180px]">
                      {selectedMiniscrewId && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CircleDot className="w-3 h-3 text-blue-500" />
                            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-tight">Miniscrew Anchor</span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setSelectedMiniscrewId(null); }} className="p-1 hover:bg-blue-100 rounded-full transition-colors">
                            <X className="w-3 h-3 text-blue-400" />
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-1">
                        {(['closed', 'open', 'long'] as PowerChainType[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => setSelectedPowerChainType(type)}
                            className={`px-1.5 py-1 text-[9px] font-medium rounded transition-all ${
                              selectedPowerChainType === type 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(POWERCHAIN_COLORS).map(([name, color]) => (
                          <button
                            key={name}
                            onClick={() => setSelectedPowerChainColor(color)}
                            className={`w-5 h-5 rounded-full border transition-all ${
                              selectedPowerChainColor === color ? 'border-blue-500 scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => addPowerChain(selectedPowerChainType, selectedPowerChainColor)}
                        className="w-full py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700 transition-all"
                        disabled={selectedToothIds.length < 2}
                      >
                        Apply Chain
                      </button>
                    </div>
                  </ContextMenuCategory>

                  <ContextMenuCategory label="Accessories" icon={<Settings className="w-3.5 h-3.5" />}>
                    <ActionButton icon={<RefreshCw className="w-3.5 h-3.5" />} label="Comp. Coil" onClick={() => addAccessory('compressed-coil')} disabled={selectedToothIds.length < 2} />
                    <ActionButton icon={<RotateCcw className="w-3.5 h-3.5" />} label="Torque Spring" onClick={() => addAccessory('torque-spring')} disabled={selectedToothIds.length !== 1} />
                    <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Rot. Wedge" onClick={() => addAccessory('rotational-wedge')} disabled={selectedToothIds.length !== 1} />
                  </ContextMenuCategory>
                </div>

                <div className="mt-1 pt-1 border-t border-slate-100">
                  <button 
                    onClick={() => { setSelectedToothIds([]); setContextMenu(null); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear Selection
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Miniscrew Configuration Modal */}
          <AnimatePresence>
            {miniscrewConfig && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Configure Miniscrew</h3>
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Anchor Site {miniscrewConfig.toothId}</p>
                    </div>
                    <button 
                      onClick={() => setMiniscrewConfig(null)}
                      className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Brand Selection */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Ormco', '3M', 'Dentsply', 'Forestadent'].map(brand => (
                          <button
                            key={brand}
                            onClick={() => setMsForm(prev => ({ ...prev, brand }))}
                            className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between group ${
                              msForm.brand === brand 
                                ? 'border-blue-500 bg-blue-50 text-blue-700' 
                                : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-slate-50'
                            }`}
                          >
                            {brand}
                            <div className={`w-2 h-2 rounded-full ${msForm.brand === brand ? 'bg-blue-500' : 'bg-slate-200 group-hover:bg-blue-300'}`} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dimensions */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Diameter (Width)</label>
                        <select 
                          value={msForm.diameter}
                          onChange={(e) => setMsForm(prev => ({ ...prev, diameter: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option>1.2mm</option>
                          <option>1.4mm</option>
                          <option>1.6mm</option>
                          <option>1.8mm</option>
                          <option>2.0mm</option>
                        </select>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Length (Height)</label>
                        <select 
                          value={msForm.length}
                          onChange={(e) => setMsForm(prev => ({ ...prev, length: e.target.value }))}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option>6mm</option>
                          <option>8mm</option>
                          <option>10mm</option>
                          <option>12mm</option>
                        </select>
                      </div>
                    </div>

                    <button 
                      onClick={() => addMiniscrew(msForm)}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Place Miniscrew
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Miniscrew Removal Confirmation Modal */}
          <AnimatePresence>
            {miniscrewToRemove && (
              <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Remove Miniscrew</h3>
                      <p className="text-xs text-red-600 font-bold uppercase tracking-wider">Confirm Action</p>
                    </div>
                    <button 
                      onClick={() => setMiniscrewToRemove(null)}
                      className="p-2 hover:bg-red-100 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason for Removal</label>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => {
                            saveToHistory();
                            setMiniscrews(prev => prev.filter(m => m.id !== miniscrewToRemove));
                            logAction(`Removed miniscrew (Reason: Loose)`);
                            setMiniscrewToRemove(null);
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:border-red-500 hover:bg-red-50 transition-all text-left flex items-center justify-between group"
                        >
                          Loose
                          <div className="w-2 h-2 rounded-full bg-slate-200 group-hover:bg-red-500" />
                        </button>
                        <button
                          onClick={() => {
                            saveToHistory();
                            setMiniscrews(prev => prev.filter(m => m.id !== miniscrewToRemove));
                            logAction(`Removed miniscrew (Reason: Stopped using it)`);
                            setMiniscrewToRemove(null);
                          }}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:border-blue-500 hover:bg-blue-50 transition-all text-left flex items-center justify-between group"
                        >
                          Stopped using it
                          <div className="w-2 h-2 rounded-full bg-slate-200 group-hover:bg-blue-500" />
                        </button>
                      </div>
                    </div>

                    <button 
                      onClick={() => setMiniscrewToRemove(null)}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Settings Modal */}
          <AnimatePresence>
            {showSettings && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowSettings(false)}
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
                        <Settings className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Chart Settings</h3>
                        <p className="text-[10px] text-slate-500 font-medium">Configure preferences and brands</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Notation Preference */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Notation System</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['fdi', 'palmer', 'both'] as const).map((sys) => (
                          <button
                            key={sys}
                            onClick={() => setNotationSystem(sys)}
                            className={`py-2 rounded-xl text-[10px] font-bold border transition-all ${
                              notationSystem === sys 
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200' 
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {sys.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Brand Management */}
                    {[
                      { label: 'Bracket Brands', state: bracketBrands, setState: setBracketBrands, type: 'bracket' },
                      { label: 'Archwire Brands', state: archwireBrands, setState: setArchwireBrands, type: 'archwire' },
                      { label: 'Elastic Brands', state: elasticBrands, setState: setElasticBrands, type: 'elastic' }
                    ].map((section) => (
                      <div key={section.type} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Grid className="w-4 h-4 text-slate-400" />
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{section.label}</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                          {section.state.map((brand) => (
                            <div 
                              key={brand}
                              className="group flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-xl transition-all hover:border-slate-200"
                            >
                              <span className="text-[10px] font-bold text-slate-600">{brand}</span>
                              <button 
                                onClick={() => section.setState(prev => prev.filter(b => b !== brand))}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 rounded-md transition-all text-red-400"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder={`Add ${section.type} brand...`}
                            value={newBrandInput.type === section.type ? newBrandInput.value : ''}
                            onChange={(e) => setNewBrandInput({ type: section.type, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newBrandInput.value.trim()) {
                                section.setState(prev => [...prev, newBrandInput.value.trim()]);
                                setNewBrandInput({ type: '', value: '' });
                              }
                            }}
                            className="flex-1 px-3 py-2 rounded-xl text-[10px] font-bold border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                          <button 
                            onClick={() => {
                              if (newBrandInput.type === section.type && newBrandInput.value.trim()) {
                                section.setState(prev => [...prev, newBrandInput.value.trim()]);
                                setNewBrandInput({ type: '', value: '' });
                              }
                            }}
                            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 bg-slate-50/50 border-t border-slate-100">
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="w-full py-3 bg-slate-800 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// Helper Components
function ActionBarCategory({ label, icon, children, isActive, onClick, disabled }: { 
  label: string, 
  icon: React.ReactNode, 
  children: React.ReactNode,
  isActive: boolean,
  onClick: () => void,
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <button 
        disabled={disabled}
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
          disabled 
            ? 'text-slate-300 border-transparent cursor-not-allowed' 
            : isActive 
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
              : 'text-slate-500 hover:bg-slate-50 border-transparent hover:border-slate-200'
        }`}
      >
        {icon}
        <span>{label}</span>
        {!disabled && <ChevronDown className={`w-3 h-3 transition-transform ${isActive ? 'rotate-180' : ''}`} />}
      </button>

      <AnimatePresence>
        {isActive && !disabled && (
          <motion.div 
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-2xl z-30 min-w-max"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ContextMenuCategory({ label, icon, children }: { label: string, icon: React.ReactNode, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative group/cat">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${isOpen ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <span>{label}</span>
        </div>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="pl-6 py-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick, variant = 'default', disabled = false }: { 
  icon: React.ReactNode, 
  label: string, 
  onClick: () => void,
  variant?: 'default' | 'danger' | 'warning',
  disabled?: boolean
}) {
  const colors = {
    default: disabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-blue-50 text-slate-600 hover:text-blue-600',
    danger: disabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-red-50 text-slate-600 hover:text-red-600',
    warning: disabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-orange-50 text-slate-600 hover:text-orange-600'
  };

  return (
    <button 
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${colors[variant]}`}
    >
      {icon}
      <span className={disabled ? 'opacity-50' : ''}>{label}</span>
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

export default SnapshotEditor;
