import React, { useState, useReducer, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
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
  FileText,
  Grid, 
  ChevronDown,
  TriangleAlert,
  Camera
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
  LigatureConfig,
  LigatureType,
  ToothStatus,
  ChartAction,
  ChartSettings,
  DiagnosisValue,
  AlignmentValue,
  ConditionValue,
  AlertValue,
  ClinicalStatus,
} from '../types';
import ChartSettingsModal from './ChartSettingsModal';
import AppointmentInfoHeader from './AppointmentInfoHeader';
import AppointmentActionPanel from './AppointmentActionPanel';
import OrthodonticChartCanvas from './OrthodonticChartCanvas';
import PrescriptionOPGModal from './PrescriptionOPGModal';
import { getPrescription, ToothID } from '../prescriptions';
import ToothActionPopup from './ToothActionPopup';
import ToothInfoPopup from './ToothInfoPopup';
import BracketActionPanel, { BracketConfig, AppliedBracketType } from './BracketActionPanel';
import StatusSummaryBar, { computeDimmedIds } from './StatusSummaryBar';
import OrthoStatusBar, { computeOrthoDimmedIds } from './OrthoStatusBar';
import type { OrthoFilterKey } from './OrthoStatusBar';
import { useBondingEngine } from '../hooks/useBonding';
import AppModal from '@/components/ui/AppModal';
import { useSequenceEngineForCase } from '../hooks/useSequenceEngine';
import { useTadsByCase, useCreateTad, useRemoveTad, useMarkTadForRemoval, useFailTad, useRemoveAllTads } from '../hooks/useTads';
import MiniscrewContextMenu from './MiniscrewContextMenu';
import type { MiniscrewStatus } from './MiniscrewContextMenu';
import { resolveMiniscrewPosition, getMiniscrewPositionLabel } from '../utils/miniscrewUtils';
import { chartReducer, initialChartState } from '../utils/chartReducer';
import { dispatchClinicalEvent } from '../utils/dispatchClinicalEvent';
import SequenceGuidanceCard from './SequenceGuidanceCard';
import { Portal } from '@/components/ui/Portal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { useOPGRecords } from '../hooks/useRecordSets';
import { dispatchClinicalAction } from '../utils/actionDispatcher';
import DuplicateActionModal from '@/components/ui/DuplicateActionModal';
import SnapshotSelector from './SnapshotSelector';
import EditSnapshotModal from './EditSnapshotModal';
import { useSnapshots, useLatestSnapshot, useCreateSnapshot, useUpdateSnapshotMetadata, useDeleteSnapshot, useCaseTimeline, useDerivedClinicalState } from '../hooks/useSnapshots';
import ClinicalAssistant from './assistant/ClinicalAssistant';
import { NoActiveVisitScreen } from './NoActiveVisitScreen';
import useAutoSaveDraft from '../hooks/useAutoSaveDraft';
import {
  useActiveVisit,
  useStartVisit,
  useEndVisit,
  useUpdateVisitNotes,
  useSendHeartbeat,
  useTakeoverVisit,
} from '../hooks/useActiveVisit';
import useSmartAutoSave   from '../hooks/useSmartAutoSave';
import useVisitPresenceSocket from '../hooks/useVisitPresenceSocket';
import { useVisitDraftRecovery } from '../hooks/useVisitDraftRecovery';
import DraftRecoveryModal from './DraftRecoveryModal';
import { SaveIndicator, VisitPresenceBanner } from './VisitSessionUX';
// P2-1: Extracted hooks
import { useHydrationLock } from '../hooks/useHydrationLock';
import { useUndoHistory } from '../hooks/useUndoHistory';
import type { UndoSideEffect } from '../hooks/useUndoHistory';
// P2-2: Centralized BroadcastChannel singleton
import { useCaseTabChannel } from '@/lib/realtime/caseTabChannel';

import VisitHistorySidebar from './VisitHistorySidebar';
import { ClinicalTimelinePanel } from './ClinicalTimelinePanel';
import { useStateAtEvent } from '../hooks/useClinicalTimeline';
import type { SnapshotListItem, SnapshotDTO, VisitType } from '../api/snapshot.api';
import { toast } from 'sonner';
import { useRoleName } from '@/org/hooks/usePermission';
import TodoSidebar from './TodoSidebar';
import TodoSuggestionModal from './TodoSuggestionModal';
import DebondModal from './DebondModal';
import PhaseHintBar from './PhaseHintBar';
import { useTodos, useBatchCreateTodos, TODO_KEYS } from '../hooks/useTodos';
import type { TodoClinicalPhase, CreateTodoPayload } from '../api/orthoTodo.api';
import { getAlignmentSuggestions } from '../utils/actionTodoMap';
import type { TodoSuggestionItem } from '../utils/actionTodoMap';
import { useDebondTooth } from '../hooks/useBonding';
import { ListTodo, Clock } from 'lucide-react';
import * as clinicalActionApi from '../api/clinicalAction.api';

const STORAGE_KEY = "snapshot_editor_onboarding_seen";

/** Normalize chartState before sending — prevents undefined fields being stripped by JSON.stringify */
function normalizeChartState(state: Record<string, any>) {
  return {
    upperTeeth:   state.upperTeeth   ?? [],
    lowerTeeth:   state.lowerTeeth   ?? [],
    upperArchwire: state.upperArchwire ?? null,
    lowerArchwire: state.lowerArchwire ?? null,
    elastics:     state.elastics     ?? [],
    appliances:   state.appliances   ?? [],
    miniscrews:   state.miniscrews   ?? [],
    iprMarkers:   state.iprMarkers   ?? [],
    spaceMarkers: state.spaceMarkers ?? [],
    accessories:  state.accessories  ?? [],
    powerChains:  state.powerChains  ?? [],
    ligatures:    state.ligatures    ?? [],
  };
}

interface SnapshotEditorProps {
  appointment: Appointment;
  /** Direct caseId prop — takes precedence over appointment.caseId */
  caseId?: string;
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
const DEFAULT_BRACKET_BRANDS: string[] = ['3M', 'Ormco', 'American Orthodontics', 'Dentsply Sirona', 'Forestadent', 'GAC'];
const DEFAULT_ARCHWIRE_BRANDS: string[] = ['3M', 'Ormco', 'GAC', 'Forestadent'];
const DEFAULT_ELASTIC_BRANDS: string[] = ['3M', 'Ormco', 'American Orthodontics'];
const DEFAULT_CHART_SETTINGS: ChartSettings = {
  notationSystem: 'fdi',
  bracketBrands: DEFAULT_BRACKET_BRANDS,
  archwireBrands: DEFAULT_ARCHWIRE_BRANDS,
  elasticBrands: DEFAULT_ELASTIC_BRANDS,
};
const BRACKET_ACTIONS = ['Bonding', 'Rebonding', 'Repositioning'] as const;
type BracketAction = typeof BRACKET_ACTIONS[number];

const ARCHWIRE_MATERIALS: ArchwireMaterial[] = ['NiTi', 'SS', 'TMA', 'Copper NiTi'];
const ARCHWIRE_SIZES: ArchwireSize[] = ['0.012', '0.014', '0.016', '0.018', '0.020', '16x22', '17x25', '19x25', '21x25'];
const UPPER_TOOTH_IDS = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TOOTH_IDS = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// ── Clinical Tagging Engine — option definitions ─────────────────────────────────

const DIAGNOSIS_OPTIONS: { label: string; value: DiagnosisValue & string; color: string }[] = [
  { label: 'Caries',        value: 'caries',       color: '#ef4444' },
  { label: 'Root Canal',    value: 'root_canal',   color: '#f97316' },
  { label: 'Badly Decayed', value: 'badly_decayed',color: '#dc2626' },
  { label: 'Missing',       value: 'missing',      color: '#94a3b8' },
  { label: 'Extracted',     value: 'extracted',    color: '#64748b' },
];

const ALIGNMENT_OPTIONS: { label: string; value: AlignmentValue & string; color: string }[] = [
  { label: 'Rotated',              value: 'rotated',           color: '#a855f7' },
  { label: 'Buccal Displacement',  value: 'displaced_buccal',  color: '#2dd4bf' },
  { label: 'Lingual Displacement', value: 'displaced_lingual', color: '#06b6d4' },
  { label: 'Impacted',             value: 'impacted',          color: '#f59e0b' },
  { label: 'Mesial Out',           value: 'mesial_out',        color: '#f97316' },
  { label: 'Distal Out',           value: 'distal_out',        color: '#fb923c' },
  { label: 'Mesial In',            value: 'mesial_in',         color: '#0ea5e9' },
  { label: 'Distal In',            value: 'distal_in',         color: '#38bdf8' },
];

const CONDITION_OPTIONS: { label: string; value: ConditionValue & string }[] = [
  { label: 'Normal',     value: 'normal'    },
  { label: 'Band',       value: 'band'      },
  { label: 'Molar Tube', value: 'molar_tube'},
];

/** Patient-level flags — NOT stored on individual teeth */
const GLOBAL_ALERT_OPTIONS: { label: string; value: AlertValue; color: string; emoji: string }[] = [
  { label: 'Medical Condition', value: 'medical_alert', color: '#f43f5e', emoji: '❤️' },
  { label: 'Poor Oral Hygiene', value: 'poor_hygiene',  color: '#84cc16', emoji: '🪵' },
];

/** Per-tooth flags — stored in tooth.clinicalAlerts */
const TOOTH_ALERT_OPTIONS: { label: string; value: AlertValue; color: string; emoji: string }[] = [
  { label: 'Root Resorption', value: 'root_resorption', color: '#fbbf24', emoji: '⚠️' },
  { label: 'Anchorage Loss',  value: 'anchorage_loss',  color: '#8b5cf6', emoji: '💉' },
];


const SnapshotEditor: React.FC<SnapshotEditorProps> = ({ appointment, caseId: caseIdProp, onBack, onSave }) => {
  // ── Effective caseId: prop takes precedence over appointment.caseId ──────
  const effectiveCaseId = caseIdProp || appointment.caseId;
  const roleName = useRoleName();

  // ── Phase 2: Active Visit Session Gate ──────────────────────────────────
  // INVARIANT: No clinical mutation is allowed without an active visit session.
  // This is enforced at BOTH layers:
  //   • Backend: requireActiveVisit middleware on all mutation routes
  //   • Frontend: NoActiveVisitScreen blocks UI until visit is started
  const {
    data: activeVisit,
    isLoading: visitLoading,
  } = useActiveVisit(effectiveCaseId);

  const startVisitMutation       = useStartVisit(effectiveCaseId);
  const endVisitMutation         = useEndVisit(effectiveCaseId);
  const updateVisitNotesMutation = useUpdateVisitNotes();
  const heartbeatMutation        = useSendHeartbeat();
  const takeoverMutation         = useTakeoverVisit(effectiveCaseId);

  // Phase 5: Time travel state — must be declared BEFORE useStateAtEvent uses them
  const [showTimelinePanel,  setShowTimelinePanel]  = useState(false);
  const [timeTravelEventId,  setTimeTravelEventId]  = useState<string | null>(null);

  // Phase 5: Time travel — derives chart state at a specific event (deterministic replay)
  const { data: timeTravelState } = useStateAtEvent(effectiveCaseId, timeTravelEventId);

  // Phase 4: Conflict state
  const [lockConflict, setLockConflict] = useState<{
    lockedBy: string | null;
    lockedAt: string | null;
    visitId:  string | null;
  } | null>(null);

  const [snapshotConflict, setSnapshotConflict] = useState<{
    currentVersion: number;
    expectedVersion: number;
  } | null>(null);

  // Ref to active visit — used inside callbacks that need visitId
  // without adding activeVisit to their dependency arrays.
  const activeVisitRef = useRef(activeVisit ?? null);
  useEffect(() => { activeVisitRef.current = activeVisit ?? null; }, [activeVisit]);

  const [selectedToothIds, setSelectedToothIds] = useState<number[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>('status');

  // ── Phase 2 Full Event Engine: reducer manages ALL chart state ────────────
  const [chartState, dispatch] = useReducer(chartReducer, initialChartState);
  const {
    upperTeeth, lowerTeeth,
    miniscrews, upperArchwire, lowerArchwire,
    elastics, appliances, powerChains, accessories, ligatures, iprMarkers, spaceMarkers,
  } = chartState;

  // Stable ref to latest chartState — used by useCallbacks that need current
  // state without adding chartState to their dep array (avoids stale closures)
  const chartStateRef = useRef<typeof chartState>(chartState);
  useEffect(() => { chartStateRef.current = chartState; });
  const [actions, setActions] = useState<Action[]>([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // Phase 6C: visitType defaults to activeVisit.visitType when available.
  // This ensures the snapshot payload uses the real server visit type, not a stale default.
  const [visitType, setVisitType] = useState<VisitType>(
    (activeVisit?.visitType as VisitType) || 'adjustment'
  );

  // Phase 6C: Sync visitType from activeVisit when the visit loads or changes.
  // useState initializer only runs once — this effect handles subsequent visit starts.
  useEffect(() => {
    if (activeVisit?.visitType) {
      setVisitType(activeVisit.visitType as VisitType);
    }
  }, [activeVisit?.visitType]);

  // ── Phase 6B: Smart Auto-Save Draft ──────────────────────────────────────────
  // Replaces Phase 6 interval-based save.
  // Debounced (2s), change-detected, tab-visibility guarded.
  // Returns saveStatus for the SaveIndicator chip in the header.
  const { saveStatus } = useSmartAutoSave({
    visitId:    activeVisit?.id ?? null,
    chartState: chartState as unknown as Record<string, unknown>,
    notes,
    enabled:    !!activeVisit && activeVisit.status === 'active',
  });

  // ── Phase 6B: Visit Presence Socket ──────────────────────────────────────────
  // Listens for other doctors opening or leaving the same visit.
  // Zero-trust: reacts ONLY to visitId match; no chart data trusted from socket.
  const [otherDoctorName, setOtherDoctorName] = useState<string | null>(null);

  useVisitPresenceSocket(activeVisit?.id, {
    currentUserId:  activeVisit?.doctorId ?? null,
    onOtherJoined: ({ doctorName }) => {
      setOtherDoctorName(doctorName ?? 'Another doctor');
    },
    onLeft: () => {
      setOtherDoctorName(null);
    },
  });

  // ── Phase 6: Session Recovery ─────────────────────────────────────────────────
  // On session open, check for a crash-interrupted draft.
  const {
    draftAvailable,
    draft: recoveryDraft,
    clearDraft,
  } = useVisitDraftRecovery(activeVisit?.id);

  const [showDraftRecovery, setShowDraftRecovery] = useState(false);

  // P0-6: localStorage chart draft — requires explicit user confirmation before hydration.
  // State holds the parsed draft so the DraftRecoveryModal can render it.
  // Null means no localStorage draft found or user already acted on it.
  const [localStorageDraft, setLocalStorageDraft] = useState<{ savedAt: number; chartState: typeof chartState } | null>(null);
  const [showLocalStorageDraftRecovery, setShowLocalStorageDraftRecovery] = useState(false);

  // Show the recovery modal once when a fresh draft is found
  useEffect(() => {
    if (draftAvailable && recoveryDraft) {
      setShowDraftRecovery(true);
    }
  }, [draftAvailable, recoveryDraft]);

  // ── SNAPSHOT STATE — Server state (React Query) ───────────────────────────────
  // Replaces hardcoded mock snapshots. Never stored as useState(apiData).
  // useSnapshots → list of list-items (no chartState, for sidebar)
  // useLatestSnapshot → full DTO with chartState (for auto-load on open)
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSnapshots(effectiveCaseId);
  // Visit-first: only fetch snapshot/derived-state once an active visit exists
  const { data: latestSnapshot, isLoading: latestLoading }    = useLatestSnapshot(effectiveCaseId, activeVisit?._id);
  // Phase 4: Derived clinical state = latest snapshot chartState + all events after it
  const { data: derivedClinical, isLoading: derivedLoading }  = useDerivedClinicalState(effectiveCaseId, activeVisit?._id);
  // FIX-2: unified visit timeline (drives onboarding + sidebar)
  const { data: timeline = [], isLoading: timelineLoading } = useCaseTimeline(effectiveCaseId);
  const queryClient = useQueryClient();

  // ID of the currently displayed snapshot (for highlight in selector)
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  // Snapshot mode: when true, DB hydration is blocked so snapshot state is preserved
  // Any user mutation (saveToHistory) exits this mode and returns to live editing
  const [isSnapshotMode, setIsSnapshotMode] = useState(false);

  // ── RESTORE ENGINE — Real Preview + Multi-level Undo ─────────────────────────
  // previewSnapshot: active when user is viewing a snapshot preview (chart already updated)
  const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotDTO | null>(null);
  // Multi-level undo stack — capped at 10 entries (memory safety)
  const [restoreStack, setRestoreStack] = useState<Snapshot['chartState'][]>([]);
  const [canUndoRestore, setCanUndoRestore] = useState(false);
  // Lock to prevent double-apply
  const [isRestoring, setIsRestoring] = useState(false);
  const MAX_RESTORE_HISTORY = 10;

  // Edit-snapshot modal state
  const [editingSnapshot, setEditingSnapshot] = useState<SnapshotListItem | null>(null);

  // ── TODO ENGINE HOOKS ─────────────────────────────────────────────────────────
  // useTodos: needed for duplicate-prevention on suggestion confirm
  const { data: currentTodos = [] } = useTodos(effectiveCaseId);
  // useBatchCreateTodos: creates multiple todos with a single cache invalidation
  const batchCreateTodos = useBatchCreateTodos(effectiveCaseId);
  // useDebondTooth: records debond event to DB + optimistic cache update
  const debondMutation = useDebondTooth(effectiveCaseId);

  // Mutations
  const createSnapshotMutation = useCreateSnapshot(effectiveCaseId);
  const updateMeta             = useUpdateSnapshotMetadata(effectiveCaseId);
  const deleteMutation         = useDeleteSnapshot(effectiveCaseId);

  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Phase 6D: Auto-save draft — server-side crash recovery ───────────────
  // Writes chart state + notes to server every 5s while an active visit exists.
  // Fire-and-forget — never blocks clinical workflow.
  // Draft is deleted when snapshot is saved (handled inside handleSaveSnapshot).
  useAutoSaveDraft({
    visitId:    activeVisit?._id ?? null,
    chartState: {
      upperTeeth, lowerTeeth, upperArchwire, lowerArchwire,
      elastics, appliances, iprMarkers, spaceMarkers, accessories, powerChains, ligatures,
    } as Record<string, unknown>,
    notes,
    enabled: activeVisit?.status === 'active',
  });

  // ── P0-5: Hydration lock (extracted to useHydrationLock) ────────────────
  // Prevents React Query refetches from overwriting active, unsaved edits.
  const {
    isHydrationLocked,
    lockHydration,
    unlockHydration,
  } = useHydrationLock();

  // ── Undo history (extracted to useUndoHistory) ───────────────────────────
  // Ref-backed stacks + TAD DB side-effect rollback — see useUndoHistory.ts.
  const {
    canUndo,
    saveToHistory,
    undo,
    resetHistory: resetUndoHistory,
  } = useUndoHistory({
    chartStateRef,
    dispatch,
    onSnapshotModeExit: () => setIsSnapshotMode(false),
    onHydrationLock:    lockHydration,
    removeTadFromDb:    (tadId) =>
      removeAllTadsMutation
        ? removeAllTadsMutation.mutateAsync({ tadId } as any)
        : Promise.reject(new Error('removeAllTadsMutation not mounted')),
  });

  // Derived convenience flag — true when there are unsaved changes in progress.
  // Used to guard navigation-away warnings and hydration lock checks.
  const hasUnsavedChanges = canUndo || isHydrationLocked();
  
  // UI State
  const [showBrackets, setShowBrackets] = useState(true);
  const [showArchwire, setShowArchwire] = useState(true);
  const [showAnchors, setShowAnchors] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [chartSettings, setChartSettings] = useState<ChartSettings>(DEFAULT_CHART_SETTINGS);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const notationSystem = chartSettings.notationSystem;
  const setNotationSystem = (v: 'fdi' | 'palmer' | 'both') => setChartSettings(prev => ({ ...prev, notationSystem: v }));
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, toothId: number } | null>(null);

  // ── DUAL INTERACTION SYSTEM ──────────────────────────────────────────────
  /** Tooth currently targeted by action/info popup (not the same as selectedToothIds) */
  const [activeTooth, setActiveTooth] = useState<ToothData | null>(null);
  const [actionPopup, setActionPopup] = useState<{ x: number; y: number } | null>(null);
  const [infoPopup,   setInfoPopup]   = useState<{ x: number; y: number } | null>(null);
  const [selectedPowerChainType, setSelectedPowerChainType] = useState<PowerChainType>('closed');
  const [selectedPowerChainColor, setSelectedPowerChainColor] = useState<string>(POWERCHAIN_COLORS.gray);
  const [activeActionBarCategory, setActiveActionBarCategory] = useState<string | null>(null);
  const [selectedPrescription, setSelectedPrescription] = useState<BracketPrescription>('MBT');
  const [selectedSlotSize, setSelectedSlotSize] = useState<BracketSlotSize>('0.022');
  const [selectedBrand, setSelectedBrand] = useState<BracketBrand>('3M');
  const [selectedBracketAction, setSelectedBracketAction] = useState<BracketAction>('Bonding');
  const [selectedBondingHeight, setSelectedBondingHeight] = useState<string>('');
  const [selectedBondingOption, setSelectedBondingOption] = useState<'marginal-ridges-level' | 'middle-middle' | 'custom'>('custom');
  const [selectedArchwireMaterial, setSelectedArchwireMaterial] = useState<ArchwireMaterial>('NiTi');
  const [selectedArchwireSize, setSelectedArchwireSize] = useState<ArchwireSize>('0.014');
  const [selectedCinchWire, setSelectedCinchWire] = useState(false);

  // ── Modal State for Error Dialogs ───────────────────────────────────────
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [upperWireFrom, setUpperWireFrom] = useState(16);
  const [upperWireTo, setUpperWireTo] = useState(26);
  const [lowerWireFrom, setLowerWireFrom] = useState(46);
  const [lowerWireTo, setLowerWireTo] = useState(36);
  const [selectedMiniscrewId, setSelectedMiniscrewId] = useState<string | null>(null);
  const [miniscrewConfig, setMiniscrewConfig] = useState<{ toothId: number, anchorType: keyof ToothAnchors } | null>(null);
  const [msForm, setMsForm] = useState({ brand: 'Ormco', diameter: '1.6mm', length: '8mm', anchorType: 'mesial' as keyof ToothAnchors });
  const [showOPGModal, setShowOPGModal] = useState(false);

// ── OPG Reference Fetching ───────────────────────────────────────────────
  // Uses workflow endpoint to fetch recordSets, then extracts OPG images.
  // The old /org/record-sets/patient/:patientId endpoint DOES NOT EXIST.
  // RecordSets are embedded in workflowData.recordSets via OrthodonticCase.
  const { 
    recordSets: workflowRecordSets, 
    opgRecords, 
    primaryOpgUrl, 
    isLoading: opgLoading,
    isError: opgError 
  } = useOPGRecords(effectiveCaseId);

  // OPG error logging only — debug spam removed
  useEffect(() => {
    if (!opgLoading && opgError) {
      console.warn('[OPG] Fetch error:', opgError);
    }
  }, [opgLoading, opgError]);

  // FIX-5: onboarding triggers off timeline (visits), not raw snapshot list
  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen && !timelineLoading && timeline.length === 0) {
      setShowOnboarding(true);
    }
  }, [timeline, timelineLoading]);

  // FIX-5: auto-close when first visit exists
  useEffect(() => {
    if (timeline.length > 0) {
      localStorage.setItem(STORAGE_KEY, "true");
      setShowOnboarding(false);
    }
  }, [timeline]);

  const handleCloseOnboarding = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShowOnboarding(false);
  };

  // (Archwire debug logging removed — was causing console noise)
  /**
   * Duplicate bonding confirmation state.
   * When non-null, a confirmation modal is shown asking the clinician to confirm
   * rebonding over an existing active bonding record.
   * `pendingPayload`: the bonding payload waiting to be confirmed.
   */
  const [dupeBondConfirm, setDupeBondConfirm] = useState<{
    pendingPayload: import('../api/bonding.api').ApplyBondingPayload;
    alreadyBondedTeeth: number[];
  } | null>(null);

  const [duplicateModal, setDuplicateModal] = useState<{
    open: boolean;
    actionLabel?: string;
    contextParams?: { tooth?: string | number; arch?: string };
    onConfirm: () => void;
  }>({
    open: false,
    onConfirm: () => {},
  });

  const handleDuplicateBlocked = (actionLabel: string, contextParams: any, dispatchOptions: any) => {
    console.warn(`[ActionDispatcher] Duplicate intercepted: showing modal for ${actionLabel}`);
    setDuplicateModal({
      open: true,
      actionLabel,
      contextParams,
      onConfirm: () => {
        dispatchClinicalAction({ ...dispatchOptions, skipDuplicateCheck: true });
        setDuplicateModal(prev => ({ ...prev, open: false }));
      }
    });
  };

  // ── STATUS FILTER ENGINE — clinical chart dimming ────────────────────────────
  /** Locked filter: persisted across interactions (click to set / click again to clear) */
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);
  /** Transient hover preview: visible only while the cursor is over a bar pill */
  const [hoverStatusFilter,  setHoverStatusFilter]  = useState<string | null>(null);

  // ── ORTHO STATUS FILTER ENGINE — mechanical/appliance chart dimming ──────────
  const [activeOrthoFilter, setActiveOrthoFilter] = useState<OrthoFilterKey | null>(null);
  const [hoverOrthoFilter,  setHoverOrthoFilter]  = useState<OrthoFilterKey | null>(null);

  // ── BONDING ENGINE — DB-backed bracket/tube lifecycle ────────────────────────
  const bondingEngine = useBondingEngine(
    effectiveCaseId,
    appointment.patientId,
  );

  // ── TAD ENGINE — DB-backed miniscrew lifecycle ────────────────────────────────
  // useTadsByCase fires ONLY when caseId is a valid 24-char hex MongoDB ObjectId.
  // On load, DB TADs are hydrated into local miniscrews state (single source of truth).
  const { data: dbTads = [] } = useTadsByCase(effectiveCaseId);
  const createTadMutation      = useCreateTad(effectiveCaseId ?? '');
  const removeTadMutation      = useRemoveTad(effectiveCaseId ?? '');
  const markForRemovalMutation = useMarkTadForRemoval(effectiveCaseId ?? '');
  const failTadMutation        = useFailTad(effectiveCaseId ?? '');
  const removeAllTadsMutation  = useRemoveAllTads(effectiveCaseId ?? '');

  // Miniscrew context menu (right-click on placed TAD)
  const [miniscrewContextMenu, setMiniscrewContextMenu] = useState<{
    id:     string;
    x:      number;
    y:      number;
    status: MiniscrewStatus;
  } | null>(null);

  // ── DB → Local State Hydration: TADs ─────────────────────────────────────────
  // Converts DB TADs into the local Miniscrew[] shape that OrthodonticChartCanvas
  // renders. REMOVED TADs are hidden; ACTIVE/NEEDS_REMOVAL/FAILED are shown.
  // Runs every time React Query delivers fresh data (post-mutation invalidation).
  // DB is the SSOT — local optimistic updates are overwritten on refetch.
  const dbTadsRef = useRef<string>('');
  useEffect(() => {
    // 🔴 SNAPSHOT MODE / HYDRATION LOCK: DB must not override snapshot or active-edit state
    // P0-5: isHydrationLocked() covers live unsaved edits; isSnapshotMode covers preview
    const lockHydration = isSnapshotMode || isHydrationLocked();
    if (lockHydration) return;

    const fingerprint = JSON.stringify(dbTads ?? []);
    if (fingerprint === dbTadsRef.current) return;
    dbTadsRef.current = fingerprint;

    if (!dbTads || dbTads.length === 0) {
      dispatch({ type: 'HYDRATE_TADS', payload: [] });
      return;
    }

    // Map DB status → chart display status
    const STATUS_MAP: Record<string, MiniscrewStatus> = {
      ACTIVE:         'active',
      NEEDS_REMOVAL:  'healing',
      FAILED:         'failed',
    };

    // Render ACTIVE + NEEDS_REMOVAL + FAILED on chart. Only REMOVED is hidden.
    const visibleTads = dbTads.filter(t => t.status !== 'REMOVED');

    const hydratedMiniscrews: Miniscrew[] = visibleTads.map(tad => ({
      id: tad._id,
      toothId: tad.chartPosition?.toothId ?? tad.toothNumber,
      anchorType: (tad.chartPosition?.anchorType ?? 'apical') as Miniscrew['anchorType'],
      angle: 90,
      brand:    tad.brand,
      diameter: tad.diameter,
      length:   tad.length,
      status:   STATUS_MAP[tad.status] ?? 'active',
    }));
    dispatch({ type: 'HYDRATE_TADS', payload: hydratedMiniscrews });
  }, [dbTads, isSnapshotMode]);

  // ── DB → Local State Hydration: Bonding → Tooth Status + Clinical Data ────────
  // Bonding DB records drive the visual bracket/tube status AND clinical metadata
  // (bondingHeight, prescription, brand, slotSize) on each tooth.
  // Chart teeth start as 'healthy'; bonded teeth are upgraded to bracket/molar-tube.
  //
  // CRITICAL: Uses JSON-diff ref (not a one-shot boolean) so re-hydration fires after
  // EVERY cache invalidation from mutations (rebond, debond, reposition).
  // Handles the full debond case: when bondingByTooth is empty after filtering,
  // teeth that were previously bracket are reset to 'healthy'.
  const bondingsSnapshotRef = useRef<string>('');
  useEffect(() => {
    if (bondingEngine.bondingsLoading) return;
    // NOTE: do NOT guard on bondings.length === 0 — we need to handle debond-all.
    // Handle undefined (not yet loaded) vs empty array (no bondings in DB).
    if (bondingEngine.bondings === undefined) return;

    // 🔴 SNAPSHOT MODE / HYDRATION LOCK: DB must not override snapshot or active-edit state
    // P0-5: isHydrationLocked() prevents React Query refetch from overwriting unsaved changes
    const lockHydration = isSnapshotMode || isHydrationLocked();
    if (lockHydration) return;

    // Stable deep-comparison: only re-hydrate when DB data actually changed.
    const nextSnapshot = JSON.stringify(bondingEngine.bondings);
    if (nextSnapshot === bondingsSnapshotRef.current) return;
    bondingsSnapshotRef.current = nextSnapshot;

    // Build lookup: tooth FDI → full bonding record (ACTIVE only)
    const bondingByTooth = new Map<number, (typeof bondingEngine.bondings)[number]>();
    bondingEngine.bondings.forEach(b => {
      if (b.status === 'ACTIVE') bondingByTooth.set(b.tooth, b);
    });

    const hydrateTeeth = (teeth: ToothData[]): ToothData[] =>
      teeth.map(t => {
        const b = bondingByTooth.get(t.id);

        if (!b) {
          // ── Tooth is NOT bonded in DB.
          // If it was previously hydrated as bracket/molar-tube, reset to healthy.
          // This handles the debond-after-bond-on-refresh case.
          const wasBonded = t.status === 'bracket' || t.status === 'molar-tube' || t.status === 'band';
          return wasBonded ? { ...t, status: 'healthy' as ToothStatus } : t;
        }

        // ── Tooth IS bonded — resolve correct visual status from DB type.
        // DB types: 'BRACKET' | 'BAND' | 'TUBE' → UI status: 'bracket' | 'band' | 'molar-tube'
        const isMolarTooth = t.type === 'molar' || t.id % 10 >= 6;

        // Map DB bonding type to UI status
        let status: ToothStatus;
        const bondingType = b.type?.toUpperCase();

        if (bondingType === 'BAND') {
          status = 'band';
        } else if (bondingType === 'TUBE') {
          status = 'molar-tube';
        } else if (bondingType === 'BRACKET') {
          // BRACKET on molar should display as molar-tube (fallback for legacy data)
          status = isMolarTooth ? 'molar-tube' : 'bracket';
        } else {
          // Fallback for missing/unknown type: infer from tooth position
          status = isMolarTooth ? 'molar-tube' : 'bracket';
        }

        return {
          ...t,
          status,
          // ── Carry clinical metadata from DB so BracketActionPanel / ToothActionPopup
          // pre-fill correctly after a page refresh ──
          prescription: (b.prescription as BracketPrescription | null) ?? t.prescription,
          slotSize:     (b.slot as BracketSlotSize | null) ?? t.slotSize,
          brand:        b.brand ?? t.brand,
          bondingHeight: b.bondingHeight ?? t.bondingHeight,
          bondingOption: (b.bondingPosition ?? t.bondingOption) as ToothData['bondingOption'],
        };
      });

    // Apply bonding hydration to current teeth state via reducer
    const { upperTeeth: curUpper, lowerTeeth: curLower } = chartStateRef.current;
    dispatch({
      type: 'HYDRATE_TEETH',
      payload: {
        upper: hydrateTeeth(curUpper),
        lower: hydrateTeeth(curLower),
      },
    });

  }, [bondingEngine.bondings, bondingEngine.bondingsLoading, isSnapshotMode]);

  // ── DEBUG LOGS ───────────────────────────────────────────────────────────────
  // (Snapshot debug logging removed — was causing console noise)

  // ── AUTO-LOAD: Phase 6 Lazy Hydration — two-phase load ──────────────────────
  //
  // PHASE 1 (Fast — runs immediately when snapshot cache hits):
  //   Hydrate from latestSnapshot.chartState as soon as it resolves.
  //   staleTime=60s → snapshot data is almost always already cached.
  //   User sees the chart instantly without waiting for event replay.
  //
  // PHASE 2 (Progressive upgrade — runs when derivedClinical resolves):
  //   If events exist since the snapshot, upgrade the chart state with the
  //   server-replayed derivedState. User sees any post-snapshot mutations applied.
  //   No re-render cost if eventCount = 0 (skip upgrade).
  //
  // For zero-snapshot cases (events only): Phase 2 handles the full hydration.

  const latestLoadedRef     = useRef<string | null>(null);
  const derivedUpgradedRef  = useRef<boolean>(false);
  // Phase 4: tracks the version of the snapshot we loaded — sent to backend as
  // expectedVersion to detect concurrent writes before committing.
  const expectedVersionRef  = useRef<number | null>(null);
  // Tracks whether notes have been seeded from the active visit (prevents overwrite on re-render)
  const notesInitializedRef = useRef<boolean>(false);

  // ── Phase 3: Init notes from active visit ────────────────────────────────────
  // Runs once when the active visit first loads. Seeds the notes textarea.
  // Prefers server value; falls back to localStorage draft (crash recovery).
  useEffect(() => {
    if (!activeVisit || notesInitializedRef.current) return;
    notesInitializedRef.current = true;

    // Try the server value first
    const serverNotes = activeVisit.notes ?? '';

    // Check localStorage for a crash-recovery draft that may be newer
    let draft = '';
    try {
      const raw = localStorage.getItem(`visit_notes_draft_${activeVisit._id}`);
      if (raw) {
        draft = raw;
        // Draft served — clean up so it doesn't re-appear on next load
        localStorage.removeItem(`visit_notes_draft_${activeVisit._id}`);
      }
    } catch (_) {}

    // Use whichever is longer (crash draft is typically more recent than server)
    setNotes(draft.length > serverNotes.length ? draft : serverNotes);
  }, [activeVisit]);

  // ── Phase 3: Debounced notes autosave ────────────────────────────────────────
  // Persists notes to the backend 2 seconds after the user stops typing.
  // Uses fire-and-forget mutation (useUpdateVisitNotes) — never blocks the UI.
  useEffect(() => {
    if (!notesInitializedRef.current) return;
    const visitId = activeVisitRef.current?._id;
    if (!visitId) return;
    const handle = setTimeout(() => {
      updateVisitNotesMutation.mutate({ visitId, notes });
    }, 2000);
    return () => clearTimeout(handle);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 3: Chart state localStorage draft (crash recovery) ─────────────────
  // Saves the full chart state on every change. Restored on mount if no snapshot.
  // Cleared when a snapshot is successfully saved.
  useEffect(() => {
    if (!effectiveCaseId) return;
    try {
      localStorage.setItem(
        `chart_draft_${effectiveCaseId}`,
        JSON.stringify({ savedAt: Date.now(), chartState: normalizeChartState(chartState) })
      );
    } catch (_) {
      // Storage quota — degrade silently
    }
  }, [chartState, effectiveCaseId]);

  // ── Phase 3: beforeunload — save notes draft to localStorage ─────────────────
  // Safety net for browser crashes / tab closes between debounce cycles.
  // The debounced autosave handles normal usage; this catches the edge case.
  useEffect(() => {
    const saveNotesOnExit = () => {
      const visitId = activeVisitRef.current?._id;
      if (!visitId || !notes) return;
      try {
        localStorage.setItem(`visit_notes_draft_${visitId}`, notes);
      } catch (_) {}
    };
    window.addEventListener('beforeunload', saveNotesOnExit);
    return () => window.removeEventListener('beforeunload', saveNotesOnExit);
  }, [notes]);

  // ── Phase 4: Heartbeat — keep soft lock alive ─────────────────────────────
  // Fires every 30 seconds while a visit is active. Fire-and-forget.
  // If the user's tab is closed/crashed, heartbeat stops → lock expires in 2 min.
  useEffect(() => {
    const visitId = activeVisit?._id;
    if (!visitId) return;
    const interval = setInterval(() => {
      heartbeatMutation.mutate(visitId);
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeVisit?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 4 / P2-2: Multi-tab detection (centralized via useCaseTabChannel) ──
  // Warns when the same case is open in another tab. Soft protection only.
  // Channel lifecycle (open/announce/close) is managed inside the hook.
  useCaseTabChannel(effectiveCaseId);

  // ── PHASE 1: Fast snapshot hydration ────────────────────────────────────────
  useEffect(() => {
    if (latestLoading) return;
    if (latestLoadedRef.current) return; // Already loaded — do not re-hydrate
    // P0-5: Hydration lock — never overwrite active unsaved edits from server
    const lockHydration = isSnapshotMode || isHydrationLocked();
    if (lockHydration) return;

    if (!latestSnapshot) {
      // No snapshot yet — mark as 'none' so Phase 2 can handle event-only cases.
      // P0-6: If a localStorage draft exists, surface it via DraftRecoveryModal.
      // NEVER silently hydrate from localStorage — user MUST confirm before state is applied.
      if (effectiveCaseId) {
        try {
          const raw = localStorage.getItem(`chart_draft_${effectiveCaseId}`);
          if (raw) {
            const draft = JSON.parse(raw) as { savedAt: number; chartState: typeof chartState };
            const ageMs = Date.now() - (draft.savedAt ?? 0);
            if (ageMs < 24 * 60 * 60 * 1000 && draft.chartState) {
              // Surface to user — do NOT apply automatically
              setLocalStorageDraft(draft);
              setShowLocalStorageDraftRecovery(true);
            }
          }
        } catch (_) {}
      }
      latestLoadedRef.current = 'none';
      return;
    }

    const cs = latestSnapshot.chartState as Snapshot['chartState'];
    if (!cs) return;

    // Immediate hydration from snapshot.chartState (fast — no event replay)
    latestLoadedRef.current    = latestSnapshot.id;
    // Phase 4: record version for optimistic concurrency check on save
    expectedVersionRef.current = (latestSnapshot as any).version ?? null;
    resetUndoHistory();
    dispatch({
      type: 'HYDRATE_SNAPSHOT',
      payload: {
        upperTeeth:    cs.upperTeeth   ?? UPPER_TEETH,
        lowerTeeth:    cs.lowerTeeth   ?? LOWER_TEETH,
        elastics:      cs.elastics     ?? [],
        appliances:    cs.appliances   ?? [],
        iprMarkers:    cs.iprMarkers   ?? [],
        spaceMarkers:  cs.spaceMarkers ?? [],
        accessories:   cs.accessories  ?? [],
        powerChains:   cs.powerChains  ?? [],
        ligatures:     cs.ligatures    ?? [],
        upperArchwire: cs.upperArchwire ?? undefined,
        lowerArchwire: cs.lowerArchwire ?? undefined,
        // NOTE: Miniscrews come from DB TADs (hydration effect) — not restored here.
      },
    });
    setActiveSnapshotId(latestSnapshot.id);
    logAction(`[Fast] Restored: ${latestSnapshot.name || 'Snapshot v' + latestSnapshot.version}`);
  }, [latestSnapshot, latestLoading]);

  // ── PHASE 2: Progressive derived-state upgrade ───────────────────────────────
  useEffect(() => {
    if (derivedLoading) return;
    if (derivedUpgradedRef.current) return; // Only upgrade once per session
    // P0-5: Hydration lock — never overwrite active unsaved edits from server
    const lockHydration = isSnapshotMode || isHydrationLocked();
    if (lockHydration) return;

    // ── Case A: No snapshot — event-only hydration (Phase 5) ──────────────────
    if (latestLoadedRef.current === 'none') {
      const hasEventDerivedState = (
        derivedClinical?.fromZero &&
        derivedClinical.derivedState &&
        Object.keys(derivedClinical.derivedState).length > 0 &&
        derivedClinical.eventCount > 0
      );
      if (hasEventDerivedState) {
        const cs = derivedClinical!.derivedState as Snapshot['chartState'];
        latestLoadedRef.current = 'zero-replay';
        derivedUpgradedRef.current = true;
        resetUndoHistory();
        dispatch({
          type: 'HYDRATE_SNAPSHOT',
          payload: {
            upperTeeth:    cs.upperTeeth   ?? UPPER_TEETH,
            lowerTeeth:    cs.lowerTeeth   ?? LOWER_TEETH,
            elastics:      cs.elastics     ?? [],
            appliances:    cs.appliances   ?? [],
            iprMarkers:    cs.iprMarkers   ?? [],
            spaceMarkers:  cs.spaceMarkers ?? [],
            accessories:   cs.accessories  ?? [],
            powerChains:   cs.powerChains  ?? [],
            ligatures:     cs.ligatures    ?? [],
            upperArchwire: cs.upperArchwire ?? undefined,
            lowerArchwire: cs.lowerArchwire ?? undefined,
          },
        });
        logAction(`Loaded from events (${derivedClinical!.eventCount} events, no snapshot)`);
      } else {
        // Genuinely new case — no events, no snapshots
        derivedUpgradedRef.current = true;
      }
      return;
    }

    // ── Case B: Snapshot already loaded — upgrade with post-snapshot events ────
    if (!latestLoadedRef.current) return; // Phase 1 hasn't run yet — wait
    if (!derivedClinical?.derivedState) return;

    derivedUpgradedRef.current = true;

    // No events to replay — Phase 1 chartState is already correct
    if ((derivedClinical.eventCount ?? 0) === 0) return;

    // Apply derived state (snapshot.chartState + replayed events)
    const cs        = derivedClinical.derivedState as Snapshot['chartState'];
    const fromZero  = derivedClinical.fromZero ?? false;
    const eventCount = derivedClinical.eventCount ?? 0;

    dispatch({
      type: 'HYDRATE_SNAPSHOT',
      payload: {
        upperTeeth:    cs.upperTeeth   ?? UPPER_TEETH,
        lowerTeeth:    cs.lowerTeeth   ?? LOWER_TEETH,
        elastics:      cs.elastics     ?? [],
        appliances:    cs.appliances   ?? [],
        iprMarkers:    cs.iprMarkers   ?? [],
        spaceMarkers:  cs.spaceMarkers ?? [],
        accessories:   cs.accessories  ?? [],
        powerChains:   cs.powerChains  ?? [],
        ligatures:     cs.ligatures    ?? [],
        upperArchwire: cs.upperArchwire ?? undefined,
        lowerArchwire: cs.lowerArchwire ?? undefined,
      },
    });
    const source = fromZero ? 'zero replay' : `+${eventCount} events`;
    logAction(`[Upgraded] ${latestSnapshot?.name || 'snapshot'} [${source}]`);
  }, [derivedClinical, derivedLoading, latestSnapshot]);

  // ── Phase 5: Time Travel — hydrate chart with state at specific event ────────
  // When the user selects an event in ClinicalTimelinePanel, useStateAtEvent fetches
  // the deterministic replay result and we hydrate the chart with it.
  // The chart enters read-only mode — all mutations are blocked until exit.
  useEffect(() => {
    if (!timeTravelState?.derivedState) return;
    const cs = timeTravelState.derivedState as Snapshot['chartState'];
    dispatch({
      type: 'HYDRATE_SNAPSHOT',
      payload: {
        upperTeeth:    cs.upperTeeth    ?? UPPER_TEETH,
        lowerTeeth:    cs.lowerTeeth    ?? LOWER_TEETH,
        elastics:      cs.elastics      ?? [],
        appliances:    cs.appliances    ?? [],
        iprMarkers:    cs.iprMarkers    ?? [],
        spaceMarkers:  cs.spaceMarkers  ?? [],
        accessories:   cs.accessories   ?? [],
        powerChains:   cs.powerChains   ?? [],
        ligatures:     cs.ligatures     ?? [],
        upperArchwire: cs.upperArchwire ?? undefined,
        lowerArchwire: cs.lowerArchwire ?? undefined,
      },
    });
  }, [timeTravelState]);

  // ── SNAPSHOT RESET: Clear chart when all snapshots are deleted ───────────────
  // Tracks when snapshots transition from having data to being empty and resets
  // the chart state to default, clearing any visual artifacts from deleted data.
  const prevSnapshotsLengthRef = useRef<number>(-1);
  
  /**
   * resetChartState — Clears all clinical chart state to default.
   * Called when all snapshots are deleted to prevent ghost data.
   */
  const resetChartState = useCallback(() => {
    resetUndoHistory();
    dispatch({ type: 'RESET_CHART' });
    setNotes('');
    setActions([]);
    setActiveSnapshotId(null);
    setIsSnapshotMode(false);
    setPreviewSnapshot(null);
    setCanUndoRestore(false);
    // Phase 3+4: reset all session refs
    notesInitializedRef.current  = false;
    derivedUpgradedRef.current   = false;
    latestLoadedRef.current      = null;
    expectedVersionRef.current   = null;
    setRestoreStack([]);
    latestLoadedRef.current    = null;
    derivedUpgradedRef.current = false;
  }, []);

  useEffect(() => {
    // Skip on initial mount (prevSnapshotsLengthRef starts at -1)
    if (prevSnapshotsLengthRef.current === -1) {
      prevSnapshotsLengthRef.current = snapshots.length;
      return;
    }

    // Detect transition: had snapshots → now empty (likely from deletion)
    const hadSnapshots = prevSnapshotsLengthRef.current > 0;
    const nowEmpty = snapshots.length === 0;

    if (hadSnapshots && nowEmpty && !snapshotsLoading) {
      console.log('[SnapshotEditor] All snapshots deleted — resetting chart');
      resetChartState();
      toast.warning('All snapshots deleted. Chart reset to empty state.');
    }

    prevSnapshotsLengthRef.current = snapshots.length;
  }, [snapshots, snapshotsLoading, resetChartState]);

  // ── PART 5 — SNAPSHOT ↔ TODO SYNC ───────────────────────────────────────────
  // When the active snapshot changes (new save or restore), invalidate the todo
  // cache so the sidebar reflects the latest state for the current visit context.
  useEffect(() => {
    if (activeSnapshotId && effectiveCaseId) {
      queryClient.invalidateQueries({ queryKey: TODO_KEYS.all(effectiveCaseId) });
    }
  }, [activeSnapshotId, effectiveCaseId, queryClient]);

  // ── SEQUENCE ENGINE V1.5 — Clinical guidance layer (read-only) ───────────────

  // sequenceProgress.currentStep comes from the snapshot once persisted.
  // Before a snapshot exists, defaults to step 0 (start of sequence).
  const [showSequenceGuidance, setShowSequenceGuidance] = useState(true);
  const [localSequenceStep, setLocalSequenceStep] = useState(0);

const sequenceEngine = useSequenceEngineForCase(
    effectiveCaseId,
    appointment.snapshotId,    // WorkflowSnapshot ID — undefined until saved
    localSequenceStep,
  );

  /**
   * Dimming priority: clinical filter > ortho filter.
   * Whichever is active (locked or hover) dims non-matching teeth.
   * Only one filter system is active at a time.
   */
  const dimmedToothIds = (() => {
    // Clinical filter has priority
    const clinicalFilter = activeStatusFilter ?? hoverStatusFilter;
    if (clinicalFilter) {
      return computeDimmedIds(upperTeeth, lowerTeeth, clinicalFilter);
    }
    // Ortho filter next
    const orthoFilter = activeOrthoFilter ?? hoverOrthoFilter;
    if (orthoFilter) {
      return computeOrthoDimmedIds(
        upperTeeth, lowerTeeth,
        upperArchwire, lowerArchwire,
        powerChains, elastics, appliances, miniscrews, iprMarkers,
        orthoFilter,
      );
    }
    return [];
  })();

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const lastClickedToothId = useRef<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── SIDEBAR WIDTH (resizable drag) ───────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(320);

  // ── RIGHT PANEL: Clinical TODOs ───────────────────────────────────────────
  const [showTodoPanel, setShowTodoPanel] = useState(false);
  // Visit-level clinical phase (non-enforcing suggestion context)
  const [clinicalPhase, setClinicalPhase] = useState<TodoClinicalPhase | null>(null);
  const [suggestedPhase, setSuggestedPhase] = useState<TodoClinicalPhase | null>(null);
  const [phaseHintDismissed, setPhaseHintDismissed] = useState(false);
  // Chart-derived suggestions (shown in TodoSidebar before user accepts)
  const [chartSuggestions, setChartSuggestions] = useState<Array<Omit<CreateTodoPayload, 'caseId' | 'patientId'>>>([]);
  // Action → TODO suggestion modal (shown after alignment applied to bracketed tooth)
  const [pendingTodoSuggestion, setPendingTodoSuggestion] = useState<{
    toothId:     number;
    alignment:   import('../types').AlignmentValue;
    suggestions: TodoSuggestionItem[];
  } | null>(null);
  // Debond workflow modal state
  const [debondModal, setDebondModal] = useState<{ toothId: number } | null>(null);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      // Use the outermost container for fullscreen
      const el = fullscreenRef.current || document.documentElement;
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Listen for fullscreen change (user may press Escape)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);


  // ─── DEBUG LOGS REMOVED (production cleanup) ───



  // ── Global (patient-level) alerts — not stored per-tooth ───────────────
  const [globalAlerts, setGlobalAlerts] = useState<Set<AlertValue>>(new Set());

  const toggleGlobalAlert = (value: AlertValue) => {
    setGlobalAlerts(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
    logAction(`Patient alert toggled: ${value}`);
  };

  const hasActiveAlerts = useMemo(() => {
    const hasToothAlerts = [...upperTeeth, ...lowerTeeth].some(t => (t.clinicalAlerts ?? []).length > 0);
    return hasToothAlerts || globalAlerts.size > 0;
  }, [upperTeeth, lowerTeeth, globalAlerts]);

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
  /**
   * saveToHistory — captures current chartState into historyRef before a mutation.
   * Call this BEFORE dispatching any clinical action that should be undoable.
   * TADs (miniscrews) are intentionally NOT excluded here — but the undo restore
   * via HYDRATE_SNAPSHOT will skip them (DB hydration is the SSOT for TADs).
   */
  // saveToHistory and undo are provided by useUndoHistory (see declaration above).
  // They are bound to chartStateRef, dispatch, lockHydration, and removeTadFromDb.

  // Wrap undo to also append an action log entry (local UX concern, not part of the hook)
  const undoWithLog = () => {
    undo();
    setActions(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      type: 'undo' as const,
      description: 'Undid last action',
      timestamp: Date.now(),
      tooth: '',
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

  const handleToothClick = (id: number, shiftKey: boolean, ctrlKey: boolean) => {
    setContextMenu(null);

    // Shift+Click range selection
    if (shiftKey && lastClickedToothId.current !== null) {
      const allIds = [...UPPER_TOOTH_IDS, ...LOWER_TOOTH_IDS];
      const lastIdx = allIds.indexOf(lastClickedToothId.current);
      const currIdx = allIds.indexOf(id);
      if (lastIdx >= 0 && currIdx >= 0) {
        const from = Math.min(lastIdx, currIdx);
        const to = Math.max(lastIdx, currIdx);
        // Only range-select within the same arch
        const rangeIds = allIds.slice(from, to + 1);
        const allUpper = rangeIds.every(tid => UPPER_TOOTH_IDS.includes(tid));
        const allLower = rangeIds.every(tid => LOWER_TOOTH_IDS.includes(tid));
        if (allUpper || allLower) {
          setSelectedToothIds(prev => {
            const merged = new Set(prev);
            rangeIds.forEach(tid => merged.add(tid));
            return Array.from(merged);
          });
          lastClickedToothId.current = id;
          return;
        }
      }
    }

    // Ctrl+Click toggle individual tooth in/out of selection
    if (ctrlKey) {
      lastClickedToothId.current = id;
      setSelectedToothIds(prev =>
        prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
      );
      return;
    }

    // Normal click — exclusive select (clear others)
    lastClickedToothId.current = id;
    setSelectedToothIds(prev => 
      prev.length === 1 && prev[0] === id ? [] : [id]
    );
  };

  const handleToothContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Close info popup if open
    setInfoPopup(null);

    const tooth = upperTeeth.find(t => t.id === id) || lowerTeeth.find(t => t.id === id);
    if (!tooth) return;

    // Position safety — keep popup inside viewport
    const W = 256, H = 460;
    const safeX = e.clientX + W > window.innerWidth  ? e.clientX - W : e.clientX;
    const safeY = e.clientY + H > window.innerHeight ? e.clientY - H : e.clientY + 8;

    setActiveTooth(tooth);
    setActionPopup({ x: safeX, y: safeY });
  };

  const handleToothDoubleClick = (id: number) => {
    // Close action popup if open
    setActionPopup(null);

    const tooth = upperTeeth.find(t => t.id === id) || lowerTeeth.find(t => t.id === id);
    if (!tooth) return;

    // Position info popup to the right of the tooth, clamped to viewport
    const W = 288, H = 480;
    // Use last mouse position approximation — we need screen coords.
    // We'll position near center-right of screen as a safe fallback,
    // but ideally derive from chartContainerRef:
    const rect = chartContainerRef.current?.getBoundingClientRect();
    const baseX = rect ? rect.left + rect.width * 0.62 : window.innerWidth  * 0.55;
    const baseY = rect ? rect.top  + rect.height * 0.25 : window.innerHeight * 0.2;
    const safeX = baseX + W > window.innerWidth  ? baseX - W - 16 : baseX;
    const safeY = baseY + H > window.innerHeight ? window.innerHeight - H - 16 : baseY;

    setActiveTooth(tooth);
    setInfoPopup({ x: safeX, y: safeY });
  };

  const updateToothStatus = (status: any) => {
    if (selectedToothIds.length === 0) return;
    const { upperTeeth: ut, lowerTeeth: lt } = chartStateRef.current;
    const allTeeth = [...ut, ...lt];
    dispatchClinicalAction({
      action: { type: 'TOOTH_STATUS_CHANGED', payload: { status, teeth: selectedToothIds }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        // Per-tooth granular dispatch — one SET_TOOTH_STATUS per selected tooth
        selectedToothIds.forEach(toothId => {
          const tooth = allTeeth.find(t => t.id === toothId);
          if (!tooth) return;
          let finalStatus = status;
          if (tooth.type === 'molar' && status === 'bracket') finalStatus = 'molar-tube';
          else if (tooth.type !== 'molar' && (status === 'band' || status === 'molar-tube')) finalStatus = 'bracket';
          dispatch({ type: 'SET_TOOTH_STATUS', payload: { toothId, status: finalStatus } });
        });
        logAction(`Changed status to ${status}`, selectedToothIds[0]);
        setSelectedToothIds([]);
      },
    });
  };

  // ── Clinical Tagging Engine — canonical bulk-updater ────────────────────────

  /**
   * updateSelectedTeeth — per-tooth granular callback dispatcher.
   * Applies `callback` to each selected tooth and dispatches the result
   * as a granular single-tooth action produced by `toAction`.
   *
   * NOTE: saveToHistory() is called by EACH caller (applyDiagnosis, etc.)
   * before invoking this helper, so history is captured at the correct call site.
   */
  const updateSelectedTeeth = useCallback(
    (callback: (tooth: ToothData) => ToothData, toAction: (tooth: ToothData, updated: ToothData) => ChartAction) => {
      const { upperTeeth: ut, lowerTeeth: lt } = chartStateRef.current;
      const allTeeth = [...ut, ...lt];
      selectedToothIds.forEach(toothId => {
        const tooth = allTeeth.find(t => t.id === toothId);
        if (!tooth) return;
        const updated = callback(tooth);
        dispatch(toAction(tooth, updated));
      });
    },
    [selectedToothIds],
  );

  /** Returns true if any selected tooth is blocked (extracted / missing diagnosis) */
  const isBlockedByDiagnosis = () =>
    selectedToothIds.some(id => {
      const t = [...upperTeeth, ...lowerTeeth].find(x => x.id === id);
      return t?.clinicalStatus?.diagnosis === 'extracted' ||
             t?.clinicalStatus?.diagnosis === 'missing';
    });

  const applyDiagnosis = (value: DiagnosisValue & string) => {
    if (selectedToothIds.length === 0) return;
    saveToHistory();
    const isClear = value === 'extracted' || value === 'missing';
    updateSelectedTeeth(
      tooth => ({
        ...tooth,
        clinicalStatus: {
          ...(tooth.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
          diagnosis: value,
          ...(isClear ? { alignment: null, condition: null } : {}),
        },
        ...(isClear ? { clinicalAlerts: [] } : {}),
      }),
      (_tooth, updated) => ({
        type: 'SET_TOOTH_DIAGNOSIS' as const,
        payload: {
          toothId: updated.id,
          diagnosis: value,
          clearAlignment: isClear,
          clearCondition: isClear,
          clearAlerts: isClear,
        },
      }),
    );
    logAction(`Diagnosis: ${value}`, selectedToothIds[0]);
    setSelectedToothIds([]);
  };

  const applyAlignment = (value: AlignmentValue & string) => {
    if (selectedToothIds.length === 0) return;
    if (isBlockedByDiagnosis()) return; // RULE 1
    saveToHistory();
    updateSelectedTeeth(
      tooth => ({
        ...tooth,
        clinicalStatus: {
          ...(tooth.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
          alignment: value,
        },
      }),
      (_tooth, updated) => ({
        type: 'SET_TOOTH_ALIGNMENT' as const,
        payload: { toothId: updated.id, alignment: value },
      }),
    );
    logAction(`Alignment: ${value}`, selectedToothIds[0]);

    // ── Action → TODO auto-suggestion (PART 1) ────────────────────────────────
    // Only when a single bracketed tooth is selected — multi-select skips (ambiguous).
    if (selectedToothIds.length === 1 && !pendingTodoSuggestion) {
      const tooth = [...upperTeeth, ...lowerTeeth].find(t => t.id === selectedToothIds[0]);
      if (tooth) {
        const suggestions = getAlignmentSuggestions(tooth, value as import('../types').AlignmentValue);
        if (suggestions.length > 0) {
          setPendingTodoSuggestion({ toothId: tooth.id, alignment: value as import('../types').AlignmentValue, suggestions });
        }
      }
    }

    setSelectedToothIds([]);
  };

  const applyCondition = (value: ConditionValue & string) => {
    if (selectedToothIds.length === 0) return;
    if (isBlockedByDiagnosis()) return; // RULE 1
    saveToHistory();
    updateSelectedTeeth(
      tooth => ({
        ...tooth,
        clinicalStatus: {
          ...(tooth.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
          condition: value,
        },
      }),
      (_tooth, updated) => ({
        type: 'SET_TOOTH_CONDITION' as const,
        payload: { toothId: updated.id, condition: value },
      }),
    );
    logAction(`Condition: ${value}`, selectedToothIds[0]);
    setSelectedToothIds([]);
  };

  const toggleAlert = (value: AlertValue) => {
    if (selectedToothIds.length === 0) return;
    if (isBlockedByDiagnosis()) return; // RULE 2
    saveToHistory();
    updateSelectedTeeth(
      tooth => {
        const existing = tooth.clinicalAlerts ?? [];
        return {
          ...tooth,
          clinicalAlerts: existing.includes(value)
            ? existing.filter(a => a !== value)
            : [...existing, value],
        };
      },
      (_tooth, updated) => ({
        type: 'TOGGLE_TOOTH_ALERT' as const,
        payload: { toothId: updated.id, alert: value },
      }),
    );
    logAction(`Alert toggled: ${value}`, selectedToothIds[0]);
  };

  const clearClinicalData = () => {
    if (selectedToothIds.length === 0) return;
    saveToHistory();
    updateSelectedTeeth(
      tooth => ({
        ...tooth,
        clinicalStatus: { diagnosis: null, alignment: null, condition: null },
        clinicalAlerts: [],
      }),
      (_tooth, updated) => ({
        type: 'CLEAR_TOOTH' as const,
        payload: { toothId: updated.id },
      }),
    );
    logAction('Clinical data cleared', selectedToothIds[0]);
    setSelectedToothIds([]);
  };

  // ── SINGLE-TOOTH HANDLERS (used by ToothActionPopup) ─────────────────────
  /** Update a single tooth (by ID) without touching selectedToothIds */
  const updateSingleTooth = useCallback(
    (toothId: number, callback: (t: ToothData) => ToothData) => {
      // NOTE: saveToHistory() is called at each call site before invoking this helper.
      // Dispatches UPDATE_TEETH for the callback-based path (singleBracketApply / handleDebondAddTodo).
      // These produce full tooth object updates that don't fit cleanly into a single granular type.
      const { upperTeeth: ut, lowerTeeth: lt } = chartStateRef.current;
      dispatch({
        type: 'UPDATE_TEETH',
        payload: {
          upper: ut.map(t => t.id === toothId ? callback(t) : t),
          lower: lt.map(t => t.id === toothId ? callback(t) : t),
        },
      });
    },
    [],
  );

  /**
   * Called from ToothActionPopup via BracketActionPanel.
   * Uses the config that came OUT of the panel (not the stale parent state)
   * so the popup's selections are always honoured.
   */
  const singleBracketApply = (toothId: number, bracketType: AppliedBracketType, cfg: BracketConfig) => {
    saveToHistory();
    updateSingleTooth(toothId, t => {
      // Auto-correct type if tooth arch type mismatches
      let finalType: ToothStatus = bracketType;
      if (t.type === 'molar' && bracketType === 'bracket') finalType = 'molar-tube';
      if (t.type !== 'molar' && (bracketType === 'band' || bracketType === 'molar-tube')) finalType = 'bracket';

      return {
        ...t,
        status: (cfg.action === 'Repositioning' ? 'repositioning' : finalType) as ToothStatus,
        prescription: cfg.prescription,
        slotSize: cfg.slotSize,
        brand: cfg.brand,
        bondingOption: cfg.bondingOption,
        bondingHeight: cfg.bondingOption === 'custom' && cfg.bondingHeight
          ? parseFloat(cfg.bondingHeight)
          : undefined,
        prescriptionValues: getPrescription(cfg.prescription as any, t.id as any),
      };
    });
    // Keep parent state in sync so toolbar stays consistent after popup use
    setSelectedBracketAction(cfg.action);
    setSelectedPrescription(cfg.prescription);
    setSelectedSlotSize(cfg.slotSize);
    setSelectedBondingOption(cfg.bondingOption);
    setSelectedBondingHeight(cfg.bondingHeight);
    setSelectedBrand(cfg.brand as any);
    logAction(`${cfg.action} ${bracketType}: ${cfg.prescription} ${cfg.slotSize} (${cfg.brand})`, toothId);
  };

  const singleRemoveBracket = (toothId: number) => {
    saveToHistory();
    updateSingleTooth(toothId, t => ({ ...t, status: 'healthy' as ToothStatus }));
    logAction(`Removed bracket`, toothId);
  };

  const singleDiagnosis = (toothId: number, value: DiagnosisValue & string) => {
    saveToHistory();
    updateSingleTooth(toothId, t => ({
      ...t,
      clinicalStatus: {
        ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
        diagnosis: value,
        ...(value === 'extracted' || value === 'missing' ? { alignment: null, condition: null } : {}),
      },
      ...(value === 'extracted' || value === 'missing' ? { clinicalAlerts: [] } : {}),
    }));
    logAction(`Diagnosis: ${value}`, toothId);
    // Refresh activeTooth so the popup re-renders with correct state
    setActiveTooth(prev =>
      prev?.id === toothId
        ? { ...prev, clinicalStatus: { ...(prev.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }), diagnosis: value } }
        : prev
    );
  };

  const singleAlignment = (toothId: number, value: AlignmentValue & string) => {
    saveToHistory();
    updateSingleTooth(toothId, t => ({
      ...t,
      clinicalStatus: {
        ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
        alignment: value,
      },
    }));
    logAction(`Alignment: ${value}`, toothId);

    // ── Action → TODO auto-suggestion (PART 1) ────────────────────────────────
    if (!pendingTodoSuggestion) {
      const tooth = [...upperTeeth, ...lowerTeeth].find(t => t.id === toothId);
      if (tooth) {
        const suggestions = getAlignmentSuggestions(tooth, value as import('../types').AlignmentValue);
        if (suggestions.length > 0) {
          setPendingTodoSuggestion({ toothId, alignment: value as import('../types').AlignmentValue, suggestions });
        }
      }
    }
  };

  const singleToggleAlert = (toothId: number, value: AlertValue) => {
    saveToHistory();
    updateSingleTooth(toothId, t => {
      const existing = t.clinicalAlerts ?? [];
      return {
        ...t,
        clinicalAlerts: existing.includes(value)
          ? existing.filter(a => a !== value)
          : [...existing, value],
      };
    });
    logAction(`Alert toggled: ${value}`, toothId);
  };

  const singleClearClinical = (toothId: number) => {
    saveToHistory();
    updateSingleTooth(toothId, t => ({
      ...t,
      clinicalStatus: { diagnosis: null, alignment: null, condition: null },
      clinicalAlerts: [],
    }));
    logAction('Clinical data cleared', toothId);
  };


  // ── TODO SUGGESTION CONFIRM (PART 2) ─────────────────────────────────────────

  /**
   * Called when the clinician confirms suggestions from TodoSuggestionModal.
   * Deduplicates against existing pending todos (same tooth + type).
   * Batch-creates and auto-opens the TODO panel.
   */
  const handleTodoSuggestionConfirm = (selected: TodoSuggestionItem[], toothId: number) => {
    if (!effectiveCaseId) { setPendingTodoSuggestion(null); return; }

    // Duplicate prevention: skip combos already pending for this tooth
    const deduped = selected.filter(s =>
      !currentTodos.some(t =>
        t.tooth === String(toothId) && t.type === s.type && t.status === 'pending',
      ),
    );

    if (deduped.length === 0) {
      toast.info('All suggested TODOs already exist for this tooth');
      setPendingTodoSuggestion(null);
      return;
    }

    batchCreateTodos.mutate(
      deduped.map(s => ({
        caseId:        effectiveCaseId,
        patientId:     appointment.patientId,
        type:          s.type,
        description:   `${s.description} — tooth ${toothId}`,
        tooth:         String(toothId),
        priority:      s.priority,
        clinicalPhase: clinicalPhase ?? null,
      })),
      {
        onSuccess: () => {
          toast.success(`${deduped.length} TODO${deduped.length > 1 ? 's' : ''} created`);
          setShowTodoPanel(true); // Auto-reveal TODO panel
        },
      },
    );

    setPendingTodoSuggestion(null);
  };

  // ── DEBOND WORKFLOW (PART 3) ──────────────────────────────────────────────────

  /** Opens the DebondModal from the ToothActionPopup "Debonded" button */
  const handleOpenDebondModal = (toothId: number) => {
    setActionPopup(null); // close the right-click popup first
    setDebondModal({ toothId });
  };

  /**
   * "Rebond Now" path — bracket physically re-placed this visit.
   * Visual state stays as bracket. DB records the rebond event.
   * ROUTED THROUGH DISPATCHER (F-07) with rollback logic (F-08).
   */
  const handleDebondRebondNow = () => {
    if (!debondModal) return;
    const { toothId } = debondModal;
    logAction(`Debond → rebonded immediately: tooth ${toothId}`, toothId);

    // Record in DB via debond + immediate re-bond (backend handles REBONDED lifecycle)
    if (effectiveCaseId) {
      const bondingRecord = bondingEngine.bondings.find(b => b.tooth === toothId && b.status === 'ACTIVE');
      if (bondingRecord?._id) {
        // Capture pre-dispatch state for rollback (F-08)
        const previousState = chartStateRef.current;

        dispatchClinicalEvent(
          {
            type: 'BRACKET_DEBONDED',
            payload: {
              toothId,
              bondingId: bondingRecord._id,
              reason: 'rebond',
              notes: 'Rebonded immediately same visit'
            },
          },
          {
            getState: () => chartStateRef.current,
            dispatch,
            logAction,
            caseId: effectiveCaseId,
            onCommit: async (event) => {
              try {
                await debondMutation.mutateAsync({
                  bondingId: bondingRecord._id,
                  payload: {
                    reason: event.payload.reason as string,
                    notes: event.payload.notes as string
                  },
                });
              } catch (err) {
                // Rollback: restore pre-mutation state (F-08)
                dispatch({ type: 'HYDRATE_SNAPSHOT', payload: { chartState: previousState } });
                console.error('[Debond] DB write failed, state rolled back:', err);
                toast.error('Debond failed — changes reverted');
              }
            },
          },
        );
      }
    }

    setDebondModal(null);
    toast.success(`Tooth ${toothId} rebonded`);
  };

  /**
   * "Add TODO Reminder" path — bracket gone, schedule rebond for next visit.
   * Removes bracket visually, records debond in DB, creates BOND_BRACKET todo.
   * ROUTED THROUGH DISPATCHER (F-07) with rollback logic (F-08).
   */
  const handleDebondAddTodo = () => {
    if (!debondModal || !effectiveCaseId) return;
    const { toothId } = debondModal;

    // 1. Remove bracket visually
    saveToHistory();
    updateSingleTooth(toothId, t => ({ ...t, status: 'healthy' as import('../types').ToothStatus }));
    logAction(`Debonded — rebond scheduled as TODO: tooth ${toothId}`, toothId);

    // 2. Record debond in DB via dispatcher (F-07)
    const bondingRecord = bondingEngine.bondings.find(b => b.tooth === toothId && b.status === 'ACTIVE');
    if (bondingRecord?._id) {
      // Capture pre-dispatch state for rollback (F-08)
      const previousState = chartStateRef.current;

      dispatchClinicalEvent(
        {
          type: 'BRACKET_DEBONDED',
          payload: {
            toothId,
            bondingId: bondingRecord._id,
            reason: 'bracket_fell_off',
            notes: 'Scheduled for rebond next visit'
          },
        },
        {
          getState: () => chartStateRef.current,
          dispatch,
          logAction,
          caseId: effectiveCaseId,
          onCommit: async (event) => {
            try {
              await debondMutation.mutateAsync({
                bondingId: bondingRecord._id,
                payload: {
                  reason: event.payload.reason as string,
                  notes: event.payload.notes as string
                },
              });
            } catch (err) {
              // Rollback: restore pre-mutation state (F-08)
              dispatch({ type: 'HYDRATE_SNAPSHOT', payload: { chartState: previousState } });
              console.error('[Debond] DB write failed, state rolled back:', err);
              toast.error('Debond failed — changes reverted');
            }
          },
        },
      );
    }

    // 3. Create BOND_BRACKET todo (duplicate check: skip if already pending for this tooth)
    const alreadyExists = currentTodos.some(
      t => t.tooth === String(toothId) && t.type === 'BOND_BRACKET' && t.status === 'pending',
    );
    if (!alreadyExists) {
      batchCreateTodos.mutate([{
        caseId:        effectiveCaseId,
        patientId:     appointment.patientId,
        type:          'BOND_BRACKET',
        description:   `Rebond bracket on tooth ${toothId}`,
        tooth:         String(toothId),
        priority:      'high',
        clinicalPhase: clinicalPhase ?? null,
      }]);
    }

    // 4. Open TODO panel so the clinician sees the created item
    setShowTodoPanel(true);
    setDebondModal(null);
    toast.info(`Tooth ${toothId} debonded — rebond TODO created`);
  };

  const bondBrackets = (applianceType: 'bracket' | 'band' | 'molar-tube' = 'bracket') => {
    if (selectedToothIds.length === 0) return;

    const applyBonding = (teeth: ToothData[]) => teeth.map(t => {
      if (!selectedToothIds.includes(t.id)) return t;
      let finalApplianceType = applianceType;
      if (t.type === 'molar' && applianceType === 'bracket') finalApplianceType = 'molar-tube';
      else if (t.type !== 'molar' && (applianceType === 'band' || applianceType === 'molar-tube')) finalApplianceType = 'bracket';
      return {
        ...t,
        status: (selectedBracketAction === 'Repositioning' ? 'repositioning' : finalApplianceType) as ToothStatus,
        prescription: selectedPrescription,
        slotSize: selectedSlotSize,
        brand: selectedBrand,
        bondingHeight: selectedBondingOption === 'custom' ? (selectedBondingHeight ? parseFloat(selectedBondingHeight) : undefined) : undefined,
        bondingOption: selectedBondingOption,
        prescriptionValues: getPrescription(selectedPrescription as any, t.id as any),
      };
    });

    // Build DB payload before dispatch so it captures selected* state at call time
    const bondingType = applianceType === 'bracket' ? 'BRACKET' : applianceType === 'band' ? 'BAND' : 'TUBE';
    const linkedTadIds: string[] = [];
    const dbPayload = (effectiveCaseId && appointment.patientId)
      ? bondingEngine.applyFromOPG(
          effectiveCaseId,
          appointment.patientId,
          selectedToothIds,
          selectedPrescription,
          selectedBondingOption === 'custom' && selectedBondingHeight
            ? parseFloat(selectedBondingHeight)
            : 0,
          'manual',
          undefined,
          linkedTadIds
        )
      : null;

    dispatchClinicalAction({
      action: {
        type: 'BONDING_APPLIED',
        payload: { teeth: selectedToothIds, bracketType: bondingType, prescription: selectedPrescription },
        timestamp: Date.now(),
        source: 'ui',
      },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        // Per-tooth granular dispatch — one SET_TOOTH_BONDING per selected tooth
        const { upperTeeth: ut, lowerTeeth: lt } = chartStateRef.current;
        const allTeeth = [...ut, ...lt];
        selectedToothIds.forEach(toothId => {
          const tooth = allTeeth.find(t => t.id === toothId);
          if (!tooth) return;
          let finalApplianceType = applianceType;
          if (tooth.type === 'molar' && applianceType === 'bracket') finalApplianceType = 'molar-tube';
          else if (tooth.type !== 'molar' && (applianceType === 'band' || applianceType === 'molar-tube')) finalApplianceType = 'bracket';
          const finalStatus = (selectedBracketAction === 'Repositioning' ? 'repositioning' : finalApplianceType) as ToothStatus;
          dispatch({
            type: 'SET_TOOTH_BONDING',
            payload: {
              toothId,
              status: finalStatus,
              prescription: selectedPrescription,
              slotSize: selectedSlotSize,
              brand: selectedBrand,
              bondingHeight: selectedBondingOption === 'custom' ? (selectedBondingHeight ? parseFloat(selectedBondingHeight) : undefined) : undefined,
              bondingOption: selectedBondingOption,
              prescriptionValues: getPrescription(selectedPrescription as any, toothId as any),
            },
          });
        });
        logAction(`${selectedBracketAction} ${applianceType}: ${selectedPrescription} ${selectedSlotSize} (${selectedBrand})${selectedBondingOption === 'marginal-ridges-level' ? ' MR-Level' : selectedBondingOption === 'middle-middle' ? ' Mid-Mid' : selectedBondingHeight ? ` H:${selectedBondingHeight}mm` : ''}`, selectedToothIds[0]);
        setSelectedToothIds([]);
        setActiveActionBarCategory(null);
      },
      onCommit: dbPayload ? async () => {
        // ── Bonding Engine DB Sync ──────────────────────────────────────────
        // Runs after reducer update — UI is already responsive.
        await bondingEngine.applyBonding({ ...dbPayload, type: bondingType }).catch(
          (err: any) => {
            const status = err?.response?.status;
            const msg = err?.response?.data?.error?.message || err?.message || 'Unknown error';
            console.error('[BondingEngine] DB sync FAILED:', { status, msg, fullError: err?.response?.data });
            setErrorModalMessage(`Bonding save failed (${status || 'network'}): ${msg}`);
            setIsErrorModalOpen(true);
          }
        );
      } : undefined,
    });

    if (!effectiveCaseId) {
      console.warn('[BondingEngine] No caseId — bonding will NOT persist to database. Create an orthodontic case first.');
    }
  };
  
const setArchwire = (arch: 'upper' | 'lower') => {
    const toothIds = arch === 'upper' ? UPPER_TOOTH_IDS : LOWER_TOOTH_IDS;
    let fromId = arch === 'upper' ? upperWireFrom : lowerWireFrom;
    let toId = arch === 'upper' ? upperWireTo : lowerWireTo;
    // Ensure fromId comes before toId in the arch array
    const fromIdx = toothIds.indexOf(fromId);
    const toIdx = toothIds.indexOf(toId);
    if (fromIdx > toIdx) {
      [fromId, toId] = [toId, fromId];
    }

    const config: ArchwireConfig = {
      material: selectedArchwireMaterial,
      size: selectedArchwireSize,
      cinched: selectedCinchWire,
      fromToothId: fromId,
      toToothId: toId,
      brand: selectedBrand
    };

    const dispatchOpts = {
      action: {
        type: 'ARCHWIRE_SET' as const,
        payload: {
          arch,
          material: selectedArchwireMaterial,
          size: selectedArchwireSize,
          from: fromId,
          to: toId,
          cinched: selectedCinchWire,
        },
        timestamp: Date.now(),
        source: 'ui' as const,
      },
      getState: () => ({
        upperArchwire,
        lowerArchwire,
      }),
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'SET_ARCHWIRE', payload: { arch, wire: config } });
      },
      onCommit: (effectiveCaseId && appointment.patientId) ? async () => {
        await clinicalActionApi.applyArchwire({
          caseId:    effectiveCaseId,
          patientId: appointment.patientId,
          arch,
          material:  selectedArchwireMaterial,
          size:      selectedArchwireSize,
          brand:     selectedBrand || undefined,
        }).catch((err: any) => console.error('[ClinicalAction] archwire persist failed:', err?.message));
      } : undefined,
      logAction: (desc: string) => logAction(desc),
    };

    const result = dispatchClinicalAction(dispatchOpts);
    if (result.blocked) {
      handleDuplicateBlocked('Archwire Placement', { arch }, dispatchOpts);
      return;
    }

    // ── Phase auto-suggestion from wire material ──────────────────────────
    // Non-enforcing: NiTi → LEVEL_ALIGNMENT, SS/TMA → SPACE_MANAGEMENT
    if (!clinicalPhase && !phaseHintDismissed) {
      const WIRE_PHASE: Record<string, TodoClinicalPhase> = {
        NiTi:          'LEVEL_ALIGNMENT',
        'Copper NiTi': 'LEVEL_ALIGNMENT',
        SS:            'SPACE_MANAGEMENT',
        TMA:           'SPACE_MANAGEMENT',
      };
      const suggestion = WIRE_PHASE[selectedArchwireMaterial] ?? null;
      if (suggestion) setSuggestedPhase(suggestion);
    }
  };

  const removeArchwire = (arch: 'upper' | 'lower') => {
    dispatchClinicalAction({
      action: { type: 'ARCHWIRE_REMOVE', payload: { arch }, timestamp: Date.now(), source: 'ui' },
      getState: () => ({ upperArchwire, lowerArchwire }),
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_ARCHWIRE', payload: { arch } });
        logAction(`Removed ${arch} archwire`);
      },
      // Note: removal is local-only for now — the archwire record in DB is
      // not individually addressable without the actionId from applyArchwire.
      // Phase 4 will wire onCommit using the persisted actionId from chartState.
    });
  };

const addElastic = (type: any, size: ElasticSize) => {
    if (selectedToothIds.length < 2) return;

    const dispatchOpts = {
      action: {
        type: 'ELASTIC_SET' as const,
        payload: {
          teeth: [...selectedToothIds],
          type,
          size,
        },
        timestamp: Date.now(),
        source: 'ui' as const,
      },
      getState: () => ({ elastics }),
      onApply: () => {
        saveToHistory();
        const newElastic: ElasticConnection = {
          id: Math.random().toString(36).substr(2, 9),
          toothIds: [...selectedToothIds],
          type,
          size
        };
        dispatch({ type: 'ADD_ELASTIC', payload: newElastic });
        logAction(`Added ${type} elastic (${size})`);
        setSelectedToothIds([]);
      },
      onCommit: (effectiveCaseId && appointment.patientId && selectedToothIds.length >= 2) ? async () => {
        await clinicalActionApi.applyElastic({
          caseId:    effectiveCaseId,
          patientId: appointment.patientId,
          fromTooth: selectedToothIds[0],
          toTooth:   selectedToothIds[1],
          type,
          size,
        }).catch((err: any) => console.error('[ClinicalAction] elastic persist failed:', err?.message));
      } : undefined,
      logAction: (desc: string) => logAction(desc),
    };

    const result = dispatchClinicalAction(dispatchOpts);
    if (result.blocked) {
      handleDuplicateBlocked(`${type} Elastic`, { tooth: selectedToothIds.join(', ') }, dispatchOpts);
    }
  };

  const addPowerChain = (type: PowerChainType, color: string) => {
    if (!selectedMiniscrewId && selectedToothIds.length < 2) return;
    if (selectedMiniscrewId && selectedToothIds.length < 1) return;
    
    const sorted = [...selectedToothIds].sort((a, b) => a - b);
    const isUpper = sorted[0] < 30;
    const teeth = isUpper ? upperTeeth : lowerTeeth;
    
    const indices = sorted.map(id => teeth.findIndex(t => t.id === id)).filter(idx => idx !== -1);
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    const rangeTeeth = teeth.slice(minIdx, maxIdx + 1).map(t => t.id);

    const allTeethForChain = selectedMiniscrewId
      ? [...rangeTeeth]
      : rangeTeeth;

    const dispatchOpts = {
      action: {
        type: 'POWERCHAIN_SET' as const,
        payload: {
          teeth: allTeethForChain,
          type,
          color,
          miniscrewId: selectedMiniscrewId,
        },
        timestamp: Date.now(),
        source: 'ui' as const,
      },
      getState: () => ({ powerChains }),
      onApply: () => {
        saveToHistory();
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
        dispatch({ type: 'ADD_POWERCHAIN', payload: newPC });
        logAction(`Added ${type} power chain ${selectedMiniscrewId ? 'from miniscrew' : ''}`);
        setSelectedToothIds([]);
        setSelectedMiniscrewId(null);
      },
      onCommit: (effectiveCaseId && appointment.patientId) ? async () => {
        await clinicalActionApi.applyPowerchain({
          caseId:    effectiveCaseId,
          patientId: appointment.patientId,
          arch:      isUpper ? 'upper' : 'lower',
          segments:  rangeTeeth.slice(0, -1).map((t, i) => ({ from: t, to: rangeTeeth[i + 1] })),
          type,
        }).catch((err: any) => console.error('[ClinicalAction] powerchain persist failed:', err?.message));
      } : undefined,
      logAction: (desc: string) => logAction(desc),
    };

    const result = dispatchClinicalAction(dispatchOpts);
    if (result.blocked) {
      handleDuplicateBlocked(`${type} Powerchain`, { arch: isUpper ? 'upper' : 'lower' }, dispatchOpts);
    }
  };

  const addAccessory = (type: AccessoryType) => {
    if (selectedToothIds.length === 0) return;
    const isUpper = selectedToothIds[0] < 30;
    const newAccessory: Accessory = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      toothIds: [...selectedToothIds],
      isUpper
    };
    dispatchClinicalAction({
      action: { type: 'ACCESSORY_SET', payload: { type, teeth: selectedToothIds }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'ADD_ACCESSORY', payload: newAccessory });
        logAction(`Added ${type.replace('-', ' ')}`);
        setSelectedToothIds([]);
      },
      onCommit: (effectiveCaseId && appointment.patientId && selectedToothIds.length > 0) ? async () => {
        await Promise.all(selectedToothIds.map(toothId =>
          clinicalActionApi.addAccessory({
            caseId: effectiveCaseId, patientId: appointment.patientId, toothId, type,
          }).catch((err: any) => console.error('[ClinicalAction] accessory persist failed:', err?.message))
        ));
      } : undefined,
    });
  };

  const removeAccessory = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'ACCESSORY_REMOVED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_ACCESSORY', payload: id });
        logAction('Removed accessory');
      },
    });
  };

  const addLigature = (type: LigatureType) => {
    if (selectedToothIds.length < 2) return;
    const sorted = [...selectedToothIds].sort((a, b) => a - b);
    const isUpper = sorted[0] < 30;
    const newLig: LigatureConfig = {
      id: Math.random().toString(36).substr(2, 9),
      toothIds: sorted,
      type,
      isUpper
    };
    dispatchClinicalAction({
      action: { type: 'LIGATURE_SET', payload: { toothId: sorted[0], ligatureType: type }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'ADD_LIGATURE', payload: newLig });
        logAction(`Added ${type} ligature wire`);
        setSelectedToothIds([]);
      },
      onCommit: (effectiveCaseId && appointment.patientId) ? async () => {
        await Promise.all(sorted.map(toothId =>
          clinicalActionApi.addLigature({
            caseId: effectiveCaseId, patientId: appointment.patientId, toothId, type,
          }).catch((err: any) => console.error('[ClinicalAction] ligature persist failed:', err?.message))
        ));
      } : undefined,
    });
  };

  const removeLigature = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'LIGATURE_REMOVED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_LIGATURE', payload: id });
        logAction('Removed ligature wire');
      },
    });
  };

  const addMiniscrew = (config: { brand: string, diameter: string, length: string, anchorType: keyof ToothAnchors }) => {
    if (!miniscrewConfig) return;

    const toothId    = miniscrewConfig.toothId;
    // Use the anchor type from the modal form (user may have changed it)
    const anchorType = config.anchorType;

    // ── Duplicate guard: prevent double-placement at same tooth+anchor ──
    const alreadyExists = miniscrews.some(
      m => m.toothId === toothId && m.anchorType === anchorType
    );
    if (alreadyExists) {
      console.warn('[TADEngine] Duplicate placement blocked:', { toothId, anchorType });
      setMiniscrewConfig(null);
      return;
    }

    const positionText = getMiniscrewPositionLabel(toothId, anchorType as import('../utils/miniscrewUtils').MiniscrewAnchorType);

    console.log('[TADEngine] Placing miniscrew:', { toothId, anchorType, positionText });

    // Optimistic UI: add to chart immediately with a temp ID
    const tempId = `temp-${Math.random().toString(36).substr(2, 9)}`;
    const newMS: Miniscrew = {
      id: tempId,
      toothId,
      anchorType,
      angle: 90,
      brand: config.brand,
      diameter: config.diameter,
      length: config.length,
    };

    // Map UI anchorType → valid Mongoose TAD position enum
    const ANCHOR_TO_POSITION: Record<string, string> = {
      mesial:         'interradicular',
      distal:         'interradicular',
      apical:         'apical',
      infrazygomatic: 'infrazygomatic_crest',
    };
    const positionKey = ANCHOR_TO_POSITION[anchorType] ?? 'other';

    // P0-9: Pre-register a TAD_INSERTED side-effect with a sentinel ID.
    // Once the DB create resolves, we backfill the real DB _id so undo()
    // can call deleteTadMutation with the correct ID.
    const sideEffectRef = { type: 'TAD_INSERTED' as const, tadDbId: tempId }; // tempId until DB resolves

    dispatchClinicalAction({
      action: { type: 'TAD_INSERTED', payload: { toothId, position: anchorType }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true, // duplicate guard already applied above (alreadyExists check)
      onApply: () => {
        saveToHistory(sideEffectRef); // P0-9: attach side-effect to undo stack entry
        dispatch({ type: 'PLACE_TAD', payload: newMS });
        logAction(`Added ${config.brand} miniscrew (${config.diameter}x${config.length}) ${positionText}`);
        setMiniscrewConfig(null);
      },
      onCommit: (effectiveCaseId && appointment.patientId) ? async () => {
        // ── TAD Engine DB Sync ───────────────────────────────────────────────
        // Persists the miniscrew to the database. On success, React Query
        // invalidates the TADs cache → hydration useEffect replaces temp IDs
        // with real DB _ids automatically.
        const created = await createTadMutation.mutateAsync({
          caseId:        effectiveCaseId,
          patientId:     appointment.patientId,
          toothNumber:   toothId,
          position:      positionKey,
          positionLabel: positionText,
          brand:         config.brand,
          diameter:      config.diameter,
          length:        config.length,
          chartPosition: { toothId, anchorType },
        }).catch((err: any) => {
          console.error('[TADEngine] DB sync failed:', err?.message);
          // Roll back the temp miniscrew if DB persist failed
          dispatch({ type: 'REMOVE_TAD', payload: tempId });
          return null;
        });

        // P0-9: Backfill the real DB _id into the side-effect entry so undo()
        // can issue a correct deleteTad call (the tempId is meaningless in the DB).
        if (created?._id) {
          sideEffectRef.tadDbId = created._id;
        }
      } : undefined,
    });
  };

  const addIPR = (value: string) => {
    if (selectedToothIds.length !== 1) return;
    const newIPR: IPRMarker = {
      id: Math.random().toString(36).substr(2, 9),
      toothId: selectedToothIds[0],
      anchorType: 'mesial',
      value
    };
    dispatchClinicalAction({
      action: { type: 'IPR_MARKED', payload: { toothId: selectedToothIds[0], amount: parseFloat(value) || 0 }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'ADD_IPR', payload: newIPR });
        logAction(`Added IPR (${value}) to tooth ${selectedToothIds[0]}`);
        setSelectedToothIds([]);
      },
      onCommit: (effectiveCaseId && appointment.patientId && selectedToothIds.length === 1) ? async () => {
        await clinicalActionApi.addIPR({
          caseId:       effectiveCaseId,
          patientId:    appointment.patientId,
          betweenTeeth: [selectedToothIds[0], selectedToothIds[0] + 1],   // mesial side of selected tooth
          amount:       parseFloat(value) || 0,
        }).catch((err: any) => console.error('[ClinicalAction] IPR persist failed:', err?.message));
      } : undefined,
    });
  };

  const addSpace = (value: string) => {
    if (selectedToothIds.length !== 1) return;
    const newSpace: SpaceMarker = {
      id: Math.random().toString(36).substr(2, 9),
      toothId: selectedToothIds[0],
      anchorType: 'mesial',
      value
    };
    dispatchClinicalAction({
      action: { type: 'SPACE_MARKED', payload: { toothId: selectedToothIds[0], location: value }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'ADD_SPACE', payload: newSpace });
        logAction(`Added space marker (${value}) to tooth ${selectedToothIds[0]}`);
        setSelectedToothIds([]);
      },
      onCommit: (effectiveCaseId && appointment.patientId && selectedToothIds.length === 1) ? async () => {
        await clinicalActionApi.addSpaceMarker({
          caseId:    effectiveCaseId,
          patientId: appointment.patientId,
          toothId:   selectedToothIds[0],
          type:      value,
        }).catch((err: any) => console.error('[ClinicalAction] space marker persist failed:', err?.message));
      } : undefined,
    });
  };

  // ── getAnchorCoords — Anchor Safety Net (Phase 6C) ──────────────────────────
  // INVARIANT: NEVER crashes, NEVER trusts backend data completeness.
  // Returns a geometric fallback when tooth or anchor data is missing.
  const getAnchorCoords = (toothId: number, anchorType: keyof ToothAnchors) => {
    const isUpper = toothId < 30;
    const teeth   = isUpper ? upperTeeth : lowerTeeth;
    const index   = teeth.findIndex(t => t.id === toothId);

    // Base coordinates — used as fallback when tooth or anchor missing
    const baseX = 50 + Math.max(0, index) * 65;
    const baseY = isUpper ? 100 : 350;
    const FALLBACK = { x: baseX + 20, y: baseY + 30 };

    // Guard 1: tooth not found in current teeth array
    if (index === -1) return FALLBACK;

    const tooth = teeth[index];

    // Guard 2: tooth object malformed
    if (!tooth) return FALLBACK;

    // Guard 3: anchors map missing entirely (e.g., legacy/partial backend data)
    if (!tooth.anchors) return FALLBACK;

    // Guard 4: specific anchor key not present for this tooth
    const anchor = tooth.anchors[anchorType];
    if (!anchor) return FALLBACK;

    return isUpper
      ? { x: baseX + anchor.x + 8, y: baseY + anchor.y + 37 }
      : { x: baseX + anchor.x + 8, y: baseY + (80 - anchor.y) };
  };


  const removeElastic = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'ELASTIC_REMOVED', payload: { elasticId: id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_ELASTIC', payload: id });
        logAction('Removed elastic');
      },
    });
  };

  const removeAppliance = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'APPLIANCE_REMOVED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_APPLIANCE', payload: id });
        logAction('Removed appliance');
      },
    });
  };

  const removeIPRMarker = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'IPR_REMOVED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_IPR', payload: id });
        logAction('Removed IPR marker');
      },
    });
  };

  const removeSpaceMarker = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'SPACE_REMOVED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_SPACE', payload: id });
        logAction('Removed space marker');
      },
    });
  };

  const removePowerChain = (id: string) => {
    dispatchClinicalAction({
      action: { type: 'POWERCHAIN_REMOVED', payload: { chainId: id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_POWERCHAIN', payload: id });
        logAction('Removed power chain');
      },
    });
  };

  // ── SAVE SNAPSHOT — PART 3: Real API call (replaces local-only mock) ────────────
  const handleSaveSnapshot = async (
    overrideName?: string,
    opts?: { skipEndVisit?: boolean }
  ): Promise<{ id: string; name: string } | null> => {
    // Phase 6C: VISIT GATE — no snapshot without an active visit session
    // This is the STRICT enforcement rule. The UI structure (NoActiveVisitScreen)
    // already prevents reaching this point, but this is the structural safety net.
    if (!activeVisitRef.current || activeVisitRef.current.status !== 'active') {
      toast.error('Start a visit session before saving a snapshot.');
      return null;
    }
    // Phase 5: Block all saves while in time travel mode
    if (timeTravelEventId) {
      toast.warning('Exit time travel mode before saving a snapshot.');
      return null;
    }
    if (!effectiveCaseId || effectiveCaseId.length !== 24) {
      console.warn('[SnapshotEditor] Cannot save: no valid caseId');
      return null;
    }
    setIsSaving(true);
    try {
      // 1. Generate thumbnail (best-effort — never block save on failure)
      let thumbnail: string | null = null;
      if (chartContainerRef.current) {
        try {
          thumbnail = await toPng(chartContainerRef.current, { quality: 0.85 });
        } catch {
          console.warn('[SnapshotEditor] Thumbnail generation failed — saving without thumbnail');
        }
      }

      // 2. Build the snapshot name
      const snapshotName = overrideName?.trim() ||
        `Visit – ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

      // 3. POST to backend — ALWAYS creates a new document, never overwrites

      // Validate: must have tooth data before saving
      if (!upperTeeth?.length || !lowerTeeth?.length) {
        toast.error('Cannot save: chart has no tooth data');
        return null;
      }

      const normalizedChart = normalizeChartState({
        upperTeeth, lowerTeeth, upperArchwire, lowerArchwire,
        elastics, appliances, miniscrews, iprMarkers, spaceMarkers, accessories, powerChains, ligatures,
      });

      const snapshotPayload = {
        type:          'treatment' as 'treatment',
        visitType,
        name:          snapshotName,
        // Phase 6C: visitId links snapshot to the active visit session (required for treatment)
        visitId:       activeVisitRef.current?.id ?? undefined,
        // Only send appointmentId when it's a valid 24-char MongoDB ObjectId
        appointmentId: appointment?.id?.length === 24 ? appointment.id : undefined,
        chartState:    normalizedChart,
        notes:         { text: notes, tags: [], warnings: [] },
        thumbnail,
        // Phase 4: optimistic concurrency — backend rejects if version drifted
        expectedVersion: expectedVersionRef.current,
      };


      const result = await createSnapshotMutation.mutateAsync(snapshotPayload);

      // Phase 6D: Close the active visit UNLESS caller requests skipEndVisit.
      // skipEndVisit=true is used by the auto-save-before-end path in onEndVisit,
      // which will call endVisitMutation itself after receiving the snapshot ID.
      if (!opts?.skipEndVisit && activeVisitRef.current?.id) {
        await endVisitMutation.mutateAsync({
          visitId: activeVisitRef.current.id,
          snapshotId: result.snapshot.id,
        }).catch((err: any) => console.error('[SnapshotEditor] Failed to end visit:', err?.message));
      }

      // 4. Mark the newly created snapshot as active
      setActiveSnapshotId(result.snapshot.id);
      // Saving after a restore commits it — clear undo stack
      setCanUndoRestore(false);
      setRestoreStack([]);

      // FIX-2: Invalidate the unified timeline so OrthoTimelineTab + VisitHistorySidebar
      // refresh immediately without waiting for staleTime to expire.
      if (effectiveCaseId) {
        queryClient.invalidateQueries({ queryKey: ['caseTimeline', effectiveCaseId] });
      }

      // 5. Notify parent (parent now calls invalidateQueries in OrthodonticTab)
      onSave({ id: result.snapshot.id, name: snapshotName } as any);
      logAction(`Saved snapshot: ${snapshotName}`);
      toast.success('Snapshot saved');

      // P0-5: Release hydration lock — chart state is now safely committed to DB.
      // React Query refetches are now allowed to overwrite local state again.
      unlockHydration();
      resetUndoHistory();

      // Phase 3: Clear localStorage draft — data is now safely persisted in the snapshot
      try { localStorage.removeItem(`chart_draft_${effectiveCaseId}`); } catch (_) {}

      return { id: result.snapshot.id, name: snapshotName };
    } catch (err: any) {
      const errCode = err?.response?.data?.error?.code;
      const errMsg  = err?.response?.data?.error?.message;
      const errStatus = err?.response?.status;

      if (errStatus === 403 || errCode === 'PERMISSION_DENIED') {
        toast.error('You don\'t have permission to perform this action. Contact your organization admin.', {
          duration: 10000,
        });
        return null;
      }

      if (errCode === 'SNAPSHOT_CONFLICT') {
        // Phase 4: version conflict — another user saved while we were editing
        setSnapshotConflict({
          currentVersion:  err?.response?.data?.error?.currentVersion ?? 0,
          expectedVersion: err?.response?.data?.error?.expectedVersion ?? 0,
        });
        toast.error('Snapshot conflict: another user saved this case. Please reload to get the latest state.', {
          duration: 10000,
        });
      } else if (errCode === 'VISIT_LOCKED_BY_ANOTHER_USER') {
        // Phase 4: lock conflict — another user holds the session lock
        setLockConflict({
          lockedBy: err?.response?.data?.error?.lockedBy ?? null,
          lockedAt: err?.response?.data?.error?.lockedAt ?? null,
          visitId:  activeVisitRef.current?._id ?? null,
        });
      } else {
        console.error('[SnapshotEditor] Save failed:', errMsg ?? err);
        toast.error(errMsg || 'Failed to save snapshot');
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  };


  // ── RESTORE SNAPSHOT — PART 5: Full state replacement + history clear + DB shape ───
  // Accepts both Snapshot (legacy local shape) and SnapshotDTO (from DB via selector).
  const handleRestoreSnapshot = (snapshot: Snapshot | SnapshotDTO) => {
    const cs = snapshot.chartState as Snapshot['chartState'];
    const snapshotId = 'id' in snapshot ? (snapshot as any).id : null;

    // ✅ CRITICAL: Reset undo history to prevent previous session bleeding through
    resetUndoHistory();

    // Enter snapshot mode — blocks DB hydration from overriding restored state
    setIsSnapshotMode(true);

    // Full chart state replacement via single dispatch
    dispatch({
      type: 'HYDRATE_SNAPSHOT',
      payload: {
        upperTeeth:   cs.upperTeeth   ?? UPPER_TEETH,
        lowerTeeth:   cs.lowerTeeth   ?? LOWER_TEETH,
        elastics:     cs.elastics     ?? [],
        appliances:   cs.appliances   ?? [],
        iprMarkers:   cs.iprMarkers   ?? [],
        spaceMarkers: cs.spaceMarkers ?? [],
        accessories:  cs.accessories  ?? [],
        powerChains:  cs.powerChains  ?? [],
        ligatures:    cs.ligatures    ?? [],
        upperArchwire: cs.upperArchwire ?? undefined,
        lowerArchwire: cs.lowerArchwire ?? undefined,
        // Snapshot miniscrews restored via HYDRATE_TAD_SNAPSHOT below
        miniscrews:   [],
      },
    });

    // ── TRUE CLINICAL SNAPSHOT v2: Restore appliance state from snapshot ──────
    // bondingSnapshot / tadSnapshot were captured at visit time (Step 7b, backend).
    // If present → override teeth bonding status and miniscrews from snapshot.
    // If absent  → backward compat: unblock DB hydration to show current DB state.
    const bondingSnap = (snapshot as any).bondingSnapshot ?? [];
    const tadSnap     = (snapshot as any).tadSnapshot     ?? [];

    const hasAppliance = bondingSnap.length > 0 || tadSnap.length > 0;

    if (hasAppliance) {
      // v2 snapshot: full appliance restore from snapshot data
      dispatch({ type: 'HYDRATE_BONDING_SNAPSHOT', payload: bondingSnap });
      dispatch({ type: 'HYDRATE_TAD_SNAPSHOT',     payload: tadSnap });
    } else {
      // Old snapshot (pre-v2): no appliance data saved.
      // DB hydration will handle bonding/TAD via the normal useEffect flow.
      // We must NOT keep isSnapshotMode=true if there's no snapshot data to show —
      // otherwise teeth bonding will always look incorrect on old snapshots.
      // We keep isSnapshotMode=true for chart state but let DB hydration run for appliances.
      // The useEffect already guards: if (isSnapshotMode) return — so bonding/TADs
      // will remain in their DB state (current truth) for pre-v2 snapshots.
      // This is the correct fallback: v1 snapshot shows historical chart + current appliances.
    }

    // Restore session notes
    const snapshotNotes = 'notes' in snapshot
      ? (typeof snapshot.notes === 'string' ? snapshot.notes : (snapshot.notes as any)?.text ?? '')
      : '';
    setNotes(snapshotNotes);

    // Session actions are UI-only — reset for the new version
    setActions([]);

    // Track active snapshot
    if (snapshotId) setActiveSnapshotId(snapshotId);

    logAction(`Restored snapshot v${(snapshot as any).version ?? '?'}: ${(snapshot as any).name ?? 'Unnamed'}`);
  };

  // FIX-3: Restore from unified timeline — fetches full snapshot DTO before restoring.
  // Mirrors handleSelectSnapshot but accepts a TimelineEntry (from VisitHistorySidebar).
  // Guard: FIX-6 — appointment-only entries (snapshotId null) are silently skipped.
  const handleRestoreFromTimeline = useCallback(async (entry: import('../types').TimelineEntry) => {
    // FIX-6: appointment-only entries have no snapshot — skip until backend merges them
    if (!entry.snapshotId) {
      toast.info('This entry has no clinical snapshot to restore.');
      return;
    }
    if (isRestoring) return;
    try {
      setIsRestoring(true);
      const { getSnapshotById } = await import('../api/snapshot.api');
      const full = await getSnapshotById(entry.snapshotId);

      // FIX-7: defensive guard — reject if tooth data is missing
      if (!full?.chartState?.upperTeeth?.length) {
        toast.error('Invalid snapshot data — missing tooth chart');
        return;
      }

      // Push current state onto undo stack (capped at MAX_RESTORE_HISTORY)
      setRestoreStack((prev) => [...prev, chartStateRef.current].slice(-MAX_RESTORE_HISTORY));

      handleRestoreSnapshot(full);
      setPreviewSnapshot(full);
      toast.info(`Previewing Visit #${entry.visitNumber}`);
    } catch (err) {
      console.error('[SnapshotEditor] Timeline restore failed:', err);
      toast.error('Failed to restore snapshot from timeline');
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, handleRestoreSnapshot]);

  // Chart immediately reflects the snapshot so the user can evaluate it visually.
  // "Apply" confirms. "Cancel" reverts to the pre-preview state.
  const handleSelectSnapshot = async (listItem: SnapshotListItem) => {
    if (isRestoring) return;
    try {
      setIsRestoring(true);
      const { getSnapshotById } = await import('../api/snapshot.api');
      const full = await getSnapshotById(listItem.id);

      // Safety guard — reject snapshots with no tooth data
      if (!full?.chartState?.upperTeeth?.length) {
        toast.error('Invalid snapshot data — missing tooth chart');
        return;
      }

      // Push current chart state onto the undo stack (capped at MAX_RESTORE_HISTORY)
      setRestoreStack((prev) => [...prev, chartStateRef.current].slice(-MAX_RESTORE_HISTORY));

      // Apply to chart immediately — this IS the preview (real, not fake)
      handleRestoreSnapshot(full);
      setPreviewSnapshot(full);
    } catch (err) {
      console.error('[SnapshotEditor] Failed to load snapshot:', err);
      toast.error('Failed to load snapshot');
    } finally {
      setIsRestoring(false);
    }
  };

  // ── PREVIEW: Apply — chart is already showing the snapshot, just confirm ───────
  const handleApplyPreview = () => {
    if (!previewSnapshot || isRestoring) return;
    setPreviewSnapshot(null);
    setCanUndoRestore(true);
    toast.success(`Restored: ${previewSnapshot.name}`);
  };

  // ── PREVIEW: Cancel — revert chart to the pre-preview state ──────────────────
  const handleCancelPreview = () => {
    setRestoreStack((prev) => {
      const saved = prev[prev.length - 1];
      if (saved) handleRestoreSnapshot({ chartState: saved } as any);
      return prev.slice(0, -1);
    });
    setPreviewSnapshot(null);
  };

  // ── UNDO RESTORE — multi-level: pop stack and revert to that state ────────────
  const handleUndoRestore = () => {
    setRestoreStack((prev) => {
      if (prev.length === 0) return prev;
      const saved = prev[prev.length - 1];
      handleRestoreSnapshot({ chartState: saved } as any);
      const next = prev.slice(0, -1);
      setCanUndoRestore(next.length > 0);
      return next;
    });
    setActiveSnapshotId(null);
    logAction('Undo restore — reverted to previous state');
    toast.success('Restore undone');
  };

  /**
   * OPG → Bracket Auto-Sync Engine.
   * Called by PrescriptionOPGModal when a clinician clicks a tooth-group row.
   *
   * ✅ OPG modal stays OPEN (diagnostic reference layer — z-[1000])
   * ✅ Bracket panel opens ON TOP (action layer — z-[1100])
   * ✅ States are fully decoupled: closing one does NOT affect the other
   *
   * Workflow:
   *   1. Select the FDI teeth on the chart (visual highlight)
   *   2. Pre-fill bracket toolbar: prescription + height + custom bonding
   *   3. Open the Brackets ActionBar panel
   *   → Clinician clicks "Bond Brackets" once — zero manual entry needed
   *   → OPG remains visible for continued reference
   */
  const handleBondFromOPG = (payload: {
    toothIds: number[];
    prescription: 'MBT' | 'Roth';
    height: number;
    groupLabel: string;
  }) => {
    // INTENTIONALLY: OPG modal is NOT closed here.
    // The clinician needs it as a reference while bonding.
    // setShowOPGModal(false) ← REMOVED (was causing the bug)

    // 1. Select the teeth on the chart
    setSelectedToothIds(payload.toothIds);

    // 2. Pre-fill bracket toolbar config
    setSelectedPrescription(payload.prescription as BracketPrescription);
    setSelectedBondingOption('custom');
    setSelectedBondingHeight(String(payload.height));

    // 3. Open Brackets ActionBar panel — renders at z-[1100], above OPG z-[1000]
    setActiveActionBarCategory('brackets');

    // ── Bonding Engine OPG Sync ──────────────────────────────────────────────
    // Fires the DB persist immediately using the OPG group data.
    // The chart visual update above is instant — this runs async in background.
    if (!effectiveCaseId) {
      console.warn('[BondingEngine] No caseId — bonding will NOT persist to database. Create an orthodontic case first.');
    }
    if (effectiveCaseId && appointment.patientId) {
      const dbPayload = bondingEngine.applyFromOPG(
        effectiveCaseId,
        appointment.patientId,
        payload.toothIds,
        payload.prescription,
        payload.height,
        payload.groupLabel,
        undefined, // snapshotId — populated when snapshot is saved
        [] // linkedTadIds resolved asynchronously
      );

      // ── Duplicate bonding check — warn before REBOND ───────────────────
      // If any of the target teeth are already ACTIVE in the DB, show a
      // confirmation modal so the clinician consciously decides to rebond.
      // The backend upserts anyway (REBONDED event) — this is UX protection only.
      const alreadyBondedTeeth = payload.toothIds.filter(
        toothId => bondingEngine.bondings.some(
          b => b.tooth === toothId && b.status === 'ACTIVE'
        )
      );

      if (alreadyBondedTeeth.length > 0) {
        // Pause — show confirmation modal. DB call runs only if user confirms.
        setDupeBondConfirm({ pendingPayload: dbPayload, alreadyBondedTeeth });
      } else {
        // ── OPTIMISTIC LOCAL UPDATE ─────────────────────────────────────
        // ── CM-1 FIX: saveToHistory BEFORE dispatch (per-tooth granular status) ──
        saveToHistory();
        payload.toothIds.forEach(toothId => {
          const isMolar = [...chartStateRef.current.upperTeeth, ...chartStateRef.current.lowerTeeth].find(t => t.id === toothId)?.type === 'molar' || toothId % 10 >= 6;
          dispatch({
            type: 'SET_TOOTH_STATUS',
            payload: {
              toothId,
              status: (isMolar ? 'molar-tube' : 'bracket') as ToothStatus,
            },
          });
        });

// Fire DB write — onMutate already updated cache optimistically
        bondingEngine.applyBonding(dbPayload).catch(
          (err: any) => {
            const status = err?.response?.status;
            const msg = err?.response?.data?.error?.message || err?.message || 'Unknown error';
            console.error('[BondingEngine] OPG sync FAILED:', { status, msg, fullError: err?.response?.data });
            setErrorModalMessage(`Bonding save failed (${status || 'network'}): ${msg}`);
            setIsErrorModalOpen(true);
          }
        );
      }
    }

    // Audit log
    logAction(
      `OPG sync: ${payload.prescription} ${payload.groupLabel} → ${payload.height}mm`,
      payload.toothIds[0],
    );
  };

  // ─── TAD Engine helpers ────────────────────────────────────────────────────────

  /**
   * failTadAndRemove — records a TAD failure event then removes it from DB.
   * Called by the miniscrew removal modal when the clinical reason is "Loose".
   * Pattern: markForRemoval (records intent) → remove (finalises lifecycle).
   */
  const failTadAndRemove = (tadId: string, reason: string) => {
    markForRemovalMutation.mutateAsync({
      id: tadId,
      payload: { reason, notes: 'Clinical failure: loose' },
    })
      .then(() =>
        removeTadMutation.mutateAsync({
          id: tadId,
          payload: { reason: 'failed', notes: reason },
        })
      )
      .catch((err: any) => console.error('[TADEngine] Fail+Remove failed:', err?.message));
  };

  // ── Miniscrew Context Menu Handlers ──────────────────────────────────────────

  const handleTadContextMenu = (e: React.MouseEvent, tadId: string) => {
    e.preventDefault();
    const ms = miniscrews.find(m => m.id === tadId);
    setMiniscrewContextMenu({
      id:     tadId,
      x:      e.clientX,
      y:      e.clientY,
      status: (ms?.status as MiniscrewStatus) ?? 'active',
    });
  };

  /** Mark healing — calls markForRemoval with HEALING intent */
  const handleMiniscrewHeal = () => {
    if (!miniscrewContextMenu) return;
    const { id } = miniscrewContextMenu;
    setMiniscrewContextMenu(null);
    // ── CM-2 FIX: saveToHistory BEFORE dispatch (captures pre-heal state for undo) ──
    dispatchClinicalAction({
      action: { type: 'TAD_HEALED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'HEAL_TAD', payload: id });
        logAction('Miniscrew marked as healing');
      },
      onCommit: /^[a-f\d]{24}$/i.test(id) ? async () => {
        await markForRemovalMutation.mutateAsync({
          id,
          payload: { reason: 'healing', notes: 'Marked healing by clinician' },
        }).catch((err: any) => console.error('[TADEngine] Heal failed:', err?.message));
      } : undefined,
    });
  };

  /** Record failure — calls useFailTad + creates MINISCREW_REINSERTION todo if not duplicate */
  const handleMiniscrewFail = () => {
    if (!miniscrewContextMenu) return;
    const { id } = miniscrewContextMenu;
    const ms = miniscrews.find(m => m.id === id);
    setMiniscrewContextMenu(null);
    dispatchClinicalAction({
      action: { type: 'TAD_FAILED', payload: { id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'FAIL_TAD', payload: id });
        logAction('Miniscrew failure recorded');
        // Auto-create MINISCREW_REINSERTION todo if not already pending for this tooth
        if (effectiveCaseId && appointment.patientId && ms) {
          const toothStr = String(ms.toothId);
          const alreadyPending = currentTodos.some(
            t => t.tooth === toothStr && t.type === 'MINISCREW_REINSERTION' && t.status === 'pending'
          );
          if (!alreadyPending) {
            batchCreateTodos.mutate([{
              caseId:      effectiveCaseId,
              patientId:   appointment.patientId,
              type:        'MINISCREW_REINSERTION',
              tooth:       toothStr,
              description: `Miniscrew on tooth ${ms.toothId} failed — reinsertion needed`,
              priority:    'high',
            }], {
              onSuccess: () => setShowTodoPanel(true),
            });
          }
        }
      },
      onCommit: /^[a-f\d]{24}$/i.test(id) ? async () => {
        await failTadMutation.mutateAsync({
          id,
          payload: { reason: 'loose', notes: 'Clinical failure' },
        }).catch((err: any) => console.error('[TADEngine] Fail TAD failed:', err?.message));
      } : undefined,
    });
  };

  /** Remove miniscrew — planned removal → calls remove API */
  const handleMiniscrewRemove = () => {
    if (!miniscrewContextMenu) return;
    const { id } = miniscrewContextMenu;
    setMiniscrewContextMenu(null);
    dispatchClinicalAction({
      action: { type: 'TAD_REMOVED', payload: { tadId: id }, timestamp: Date.now(), source: 'ui' },
      skipDuplicateCheck: true,
      onApply: () => {
        saveToHistory();
        dispatch({ type: 'REMOVE_TAD', payload: id });
        logAction('Miniscrew removed (planned)');
      },
      onCommit: /^[a-f\d]{24}$/i.test(id) ? async () => {
        await removeTadMutation.mutateAsync({
          id,
          payload: { reason: 'planned_removal', notes: 'Removed via context menu' },
        }).catch((err: any) => console.error('[TADEngine] Remove failed:', err?.message));
      } : undefined,
    });
  };

  /** Count of live bonded teeth (ACTIVE status in DB) */
  const activeBondedCount = bondingEngine.bondings.filter(b => b.status === 'ACTIVE').length;

  return (
    <div ref={fullscreenRef} className="fixed inset-0 bg-slate-100 flex flex-col z-[200] overflow-hidden">
      <AppointmentInfoHeader
        activeVisit={activeVisit ?? null}
        onBack={onBack}
        onStartVisit={() => startVisitMutation.mutate({})}
        isStartingVisit={startVisitMutation.isPending || visitLoading}
        onEndVisit={async () => {
          if (!activeVisitRef.current?.id) {
            onBack();
            return;
          }

          // Phase 6D: AUTO-SNAPSHOT GUARD (race-condition-safe)
          // If no snapshot was saved this visit, auto-save FIRST with skipEndVisit=true
          // so we get the snapshot ID back, then end the visit with it explicitly.
          // This avoids the race where handleSaveSnapshot ends the visit internally AND
          // the outer onEndVisit tries to end it again.
          if (!activeSnapshotId) {
            toast.info('Auto-saving snapshot before ending visit…');
            const saved = await handleSaveSnapshot('Auto-save on visit end', { skipEndVisit: true });
            if (!saved) return; // save failed — user stays in editor; error already toasted
            // Now end the visit with the correct snapshot ID
            try {
              await endVisitMutation.mutateAsync({
                visitId:    activeVisitRef.current.id,
                snapshotId: saved.id,
              });
              onBack();
            } catch (err: any) {
              console.error('[SnapshotEditor] End visit failed after auto-save:', err?.message);
              if (err?.response?.status === 403 || err?.response?.data?.error?.code === 'PERMISSION_DENIED') {
                toast.error('You don\'t have permission to end this visit. Contact your organization admin.', { duration: 10000 });
              } else {
                toast.error('Snapshot saved but visit could not be closed. Please try again.');
              }
            }
            return;
          }

          try {
            await endVisitMutation.mutateAsync({
              visitId:    activeVisitRef.current.id,
              snapshotId: activeSnapshotId,
            });
            // Phase 6C/6D: navigate back only on success
            onBack();
          } catch (err: any) {
            console.error('[SnapshotEditor] End visit failed:', err?.message);
            if (err?.response?.status === 403 || err?.response?.data?.error?.code === 'PERMISSION_DENIED') {
              toast.error('You don\'t have permission to end this visit. Contact your organization admin.', { duration: 10000 });
            } else {
              toast.error('Failed to end visit. Please try again.');
            }
          }
        }}
        isEndingVisit={endVisitMutation.isPending}
        snapshots={snapshots}
        snapshotsLoading={snapshotsLoading}
        activeSnapshotId={activeSnapshotId}
        canDeleteSnapshots={roleName === 'Admin' || roleName === 'org_admin'}
        onRestoreSnapshot={handleSelectSnapshot}
        onCreateSnapshot={() => handleSaveSnapshot()}
        onEditSnapshot={(s) => setEditingSnapshot(s)}
        onDeleteSnapshot={(s) => {
          const wasActive = s.id === activeSnapshotId;
          deleteMutation.mutate(s.id, {
            onSuccess: () => {
              if (!wasActive) return;
              const remaining = snapshots.filter(snap => snap.id !== s.id);
              if (remaining.length > 0) {
                handleSelectSnapshot(remaining[remaining.length - 1]);
              } else {
                resetChartState();
              }
            },
          });
        }}
        timeline={timeline}
        timelineLoading={timelineLoading}
        onSelectVisit={handleRestoreFromTimeline}
      />

      {/* ── Phase 3+4+6B: Session Status Bar ─────────────────────────────────── */}
      {activeVisit && (
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            gap:             '10px',
            padding:         '4px 16px',
            background:      '#f0fdf4',
            borderBottom:    '1px solid #bbf7d0',
            fontSize:        '12px',
            fontFamily:      'Inter, system-ui, sans-serif',
            color:           '#166534',
          }}
        >
          {/* Visit Active pill */}
          <span style={{ display:'flex', alignItems:'center', gap:'5px', fontWeight:600 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#16a34a', display:'inline-block' }} />
            Visit Active
          </span>
          <span style={{ color:'#86efac' }}>·</span>
          {/* Notes save indicator */}
          <span style={{ color: updateVisitNotesMutation.isPending ? '#ca8a04' : '#166534' }}>
            {updateVisitNotesMutation.isPending ? '🟡 Saving notes…' : '🟢 Notes saved'}
          </span>
          {/* Phase 6B: Live smart auto-save indicator */}
          <span style={{ color:'#86efac' }}>·</span>
          <SaveIndicator status={saveStatus} />
          {/* Phase 4: Lock owner indicator */}
          {activeVisit.lockedBy && (
            <>
              <span style={{ color:'#86efac' }}>·</span>
              <span style={{ display:'flex', alignItems:'center', gap:'4px', color:'#166534' }}>
                🔒 <span style={{ fontWeight:600 }}>Locked</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Phase 6B: Presence Banner ─────────────────────────────────────────── */}
      {/* Shown when another doctor opens the same visit session in real-time.    */}
      <VisitPresenceBanner
        otherDoctorName={otherDoctorName}
        onDismiss={() => setOtherDoctorName(null)}
      />

      {/* ── Phase 4: Lock Conflict Modal ─────────────────────────────────────── */}
      {lockConflict && (
        <div style={conflictOverlayStyle}>
          <div style={conflictBoxStyle}>
            <div style={{ fontSize:20, marginBottom:8 }}>🔒 Visit Locked</div>
            <p style={{ margin:'0 0 8px', color:'#374151', fontSize:14 }}>
              Another clinician is currently editing this case.
            </p>
            {lockConflict.lockedAt && (
              <p style={{ margin:'0 0 16px', color:'#6b7280', fontSize:12 }}>
                Lock acquired: {new Date(lockConflict.lockedAt).toLocaleTimeString()}
              </p>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={() => setLockConflict(null)}
                style={conflictSecondaryBtnStyle}
              >
                Dismiss
              </button>
              {lockConflict.visitId && (
                <button
                  onClick={() => {
                    if (!lockConflict.visitId) return;
                    takeoverMutation.mutate(lockConflict.visitId, {
                      onSuccess: () => setLockConflict(null),
                    });
                  }}
                  disabled={takeoverMutation.isPending}
                  style={conflictPrimaryBtnStyle}
                >
                  {takeoverMutation.isPending ? 'Taking over…' : '🔄 Take Over'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Phase 4: Snapshot Conflict Modal ─────────────────────────────────── */}
      {snapshotConflict && (
        <div style={conflictOverlayStyle}>
          <div style={conflictBoxStyle}>
            <div style={{ fontSize:20, marginBottom:8 }}>⚠️ Save Conflict</div>
            <p style={{ margin:'0 0 8px', color:'#374151', fontSize:14 }}>
              Another user saved this case while you were editing.
            </p>
            <p style={{ margin:'0 0 16px', color:'#6b7280', fontSize:12 }}>
              Expected version {snapshotConflict.expectedVersion}, current is {snapshotConflict.currentVersion}.
              Reload to get the latest state, then re-apply your changes.
            </p>
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={() => setSnapshotConflict(null)}
                style={conflictSecondaryBtnStyle}
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setSnapshotConflict(null);
                  // Force re-hydration from server
                  latestLoadedRef.current    = null;
                  expectedVersionRef.current = null;
                }}
                style={conflictPrimaryBtnStyle}
              >
                🔄 Reload Latest
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {(!activeVisit && !visitLoading) ? (
          <div className="flex-1 flex items-center justify-center w-full bg-slate-50 border-t border-slate-200">
            <NoActiveVisitScreen
              caseId={effectiveCaseId}
              onStartVisit={() => startVisitMutation.mutateAsync({})}
              onVisitStarted={() => {}}
              visitCount={timeline.length}
              lastVisitDate={timeline[0]?.createdAt}
            />
          </div>
        ) : (
          <>
            {/* Left Panel: Actions & Notes */}
            <AppointmentActionPanel 
          actions={actions} 
          notes={notes} 
          onNotesChange={setNotes} 
          onSaveSnapshot={() => handleSaveSnapshot()}
          isSaving={isSaving}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />

        {/* Center: Chart Area */}
        <div className="flex-1 flex flex-col relative bg-slate-50 overflow-hidden">

          {/* ── Sequence Guidance Card — floats above chart, z-[1200] ────────── */}
          {/* Guidance only — does NOT mutate bonding/TAD/chart state */}
          {showSequenceGuidance && sequenceEngine.hasSequence && (
            <SequenceGuidanceCard
              currentStep={sequenceEngine.currentStep}
              nextStep={sequenceEngine.nextStep}
              prevStep={sequenceEngine.prevStep}
              currentStepIndex={sequenceEngine.currentStepIndex}
              totalSteps={sequenceEngine.totalSteps}
              progress={sequenceEngine.progress}
              isFirst={sequenceEngine.isFirst}
              isLast={sequenceEngine.isLast}
              isUpdating={sequenceEngine.isUpdating}
              onNext={async () => {
                await sequenceEngine.goNext();
                setLocalSequenceStep((prev) => prev + 1);
              }}
              onPrev={async () => {
                await sequenceEngine.goPrev();
                setLocalSequenceStep((prev) => Math.max(0, prev - 1));
              }}
              onClose={() => setShowSequenceGuidance(false)}
            />
          )}
          {/* ── Preview Restore Bar — chart is already showing the snapshot ── */}
          <AnimatePresence>
            {previewSnapshot && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 px-4 py-2.5 bg-indigo-600 text-white text-sm z-30 shadow-md"
              >
                <span className="px-2 py-0.5 bg-indigo-500 text-indigo-100 font-bold uppercase tracking-wider text-[9px] rounded-full">Preview Mode</span>
                <span className="flex-1 font-medium truncate">{previewSnapshot.name}</span>
                <button
                  onClick={handleApplyPreview}
                  disabled={isRestoring}
                  className="px-3 py-1 bg-white text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isRestoring ? 'Applying…' : 'Apply Snapshot'}
                </button>
                <button
                  onClick={handleCancelPreview}
                  disabled={isRestoring}
                  className="px-3 py-1 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-400 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Undo Restore bar — shows stack depth for multi-level undo ── */}
          <AnimatePresence>
            {canUndoRestore && !previewSnapshot && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm z-30"
              >
                <span className="flex-1 text-xs font-medium">
                  Snapshot restored.
                  {restoreStack.length > 0 && <span className="ml-1 text-amber-600">({restoreStack.length} undo level{restoreStack.length > 1 ? 's' : ''} available)</span>}
                </span>
                <button
                  onClick={handleUndoRestore}
                  className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg border border-amber-300 hover:bg-amber-200 transition-colors"
                >
                  Undo Restore
                </button>
                <button
                  onClick={() => setCanUndoRestore(false)}
                  className="text-amber-400 hover:text-amber-600 transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── ONBOARDING UI OVERLAY — first-time guidance ─────────────────────── */}
          <AnimatePresence>
            {showOnboarding && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
              >
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-white rounded-3xl p-8 max-w-md text-center shadow-2xl border border-slate-100"
                >
                  <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <Activity className="w-10 h-10" />
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 mb-3">
                    How to Use the Chart
                  </h2>

                  <p className="text-slate-500 text-sm leading-relaxed mb-6">
                    Click on teeth to add brackets, wires, or appliances.
                    Use the toolbar above to select actions.
                    When ready, save a snapshot to track treatment progress.
                  </p>

                  <div className="bg-amber-50 rounded-xl px-4 py-3 text-[11px] text-amber-600 font-bold border border-amber-100 mb-8 inline-flex items-center gap-2">
                    <span className="text-sm">💡</span> Tip: Try clicking a tooth to begin
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => {
                        handleCloseOnboarding();
                        handleSaveSnapshot();
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3.5 rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create First Snapshot
                    </button>

                    <button
                      onClick={handleCloseOnboarding}
                      className="w-full text-slate-400 hover:text-slate-600 font-bold text-[11px] uppercase tracking-widest py-2 transition-colors"
                    >
                      Got it, dismiss
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Empty State: No Snapshots (new case) ─────────────────────────────── */}
          {/* Shows when there are no snapshots and data has finished loading */}
          <AnimatePresence>
            {!snapshotsLoading && snapshots.length === 0 && !latestSnapshot && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-20"
              >
                <div className="text-center max-w-md px-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                    <Camera className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">No Snapshots Yet</h3>
                  <p className="text-sm text-slate-500 mb-5">
                    Save the current chart state to create your first clinical snapshot.
                    Snapshots preserve tooth positions, brackets, wires, and notes.
                  </p>
                  <button
                    onClick={() => handleSaveSnapshot()}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create First Snapshot
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                <ToolbarButton icon={isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />} onClick={toggleFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} />
                <div className="h-4 w-px bg-slate-200" />
                <ToolbarButton
                  icon={<RotateCcw className="w-4 h-4" />}
                  onClick={undoWithLog}
                  title="Undo Action"
                  disabled={!canUndo}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Mode indicator — shows whether chart is in preview or live state */}
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide transition-colors ${
                previewSnapshot
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {previewSnapshot ? 'Preview Mode' : 'Live Mode'}
              </span>
              <div className="h-4 w-px bg-slate-200" />
              <Toggle label="Brackets" checked={showBrackets} onChange={setShowBrackets} compact />
              <Toggle label="Archwire" checked={showArchwire} onChange={setShowArchwire} compact />
              <Toggle label="Anchors" checked={showAnchors} onChange={setShowAnchors} compact />
              <div className="h-4 w-px bg-slate-200" />
              <button 
                onClick={() => setShowOPGModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                Rx & OPG
              </button>

              {/* Sequence Guidance toggle — only shown if plan exists */}
              {sequenceEngine.hasSequence && (
                <button
                  onClick={() => setShowSequenceGuidance((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                    showSequenceGuidance
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200 hover:border-indigo-200'
                  }`}
                  title={showSequenceGuidance ? 'Hide Treatment Sequence' : 'Show Treatment Sequence'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Sequence
                </button>
              )}

              <div className="h-4 w-px bg-slate-200" />

              {/* Clinical TODO Panel toggle */}
              <button
                onClick={() => setShowTodoPanel(v => !v)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                  showTodoPanel
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 border-slate-200 hover:border-rose-200'
                }`}
                title="Clinical TODOs"
              >
                <ListTodo className="w-3.5 h-3.5" />
                TODOs
              </button>

              {/* Phase 5: Clinical Timeline Panel toggle */}
              <button
                onClick={() => setShowTimelinePanel(v => !v)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                  showTimelinePanel
                    ? 'bg-violet-600 text-white border-violet-600'
                    : timeTravelEventId
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'text-slate-500 hover:text-violet-600 hover:bg-violet-50 border-slate-200 hover:border-violet-200'
                }`}
                title={timeTravelEventId ? 'Timeline (time travel active)' : 'Clinical Timeline'}
              >
                <Clock className="w-3.5 h-3.5" />
                Timeline
                {timeTravelEventId && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
                )}
              </button>

              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                title="Chart Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── Phase 5: Time Travel Read-Only Banner ───────────────────────── */}
          {timeTravelEventId && (
            <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <Clock className="w-4 h-4" />
                Time travel mode — chart is read-only (replayed to event #{timeTravelState?.replayedUpTo})
              </div>
              <button
                onClick={() => {
                  setTimeTravelEventId(null);
                  // Re-hydrate from server state
                  if (derivedClinical?.derivedState) {
                    const cs = derivedClinical.derivedState as Snapshot['chartState'];
                    dispatch({
                      type: 'HYDRATE_SNAPSHOT',
                      payload: {
                        upperTeeth:    cs.upperTeeth    ?? UPPER_TEETH,
                        lowerTeeth:    cs.lowerTeeth    ?? LOWER_TEETH,
                        elastics:      cs.elastics      ?? [],
                        appliances:    cs.appliances    ?? [],
                        iprMarkers:    cs.iprMarkers    ?? [],
                        spaceMarkers:  cs.spaceMarkers  ?? [],
                        accessories:   cs.accessories   ?? [],
                        powerChains:   cs.powerChains   ?? [],
                        ligatures:     cs.ligatures     ?? [],
                        upperArchwire: cs.upperArchwire ?? undefined,
                        lowerArchwire: cs.lowerArchwire ?? undefined,
                      },
                    });
                  }
                }}
                className="text-sm font-semibold text-amber-700 underline hover:text-amber-900"
              >
                Exit time travel
              </button>
            </div>
          )}

          {/* ── Phase Hint Bar — non-enforcing clinical context ─────────────── */}
          {(!phaseHintDismissed) && (clinicalPhase || suggestedPhase) && (
            <PhaseHintBar
              clinicalPhase={clinicalPhase}
              suggestedPhase={suggestedPhase}
              onAcceptSuggestion={(phase) => {
                setClinicalPhase(phase);
                setSuggestedPhase(null);
              }}
              onDismiss={() => {
                setSuggestedPhase(null);
                setPhaseHintDismissed(true);
              }}
            />
          )}

          {/* Action Bar with Categories */}
          <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-2 z-10">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-4">Quick Actions:</div>
            
            <div className="flex items-center gap-1">
              {/* ── CLINICAL TAGGING ENGINE ─────────────────────────────────── */}

              {/* DIAGNOSIS */}
              <ActionBarCategory
                label="Diagnosis"
                icon={<Stethoscope className="w-3.5 h-3.5" />}
                isActive={activeActionBarCategory === 'diagnosis'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'diagnosis' ? null : 'diagnosis')}
                disabled={selectedToothIds.length === 0}
                variant="clinical"
              >
                <div className="p-3 w-52 flex flex-col gap-1.5">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Clinical Condition</div>
                  {DIAGNOSIS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => applyDiagnosis(opt.value as DiagnosisValue & string)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold text-left transition-all hover:shadow-sm"
                      style={{
                        background: `${opt.color}18`,
                        border: `1.5px solid ${opt.color}40`,
                        color: opt.color,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                      {opt.label}
                    </button>
                  ))}
                  <button
                    onClick={clearClinicalData}
                    className="mt-1 w-full px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-400 border border-slate-100 hover:border-slate-200 hover:text-slate-600 transition-all"
                  >
                    Clear All Tags
                  </button>
                </div>
              </ActionBarCategory>

              {/* ALIGNMENT (MALALIGNMENT) */}
              <ActionBarCategory
                label="Alignment"
                icon={<Move className="w-3.5 h-3.5" />}
                isActive={activeActionBarCategory === 'alignment'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'alignment' ? null : 'alignment')}
                disabled={selectedToothIds.length === 0}
                variant="clinical"
              >
                <div className="p-3 w-52 flex flex-col gap-1.5">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tooth Position</div>
                  {ALIGNMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => applyAlignment(opt.value as AlignmentValue & string)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold text-left transition-all hover:shadow-sm"
                      style={{
                        background: `${opt.color}18`,
                        border: `1.5px solid ${opt.color}40`,
                        color: opt.color,
                      }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
                      {opt.label}
                    </button>
                  ))}
                  <button
                    onClick={() => applyAlignment('rotated' as AlignmentValue & string)}
                    className="hidden"
                    aria-hidden="true"
                  />
                </div>
              </ActionBarCategory>

              {/* CONDITION */}
              <ActionBarCategory
                label="Condition"
                icon={<CircleDot className="w-3.5 h-3.5" />}
                isActive={activeActionBarCategory === 'condition'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'condition' ? null : 'condition')}
                disabled={selectedToothIds.length === 0}
                variant="clinical"
              >
                <div className="p-3 w-44 flex flex-col gap-1.5">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Band / Tube</div>
                  {CONDITION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => applyCondition(opt.value as ConditionValue & string)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold text-left border border-slate-100 text-slate-600 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all"
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </ActionBarCategory>

              {/* ALERTS (multi-select) */}
              <ActionBarCategory
                label={
                  <div className="flex items-center gap-1.5 relative">
                    Alerts
                    {hasActiveAlerts && (
                      <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                    )}
                  </div>
                }
                icon={
                  <div className="relative">
                    <ShieldAlert className={`w-3.5 h-3.5 ${hasActiveAlerts ? 'text-red-500' : ''}`} />
                    {hasActiveAlerts && (
                      <span className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-20" />
                    )}
                  </div>
                }
                isActive={activeActionBarCategory === 'alerts'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'alerts' ? null : 'alerts')}
                variant={hasActiveAlerts ? "danger" : "clinical"}
              >
                <div className="p-3 w-56 flex flex-col gap-1.5">

                  {/* ── Patient-level (global) alerts ── */}
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                    Patient Flags <span className="text-emerald-500 normal-case font-medium">(no tooth needed)</span>
                  </div>
                  {GLOBAL_ALERT_OPTIONS.map(opt => {
                    const isActive = globalAlerts.has(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleGlobalAlert(opt.value)}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold text-left transition-all hover:shadow-sm"
                        style={{
                          background: isActive ? `${opt.color}28` : `${opt.color}0d`,
                          border: `1.5px solid ${isActive ? opt.color : `${opt.color}40`}`,
                          color: opt.color,
                          boxShadow: isActive ? `0 0 0 2px ${opt.color}30` : undefined,
                        }}
                      >
                        <span className="text-base leading-none">{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {isActive && (
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-black" style={{ background: opt.color, color: '#fff' }}>
                            ON
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* ── Per-tooth alerts ── */}
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 mb-0.5">
                    Per-Tooth Flags <span className="text-blue-500 normal-case font-medium">(select tooth first)</span>
                  </div>
                  {TOOTH_ALERT_OPTIONS.map(opt => {
                    const isActive = selectedToothIds.some(id => {
                      const t = [...upperTeeth, ...lowerTeeth].find(x => x.id === id);
                      return t?.clinicalAlerts?.includes(opt.value);
                    });
                    const disabled = selectedToothIds.length === 0;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => !disabled && toggleAlert(opt.value)}
                        disabled={disabled}
                        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold text-left transition-all hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: isActive ? `${opt.color}28` : `${opt.color}0d`,
                          border: `1.5px solid ${isActive ? opt.color : `${opt.color}40`}`,
                          color: opt.color,
                          boxShadow: isActive ? `0 0 0 2px ${opt.color}30` : undefined,
                        }}
                      >
                        <span className="text-base leading-none">{opt.emoji}</span>
                        <span>{opt.label}</span>
                        {isActive && (
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-black" style={{ background: opt.color, color: '#fff' }}>
                            ON
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ActionBarCategory>

              {/* DIVIDER before bracket categories */}
              <div className="h-6 w-px bg-slate-200 mx-1" />



              <ActionBarCategory 
                label={isMolarSelected && !isNonMolarSelected ? "Appliances" : "Brackets"} 
                icon={<Square className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'brackets'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'brackets' ? null : 'brackets')}
                disabled={selectedToothIds.length === 0}
              >
                <div className="p-3 w-64">
                  <BracketActionPanel
                    isMolar={isMolarSelected}
                    isNonMolar={isNonMolarSelected}
                    initialConfig={{
                      action:        selectedBracketAction,
                      prescription:  selectedPrescription,
                      slotSize:      selectedSlotSize,
                      bondingOption: selectedBondingOption,
                      bondingHeight: selectedBondingHeight,
                      brand:         selectedBrand,
                    }}
                    brands={chartSettings.bracketBrands}
                    onApply={(bracketType, cfg) => {
                      // Sync panel state back to parent so other UI stays consistent
                      setSelectedBracketAction(cfg.action);
                      setSelectedPrescription(cfg.prescription);
                      setSelectedSlotSize(cfg.slotSize);
                      setSelectedBondingOption(cfg.bondingOption);
                      setSelectedBondingHeight(cfg.bondingHeight);
                      setSelectedBrand(cfg.brand as any);
                      bondBrackets(bracketType);
                      setActiveActionBarCategory(null);
                    }}
                  />
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

                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <div className={`relative w-8 h-[18px] rounded-full transition-colors ${
                      selectedCinchWire ? 'bg-blue-600' : 'bg-slate-200 group-hover:bg-slate-300'
                    }`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${
                        selectedCinchWire ? 'translate-x-[16px]' : 'translate-x-[2px]'
                      }`} />
                      <input
                        type="checkbox"
                        checked={selectedCinchWire}
                        onChange={(e) => setSelectedCinchWire(e.target.checked)}
                        className="sr-only"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Cinch Wire</span>
                  </label>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Upper Wire Range</div>
                    <div className="flex items-center gap-1">
                      <select
                        value={upperWireFrom}
                        onChange={(e) => setUpperWireFrom(Number(e.target.value))}
                        className="flex-1 px-1.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {UPPER_TOOTH_IDS.map(id => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                      <span className="text-[9px] font-bold text-slate-400">→</span>
                      <select
                        value={upperWireTo}
                        onChange={(e) => setUpperWireTo(Number(e.target.value))}
                        className="flex-1 px-1.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {UPPER_TOOTH_IDS.map(id => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Lower Wire Range</div>
                    <div className="flex items-center gap-1">
                      <select
                        value={lowerWireFrom}
                        onChange={(e) => setLowerWireFrom(Number(e.target.value))}
                        className="flex-1 px-1.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {LOWER_TOOTH_IDS.map(id => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                      <span className="text-[9px] font-bold text-slate-400">→</span>
                      <select
                        value={lowerWireTo}
                        onChange={(e) => setLowerWireTo(Number(e.target.value))}
                        className="flex-1 px-1.5 py-1 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {LOWER_TOOTH_IDS.map(id => (
                          <option key={id} value={id}>{id}</option>
                        ))}
                      </select>
                    </div>
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
                align="right"
              >
                <div className="flex items-center gap-1 p-1">
                  <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Class II" onClick={() => addElastic('class-II', '3/16"')} />
                  <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Class III" onClick={() => addElastic('class-III', '3/16"')} />
                  <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Triangle" onClick={() => addElastic('triangle', '1/4"')} />
                </div>
              </ActionBarCategory>

              <ActionBarCategory 
                label="Chains" 
                icon={<Grid className="w-3.5 h-3.5" />} 
                isActive={activeActionBarCategory === 'chains'}
                onClick={() => setActiveActionBarCategory(activeActionBarCategory === 'chains' ? null : 'chains')}
                disabled={selectedMiniscrewId ? selectedToothIds.length < 1 : selectedToothIds.length < 2}
                align="right"
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
                align="right"
              >
                <div className="flex items-center gap-1 p-1">
                  <ActionButton icon={<RefreshCw className="w-3.5 h-3.5" />} label="Comp. Coil" onClick={() => addAccessory('compressed-coil')} disabled={selectedToothIds.length < 2} />
                  <ActionButton icon={<RotateCcw className="w-3.5 h-3.5" />} label="Torque Spring" onClick={() => addAccessory('torque-spring')} disabled={selectedToothIds.length !== 1} />
                  <ActionButton icon={<Square className="w-3.5 h-3.5" />} label="Rot. Wedge" onClick={() => addAccessory('rotational-wedge')} disabled={selectedToothIds.length !== 1} />
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  <ActionButton icon={<LinkIcon className="w-3.5 h-3.5" />} label="Ligature" onClick={() => addLigature('continuous')} disabled={selectedToothIds.length < 2} />
                  <ActionButton icon={<Activity className="w-3.5 h-3.5" />} label="Fig-8 Lig." onClick={() => addLigature('figure8')} disabled={selectedToothIds.length < 2} />
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

          {/* ── GLOBAL STATUS SUMMARY BAR ── */}
          <StatusSummaryBar
            upperTeeth={upperTeeth}
            lowerTeeth={lowerTeeth}
            globalAlerts={globalAlerts}
            activeFilter={activeStatusFilter}
            hoverFilter={hoverStatusFilter}
            onFilterChange={(f) => { setActiveStatusFilter(f); setActiveOrthoFilter(null); }}
            onHoverChange={(f) => { setHoverStatusFilter(f); if (f) setHoverOrthoFilter(null); }}
          />

          {/* ── ORTHO STATUS BAR — mechanical/appliance findings ── */}
          <OrthoStatusBar
            upperTeeth={upperTeeth}
            lowerTeeth={lowerTeeth}
            upperArchwire={upperArchwire}
            lowerArchwire={lowerArchwire}
            powerChains={powerChains}
            elastics={elastics}
            appliances={appliances}
            miniscrews={miniscrews}
            iprMarkers={iprMarkers}
            activeFilter={activeOrthoFilter}
            hoverFilter={hoverOrthoFilter}
            onFilterChange={(f) => { setActiveOrthoFilter(f); setActiveStatusFilter(null); }}
            onHoverChange={(f) => { setHoverOrthoFilter(f); if (f) setHoverStatusFilter(null); }}
          />

          {/* ── Engine Live Status Badge — DB sync indicator ─────────────────── */}
          {(activeBondedCount > 0 || dbTads.length > 0) && (
            <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2 pointer-events-none">
              {activeBondedCount > 0 && (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold"
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#059669' }}
                  title="Bonded teeth loaded from database"
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                  {activeBondedCount} Bonded
                </div>
              )}
              {dbTads && dbTads.filter(t => t.status !== 'REMOVED').length > 0 && (
                <button
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-bold pointer-events-auto cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#7c3aed' }}
                  title="Click to remove all active TADs"
                  onClick={() => {
                    const activeCount = dbTads.filter(t => t.status === 'ACTIVE').length;
                    if (activeCount === 0) return;
                    if (window.confirm(`Remove all ${activeCount} active TADs from this case?`)) {
                      removeAllTadsMutation.mutate();
                    }
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block', boxShadow: '0 0 6px #8b5cf6' }} />
                  {miniscrews.length} TAD{miniscrews.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {/* Snapshot Mode Banner */}
          {isSnapshotMode && (
            <div className="flex items-center justify-between px-4 py-1.5 text-[11px] font-semibold"
              style={{ background: 'rgba(245,158,11,0.10)', borderBottom: '1px solid rgba(245,158,11,0.25)', color: '#b45309' }}>
              <span>Viewing snapshot — any edit will return to live mode</span>
              <button
                className="underline hover:text-amber-800 transition-colors"
                onClick={() => setIsSnapshotMode(false)}
              >
                Exit snapshot view
              </button>
            </div>
          )}

          {/* Main Chart Canvas — subtle opacity shift during preview mode */}
          <div
            className={`flex-1 overflow-auto relative transition-opacity duration-200 ${previewSnapshot ? 'opacity-90' : 'opacity-100'}`}
            ref={chartContainerRef}
          >
            <OrthodonticChartCanvas 
              upperTeeth={upperTeeth}
              lowerTeeth={lowerTeeth}
              selectedToothIds={selectedToothIds}
              selectedMiniscrewId={selectedMiniscrewId}
              onToothClick={handleToothClick}
              onToothContextMenu={handleToothContextMenu}
              onToothDoubleClick={handleToothDoubleClick}
              onAnchorClick={(tid, type) => {
                // Default interradicular (mesial) for apical clicks; preserve explicit IZC
                const defaultAnchor = type === 'infrazygomatic' ? 'infrazygomatic' : 'mesial';
                setMsForm(prev => ({ ...prev, anchorType: defaultAnchor as keyof ToothAnchors }));
                setMiniscrewConfig({ toothId: tid, anchorType: defaultAnchor as keyof ToothAnchors });
              }}
              onMiniscrewClick={(id) => setSelectedMiniscrewId(prev => prev === id ? null : id)}
              onTadContextMenu={handleTadContextMenu}
              elastics={elastics}
              appliances={appliances}
              miniscrews={miniscrews}
              iprMarkers={iprMarkers}
              spaceMarkers={spaceMarkers}
              powerChains={powerChains}
              accessories={accessories}
              ligatures={ligatures}
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
              removeMiniscrew={(id) => {
                // Shift+click quick-remove: routed through unified pipeline
                dispatchClinicalAction({
                  action: { type: 'TAD_REMOVED', payload: { tadId: id }, timestamp: Date.now(), source: 'ui' },
                  skipDuplicateCheck: true,
                  onApply: () => {
                    saveToHistory();
                    dispatch({ type: 'REMOVE_TAD', payload: id });
                    logAction('Miniscrew removed (shift+click)');
                  },
                  onCommit: /^[a-f\d]{24}$/i.test(id) ? async () => {
                    await removeTadMutation.mutateAsync({
                      id,
                      payload: { reason: 'planned_removal', notes: 'Removed via shift+click' },
                    }).catch((err: any) => console.error('[TADEngine] Remove failed:', err?.message));
                  } : undefined,
                });
              }}
              removeIPRMarker={removeIPRMarker}
              removeSpaceMarker={removeSpaceMarker}
              removePowerChain={removePowerChain}
              removeAccessory={removeAccessory}
              removeLigature={removeLigature}
              dimmedToothIds={dimmedToothIds}
              caseId={effectiveCaseId}
            />
          </div>

          {/* ── TOOTH ACTION POPUP (right-click) ── */}
          <AnimatePresence>
            {actionPopup && activeTooth && (
              <ToothActionPopup
                tooth={activeTooth}
                position={actionPopup}
                onClose={() => setActionPopup(null)}
                // ── Bracket props (BracketActionPanel SSOT) ──
                defaultBracketConfig={{
                  action:        selectedBracketAction,
                  prescription:  selectedPrescription,
                  slotSize:      selectedSlotSize,
                  bondingOption: selectedBondingOption,
                  bondingHeight: selectedBondingHeight,
                  brand:         selectedBrand,
                }}
                bracketBrands={chartSettings.bracketBrands}
                onBracketApply={singleBracketApply}
                onRemoveBracket={singleRemoveBracket}
                onDebond={handleOpenDebondModal}
                // ── Clinical props ──
                onDiagnosis={singleDiagnosis}
                onAlignment={singleAlignment}
                onToggleAlert={singleToggleAlert}
                onClearClinical={singleClearClinical}
              />
            )}
          </AnimatePresence>

          {/* ── TOOTH INFO POPUP (double-click) ── */}
          <AnimatePresence>
            {infoPopup && activeTooth && (
              <ToothInfoPopup
                tooth={activeTooth}
                position={infoPopup}
                onClose={() => setInfoPopup(null)}
                actions={actions}
              />
            )}
          </AnimatePresence>

          {/* ── Miniscrew Context Menu (right-click on placed TAD) ── */}
          <AnimatePresence>
            {miniscrewContextMenu && (
              <MiniscrewContextMenu
                tadId={miniscrewContextMenu.id}
                position={{ x: miniscrewContextMenu.x, y: miniscrewContextMenu.y }}
                currentStatus={miniscrewContextMenu.status}
                onHeal={handleMiniscrewHeal}
                onFail={handleMiniscrewFail}
                onRemove={handleMiniscrewRemove}
                onClose={() => setMiniscrewContextMenu(null)}
              />
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
                      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Tooth {miniscrewConfig.toothId}</p>
                    </div>
                    <button
                      onClick={() => setMiniscrewConfig(null)}
                      className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Placement Position */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Placement Position</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: 'mesial',         label: 'Mesial (Interradicular)' },
                          { key: 'distal',         label: 'Distal (Interradicular)' },
                          { key: 'apical',         label: 'Apical (Root End)' },
                          { key: 'infrazygomatic', label: 'Infrazygomatic Crest' },
                        ] as const).map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => {
                              setMsForm(prev => ({ ...prev, anchorType: opt.key as keyof ToothAnchors }));
                              setMiniscrewConfig(prev => prev ? { ...prev, anchorType: opt.key as keyof ToothAnchors } : prev);
                            }}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all text-left ${
                              msForm.anchorType === opt.key
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {/* Live position preview */}
                      <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Resolved Position</p>
                        <p className="text-xs font-semibold text-blue-700">
                          {getMiniscrewPositionLabel(miniscrewConfig.toothId, msForm.anchorType as import('../utils/miniscrewUtils').MiniscrewAnchorType)}
                        </p>
                      </div>
                    </div>

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

          {/* Old Miniscrew Removal Modal — replaced by MiniscrewContextMenu (right-click) */}

{/* Prescription & OPG Reference Modal */}
          <PrescriptionOPGModal
            open={showOPGModal}
            onClose={() => setShowOPGModal(false)}
            prescription={selectedPrescription}
            onBondGroup={handleBondFromOPG}
            bondedByGroup={bondingEngine.getBondingByGroup()}
            opgUrl={primaryOpgUrl}
            opgRecords={opgRecords}
          />

          {/* ── Duplicate Bonding Confirmation Modal ──────────────────────────── */}
          {/* Shown when clinician attempts to bond teeth that already have ACTIVE records. */}
          {/* Backend handles it as REBONDED — this just ensures clinical intent. */}
          <AnimatePresence>
            {dupeBondConfirm && (
              <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 overflow-hidden"
                >
                  {/* Header */}
                  <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-amber-600 text-sm font-black">!</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Teeth already bonded</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {dupeBondConfirm.alreadyBondedTeeth.length === 1
                          ? `Tooth ${dupeBondConfirm.alreadyBondedTeeth[0]} already has an active bracket.`
                          : `Teeth ${dupeBondConfirm.alreadyBondedTeeth.join(', ')} already have active brackets.`
                        } Do you want to rebond?
                      </p>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="px-5 py-4 flex gap-2">
                    <button
                      onClick={() => setDupeBondConfirm(null)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        bondingEngine.applyBonding(dupeBondConfirm.pendingPayload).catch(
                          (err: any) => console.error('[BondingEngine] Rebond failed:', err?.message)
                        );
                        setDupeBondConfirm(null);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      ↺ Rebond
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ── TODO Suggestion Modal (PART 1 & 2) ─────────────────────────────── */}
          {/* Non-blocking bottom-right float — shown after alignment action on bracketed tooth */}
          <AnimatePresence>
            {pendingTodoSuggestion && (
              <TodoSuggestionModal
                toothId={pendingTodoSuggestion.toothId}
                alignment={pendingTodoSuggestion.alignment}
                suggestions={pendingTodoSuggestion.suggestions}
                onConfirm={(selected) =>
                  handleTodoSuggestionConfirm(selected, pendingTodoSuggestion.toothId)
                }
                onIgnore={() => setPendingTodoSuggestion(null)}
              />
            )}
          </AnimatePresence>

          {/* ── Debond Modal (PART 3) ─────────────────────────────────────────── */}
          {/* Shown when clinician clicks "Debonded" in the right-click popup */}
          <AnimatePresence>
            {debondModal && (
              <DebondModal
                toothId={debondModal.toothId}
                onRebondNow={handleDebondRebondNow}
                onAddTodo={handleDebondAddTodo}
                onCancel={() => setDebondModal(null)}
              />
            )}
          </AnimatePresence>

          {/* Chart Settings Modal */}
          <ChartSettingsModal
            open={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            settings={chartSettings}
            onSettingsChange={(newSettings) => {
setChartSettings(newSettings);
              // If selected brand no longer in list, reset to first brand
              if (!newSettings.bracketBrands.includes(selectedBrand) && newSettings.bracketBrands.length > 0) {
                setSelectedBrand(newSettings.bracketBrands[0]);
              }
            }}
          />
        </div>

        {/* ── RIGHT PANEL: Clinical TODOs ─────────────────────────────────── */}
        {/* Dual-sidebar system: Left = Actions (AppointmentActionPanel), Right = TODOs */}
        <AnimatePresence>
          {showTodoPanel && (
            <motion.div
              key="todo-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="border-l border-slate-200 flex-shrink-0 overflow-hidden"
              style={{ width: 280 }}
            >
              <TodoSidebar
                caseId={effectiveCaseId}
                patientId={appointment.patientId}
                visitId={null}
                suggestions={chartSuggestions}
                onClearSuggestion={(index) =>
                  setChartSuggestions(prev => prev.filter((_, i) => i !== index))
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Phase 5: Clinical Timeline Panel ────────────────────────────── */}
        <AnimatePresence>
          {showTimelinePanel && effectiveCaseId && (
            <motion.div
              key="timeline-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="border-l border-slate-200 flex-shrink-0 overflow-hidden"
              style={{ width: 288 }}
            >
              <ClinicalTimelinePanel
                caseId={effectiveCaseId}
                activeEventId={timeTravelEventId}
                onTimeTravelTo={(eventId) => setTimeTravelEventId(eventId)}
                onExitTimeTravel={() => {
                  setTimeTravelEventId(null);
                  if (derivedClinical?.derivedState) {
                    const cs = derivedClinical.derivedState as Snapshot['chartState'];
                    dispatch({
                      type: 'HYDRATE_SNAPSHOT',
                      payload: {
                        upperTeeth:    cs.upperTeeth    ?? UPPER_TEETH,
                        lowerTeeth:    cs.lowerTeeth    ?? LOWER_TEETH,
                        elastics:      cs.elastics      ?? [],
                        appliances:    cs.appliances    ?? [],
                        iprMarkers:    cs.iprMarkers    ?? [],
                        spaceMarkers:  cs.spaceMarkers  ?? [],
                        accessories:   cs.accessories   ?? [],
                        powerChains:   cs.powerChains   ?? [],
                        ligatures:     cs.ligatures     ?? [],
                        upperArchwire: cs.upperArchwire ?? undefined,
                        lowerArchwire: cs.lowerArchwire ?? undefined,
                      },
                    });
                  }
                }}
                onClose={() => setShowTimelinePanel(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
          </>
        )}
      </div>

      {/* Error Modal */}
      <AppModal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        onConfirm={async () => setIsErrorModalOpen(false)}
        title="Error"
        description={errorModalMessage}
        type="danger"
        confirmText="OK"
      />

      <DuplicateActionModal
        open={duplicateModal.open}
        actionLabel={duplicateModal.actionLabel}
        contextParams={duplicateModal.contextParams}
        onClose={() => setDuplicateModal(prev => ({ ...prev, open: false }))}
        onConfirm={duplicateModal.onConfirm}
      />

      {/* Edit Snapshot Metadata Modal (Phase V3) */}
      <EditSnapshotModal
        snapshot={editingSnapshot}
        isOpen={editingSnapshot !== null}
        isSaving={updateMeta.isPending}
        onClose={() => setEditingSnapshot(null)}
        onSave={(id, patch) => {
          updateMeta.mutate({ id, patch }, {
            onSuccess: () => setEditingSnapshot(null),
          });
        }}
      />

      {/* ── Clinical Assistant FAB — Phase V3 Command Engine ───────────────── */}
      {/* Connects to dispatchClinicalAction + clinicalActionGuard automatically.
          Ctrl+K shortcut opens/closes. Escape dismisses. */}
      <ClinicalAssistant
        dispatch={dispatch}
        chartState={{
          upperArchwire: chartState.upperArchwire,
          lowerArchwire: chartState.lowerArchwire,
          powerChains:   chartState.powerChains,
          elastics:      chartState.elastics,
          miniscrews:    chartState.miniscrews?.map(ms => ({ id: ms.id, toothId: ms.toothId ?? 0, position: ms.anchorType ?? 'mesial' })),
          ligatures:     chartState.ligatures?.map(l => ({ toothId: (l.toothIds?.[0] ?? 0), type: l.type ?? '' })),
          iprMarkers:    chartState.iprMarkers?.map(m => ({ toothId: m.toothId ?? 0, amount: parseFloat(m.value) || 0 })),
        }}
        saveToHistory={saveToHistory}
        logAction={logAction}
        visitId={activeVisitRef.current?.id ?? null}
        visitStatus={activeVisit?.status ?? null}
        caseId={effectiveCaseId ?? null}
        patientId={appointment.patientId ?? null}
        onAddNote={(text) => {
          const newNotes = notes ? `${notes}\n${text}` : text;
          setNotes(newNotes);
          // Phase 3: persist immediately (don't wait for debounce — user clicked "Add to Notes")
          const visitId = activeVisitRef.current?._id;
          if (visitId) {
            updateVisitNotesMutation.mutate({ visitId, notes: newNotes });
          }
        }}
      />

      {/* ── Phase 6: Draft Recovery Modal ─────────────────────────────────── */}
      {/* Appears ONCE when a crash-interrupted draft is found on session open. */}
      <DraftRecoveryModal
        isOpen={showDraftRecovery}
        draft={recoveryDraft}
        onRestore={(draft) => {
          const cs = draft.chartState as any;
          dispatch({
            type: 'HYDRATE_SNAPSHOT',
            payload: {
              upperTeeth:    cs.upperTeeth    ?? undefined,
              lowerTeeth:    cs.lowerTeeth    ?? undefined,
              elastics:      cs.elastics      ?? [],
              appliances:    cs.appliances    ?? [],
              iprMarkers:    cs.iprMarkers    ?? [],
              spaceMarkers:  cs.spaceMarkers  ?? [],
              accessories:   cs.accessories   ?? [],
              powerChains:   cs.powerChains   ?? [],
              ligatures:     cs.ligatures     ?? [],
              upperArchwire: cs.upperArchwire ?? undefined,
              lowerArchwire: cs.lowerArchwire ?? undefined,
            },
          });
          if (draft.notes) setNotes(draft.notes);
          clearDraft();
          setShowDraftRecovery(false);
          toast.success('Session restored from auto-save draft', { duration: 3000 });
        }}
        onDiscard={() => {
          clearDraft();
          setShowDraftRecovery(false);
        }}
      />

      {/* ── P0-6: localStorage Draft Recovery Modal ────────────────────────── */}
      {/* Replaces the old silent auto-hydration. User MUST explicitly confirm  */}
      {/* before any localStorage chart state is applied to the reducer.        */}
      <DraftRecoveryModal
        isOpen={showLocalStorageDraftRecovery}
        draft={localStorageDraft as any}
        onRestore={(draft) => {
          const cs = (draft as any).chartState as any;
          if (cs) {
            saveToHistory(); // capture current state as undo checkpoint
            dispatch({
              type: 'HYDRATE_SNAPSHOT',
              payload: {
                upperTeeth:    cs.upperTeeth    ?? undefined,
                lowerTeeth:    cs.lowerTeeth    ?? undefined,
                elastics:      cs.elastics      ?? [],
                appliances:    cs.appliances    ?? [],
                iprMarkers:    cs.iprMarkers    ?? [],
                spaceMarkers:  cs.spaceMarkers  ?? [],
                accessories:   cs.accessories   ?? [],
                powerChains:   cs.powerChains   ?? [],
                ligatures:     cs.ligatures     ?? [],
                upperArchwire: cs.upperArchwire ?? undefined,
                lowerArchwire: cs.lowerArchwire ?? undefined,
              },
            });
          }
          // Clear draft from localStorage after user has accepted it
          try { localStorage.removeItem(`chart_draft_${effectiveCaseId}`); } catch (_) {}
          setLocalStorageDraft(null);
          setShowLocalStorageDraftRecovery(false);
          toast.success('Local draft restored — remember to save when done', { duration: 4000 });
        }}
        onDiscard={() => {
          // User rejected the draft — remove it so it never appears again
          try { localStorage.removeItem(`chart_draft_${effectiveCaseId}`); } catch (_) {}
          setLocalStorageDraft(null);
          setShowLocalStorageDraftRecovery(false);
        }}
      />
    </div>
  );
};

// Helper Components
function ActionBarCategory({ label, icon, children, isActive, onClick, disabled, variant = 'default', align = 'left' }: { 
  label: React.ReactNode, 
  icon: React.ReactNode, 
  children: React.ReactNode,
  isActive: boolean,
  onClick: () => void,
  disabled?: boolean,
  /** 'default' = blue active, 'clinical' = indigo active, 'danger' = rose active */
  variant?: 'default' | 'clinical' | 'danger',
  /** Controls which edge the popover anchors to. Use 'right' for right-side toolbar items to prevent off-screen overflow. */
  align?: 'left' | 'right',
}) {
  const activeClass =
    variant === 'danger'
      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
      : variant === 'clinical'
      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
      : 'bg-blue-600 text-white border-blue-600 shadow-sm';

  // ── Portal positioning ────────────────────────────────────────────────────
  // Measure the trigger button's screen rect so we can anchor the dropdown
  // at the correct viewport-relative coordinates when rendered into #portal-root.
  // This is necessary because the dropdown is rendered OUTSIDE the SnapshotEditor
  // DOM tree (and thus outside any stacking context created by position:fixed
  // parents, transforms, or will-change — specifically the OPG modal z-[1000]).
  const btnRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = React.useState<{ top: number; left: number; right?: number } | null>(null);

  React.useEffect(() => {
    if (!isActive || !btnRef.current) {
      setDropdownPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    // 8px gap between button bottom and dropdown top
    const top  = rect.bottom + 8;
    const left = align === 'right' ? undefined : rect.left;
    const right = align === 'right' ? window.innerWidth - rect.right : undefined;
    setDropdownPos({ top, left: left ?? 0, right });
  }, [isActive, align]);

  return (
    <div className="relative">
      <button 
        ref={btnRef}
        disabled={disabled}
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
          disabled 
            ? 'text-slate-300 border-transparent cursor-not-allowed' 
            : isActive 
              ? activeClass
              : 'text-slate-500 hover:bg-slate-50 border-transparent hover:border-slate-200'
        }`}
      >
        {icon}
        <span>{label}</span>
        {!disabled && <ChevronDown className={`w-3 h-3 transition-transform ${isActive ? 'rotate-180' : ''}`} />}
      </button>

      {/* ── Dropdown via Portal — escapes ALL parent stacking contexts ── */}
      {/* Without this, the dropdown renders behind the OPG modal (z-[1000]) */}
      {/* even though ActionBarCategory sets z-[1100], because SnapshotEditor */}
      {/* (z-[200]) is a stacking context ancestor that caps child z-indices. */}
      <AnimatePresence>
        {isActive && !disabled && dropdownPos && (
          <Portal>
            <motion.div 
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                ...(align === 'right'
                  ? { right: dropdownPos.right }
                  : { left: dropdownPos.left }
                ),
              }}
              className="bg-white border border-slate-200 shadow-xl rounded-2xl z-[9999] min-w-max"
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </motion.div>
          </Portal>
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

// ─── Phase 4: Conflict Modal Styles ──────────────────────────────────────────

const conflictOverlayStyle: React.CSSProperties = {
  position:        'fixed',
  inset:           0,
  zIndex:          99999,
  background:      'rgba(0,0,0,0.55)',
  display:         'flex',
  alignItems:      'center',
  justifyContent:  'center',
  backdropFilter:  'blur(4px)',
};

const conflictBoxStyle: React.CSSProperties = {
  background:    '#fff',
  borderRadius:  '16px',
  padding:       '28px 32px',
  maxWidth:      '400px',
  width:         '90%',
  boxShadow:     '0 20px 60px rgba(0,0,0,0.25)',
  textAlign:     'center',
};

const conflictPrimaryBtnStyle: React.CSSProperties = {
  flex:          1,
  padding:       '10px 0',
  background:    '#3b82f6',
  color:         '#fff',
  border:        'none',
  borderRadius:  '8px',
  fontSize:      '14px',
  fontWeight:    600,
  cursor:        'pointer',
};

const conflictSecondaryBtnStyle: React.CSSProperties = {
  flex:          1,
  padding:       '10px 0',
  background:    '#f1f5f9',
  color:         '#374151',
  border:        '1px solid #e2e8f0',
  borderRadius:  '8px',
  fontSize:      '14px',
  cursor:        'pointer',
};

export default SnapshotEditor;

