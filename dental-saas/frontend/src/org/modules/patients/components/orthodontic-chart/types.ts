/**
 * types.ts — Orthodontic Chart Type Definitions
 * =============================================
 * All clinical orthodontic types used by the chart rendering engine.
 * This file is the single source of truth for data models.
 */

import React from 'react';

export type ToothStatus = 
  | 'healthy' 
  | 'bracket' 
  | 'molar-tube' 
  | 'band' 
  | 'alert' 
  | 'missing' 
  | 'extracted'
  | 'impacted'
  | 'unerupted'
  | 'repositioning'
  | 'root-resorption'
  | 'rotated'
  | 'displaced-buccally'
  | 'displaced-lingually'
  | 'mesial-out'
  | 'mesial-in'
  | 'distal-out'
  | 'distal-in'
  | 'tip-mesial'
  | 'tip-distal'
  | 'torque'
  | 'buccal-root-torque'
  | 'lingual-root-torque';

export type ElasticType = 'class-ii' | 'class-iii' | 'settling' | 'power-chain';
export type ElasticSize = '1/8"' | '3/16"' | '1/4"' | '5/16"' | '3/8"' | 'Continuous';

export type PowerChainType = 'open' | 'long' | 'closed';
export type PowerChainDirection = 'mesial' | 'distal' | 'anterior' | 'posterior';

export interface PowerChainConfig {
  id: string;
  type: PowerChainType;
  color: string;
  anchorTeeth: number[];
  activeTeeth: number[];
  direction?: PowerChainDirection;
  isUpper: boolean;
  miniscrewId?: string;
}

export type ArchwireMaterial = 'NiTi' | 'SS' | 'TMA' | 'Copper NiTi' | 'None';
export type ArchwireSize = '0.012' | '0.014' | '0.016' | '0.018' | '0.020' | '16x22' | '17x25' | '19x25' | '21x25' | 'None';

export interface ArchwireConfig {
  material: ArchwireMaterial;
  size: ArchwireSize;
  cinched?: boolean;
  fromToothId?: number;
  toToothId?: number;
  brand?: string;
}

export type LigatureType = 'continuous' | 'figure8';

export interface LigatureConfig {
  id: string;
  toothIds: number[];
  type: LigatureType;
  isUpper: boolean;
}
export type BracketPrescription = 'MBT' | 'Roth' | 'Bidimensional' | 'Standard Edgewise' | 'Ricketts';
export type BracketSlotSize = '0.022' | '0.018';
export type BracketBrand = string;
export type ApplianceType = 'TPA' | 'Lingual Arch' | 'Nance' | 'Quad Helix' | 'Mini Screw' | 'Anterior Retraction' | 'En-masse Retraction' | 'Distalization';

export interface Appliance {
  id: string;
  type: ApplianceType;
  toothIds: number[];
  isUpper: boolean;
}

export interface ElasticConnection {
  id: string;
  toothIds: number[];
  type: ElasticType;
  size: ElasticSize;
  brand?: string;
}

export interface ChartSettings {
  notationSystem: 'fdi' | 'palmer' | 'both';
  bracketBrands: string[];
  archwireBrands: string[];
  elasticBrands: string[];
}

export type ToothAnchors = {
  mesial: { x: number; y: number };
  distal: { x: number; y: number };
  apical: { x: number; y: number };
  infrazygomatic?: { x: number; y: number };
};

export interface Miniscrew {
  id: string;
  toothId: number;
  anchorType: 'mesial' | 'distal' | 'apical' | 'infrazygomatic';
  angle: number;
  length?: string;
  diameter?: string;
  brand?: string;
  /**
   * Clinical lifecycle status.
   * Drives visual color (Part 5) and TODO auto-generation on failure (Part 4).
   *   active   → blue   (default after placement)
   *   healing  → amber  (flagged for monitoring)
   *   failed   → red    (bracket lost osseointegration → auto TODO)
   *   removed  → gray   (physically removed, stays in chart as ghost)
   */
  status?: 'active' | 'healing' | 'failed' | 'removed';
  forceArrow?: {
    targetToothId: number;
    targetAnchorType: keyof ToothAnchors;
    magnitude: string;
  };
}

export interface IPRMarker {
  id: string;
  toothId: number;
  anchorType: 'mesial' | 'distal';
  value: string;
}

export interface SpaceMarker {
  id: string;
  toothId: number;
  anchorType: 'mesial' | 'distal';
  value: string;
}

export type AccessoryType = 'compressed-coil' | 'torque-spring' | 'rotational-wedge';

export interface Accessory {
  id: string;
  type: AccessoryType;
  toothIds: number[];
  isUpper: boolean;
}

export interface Action {
  id: string;
  type: string;
  tooth: string;
  description: string;
  timestamp: number;
}

export interface AppointmentState {
  actions: Action[];
  notes: string;
  attachments: { id: string; file: File; preview?: string }[];
}

export interface Snapshot {
  /** Backend MongoDB _id (string form) */
  id: string;
  caseId: string;
  appointmentId: string | null;
  /** Human-readable display label. Editable via PATCH. */
  name: string;
  /** Backend-resolved canonical visit time (ISO string from server) */
  snapshotDate?: string;
  /** Snapshot type: diagnostic | pretreatment | treatment | post-treatment */
  type?: 'diagnostic' | 'pretreatment' | 'treatment' | 'post-treatment';
  /** Soft-delete flag — soft-deleted snapshots are excluded from all list queries */
  isDeleted?: boolean;
  actions: Action[];
  notes: string;
  attachments: { id: string; file?: File; preview?: string; url?: string }[];
  chartState: {
    upperTeeth: ToothData[];
    lowerTeeth: ToothData[];
    elastics: ElasticConnection[];
    appliances: Appliance[];
    powerChains: PowerChainConfig[];
    miniscrews: Miniscrew[];
    iprMarkers: IPRMarker[];
    spaceMarkers: SpaceMarker[];
    accessories: Accessory[];
    ligatures?: LigatureConfig[];
    upperArchwire?: ArchwireConfig;
    lowerArchwire?: ArchwireConfig;
    /**
     * Bonding Engine — stores only Bonding._id references.
     * Do NOT store full bonding objects here — resolve from Bonding Engine cache.
     * Spec: chartState.bondingIds = [bondingId] (ID-only, no duplication)
     */
    bondingIds?: string[];
  };
  thumbnail: string;
  /** Unix ms timestamp for UI display (derived from createdAt) */
  createdAt: number;
}

// ─── Hybrid Event Engine — Phase 2 ───────────────────────────────────────────
// Reducer manages ALL chart state. Single source of truth for clinical UI state.

export interface ChartState {
  upperTeeth: ToothData[];
  lowerTeeth: ToothData[];
  miniscrews: Miniscrew[];
  upperArchwire: ArchwireConfig | undefined;
  lowerArchwire: ArchwireConfig | undefined;
  elastics: ElasticConnection[];
  appliances: Appliance[];
  powerChains: PowerChainConfig[];
  accessories: Accessory[];
  ligatures: LigatureConfig[];
  iprMarkers: IPRMarker[];
  spaceMarkers: SpaceMarker[];
}

export type ChartAction =
  // ── TADs (Phase 1) ──────────────────────────────────────────────────────────
  | { type: 'HYDRATE_TADS';      payload: Miniscrew[] }
  | { type: 'PLACE_TAD';         payload: Miniscrew }
  | { type: 'REMOVE_TAD';        payload: string }
  | { type: 'FAIL_TAD';          payload: string }
  | { type: 'HEAL_TAD';          payload: string }
  // ── Archwires (Phase 1) ─────────────────────────────────────────────────────
  | { type: 'SET_ARCHWIRE';      payload: { arch: 'upper' | 'lower'; wire: ArchwireConfig } }
  | { type: 'REMOVE_ARCHWIRE';   payload: { arch: 'upper' | 'lower' } }
  // ── Teeth (Phase 2) ─────────────────────────────────────────────────────────
  | { type: 'HYDRATE_TEETH';     payload: { upper: ToothData[]; lower: ToothData[] } }
  /** @deprecated Use granular SET_TOOTH_* actions. Kept for undo/HYDRATE_SNAPSHOT compatibility. */
  | { type: 'UPDATE_TEETH';      payload: { upper: ToothData[]; lower: ToothData[] } }
  // ── Granular Tooth Actions (Phase 2 — V3 Event Sourcing) ────────────────────
  // Each action targets ONE tooth by toothId. Use dispatchClinicalAction + loop for multi-tooth.
  | { type: 'SET_TOOTH_STATUS';    payload: { toothId: number; status: ToothStatus } }
  | { type: 'SET_TOOTH_BONDING';   payload: { toothId: number; status: ToothStatus; prescription?: string; slotSize?: string; brand?: string; bondingHeight?: number; bondingOption?: string; prescriptionValues?: Record<string, unknown> } }
  | { type: 'SET_TOOTH_DIAGNOSIS'; payload: { toothId: number; diagnosis: string | null; clearAlignment?: boolean; clearCondition?: boolean; clearAlerts?: boolean } }
  | { type: 'SET_TOOTH_ALIGNMENT'; payload: { toothId: number; alignment: string | null } }
  | { type: 'SET_TOOTH_CONDITION'; payload: { toothId: number; condition: string | null } }
  | { type: 'TOGGLE_TOOTH_ALERT';  payload: { toothId: number; alert: string } }
  | { type: 'CLEAR_TOOTH';         payload: { toothId: number } }
  // ── Snapshot (Phase 2) ──────────────────────────────────────────────────────
  | { type: 'HYDRATE_SNAPSHOT';  payload: Partial<ChartState> }
  | { type: 'RESET_CHART' }
  // ── Elastics (Phase 2) ──────────────────────────────────────────────────────
  | { type: 'ADD_ELASTIC';       payload: ElasticConnection }
  | { type: 'REMOVE_ELASTIC';    payload: string }
  // ── Appliances (Phase 2) ────────────────────────────────────────────────────
  | { type: 'REMOVE_APPLIANCE';  payload: string }
  // ── PowerChains (Phase 2) ───────────────────────────────────────────────────
  | { type: 'ADD_POWERCHAIN';    payload: PowerChainConfig }
  | { type: 'REMOVE_POWERCHAIN'; payload: string }
  // ── Accessories (Phase 2) ───────────────────────────────────────────────────
  | { type: 'ADD_ACCESSORY';     payload: Accessory }
  | { type: 'REMOVE_ACCESSORY';  payload: string }
  // ── Ligatures (Phase 2) ─────────────────────────────────────────────────────
  | { type: 'ADD_LIGATURE';      payload: LigatureConfig }
  | { type: 'REMOVE_LIGATURE';   payload: string }
  // ── IPR Markers (Phase 2) ───────────────────────────────────────────────────
  | { type: 'ADD_IPR';           payload: IPRMarker }
  | { type: 'REMOVE_IPR';        payload: string }
  // ── Space Markers (Phase 2) ─────────────────────────────────────────────────
  | { type: 'ADD_SPACE';                   payload: SpaceMarker }
  | { type: 'REMOVE_SPACE';               payload: string }
  // ── True Clinical Snapshot v2 (Phase 3) ─────────────────────────────────────
  | { type: 'HYDRATE_BONDING_SNAPSHOT';   payload: Array<{ tooth: number; prescription?: string; slot?: string; brand?: string; bondingHeight?: number; bondingPosition?: string; status?: string }> }
  | { type: 'HYDRATE_TAD_SNAPSHOT';       payload: Array<{ toothId: number; anchorType?: string; angle?: number; brand?: string; diameter?: string; length?: string; status?: string; id?: string }> }
  // ── Phase 5.1: Shared Clinical Event (server-pushed incremental sync) ────────
  // Allows dispatching a raw ClinicalEvent document directly into the reducer.
  // The reducer delegates to applyClinicalEvent() from clinicalReducer.ts.
  // Use for: real-time sync, optimistic event application, collaborative editing.
  | { type: 'APPLY_CLINICAL_EVENT';        payload: { type: string; payload?: Record<string, unknown>; version?: number; eventId?: string } };



export interface Appointment {
  id: string;
  patientId: string;
  caseId: string;
  date: string;
  time: string;
  type: string;
  doctor: string;
  status: 'scheduled' | 'checked-in' | 'in-progress' | 'completed' | 'cancelled';
  snapshotId?: string;
  notes?: string;
}

// ── Clinical Tagging Engine — structured diagnostic data ─────────────────────

export type DiagnosisValue =
  | 'caries'
  | 'root_canal'
  | 'badly_decayed'
  | 'missing'
  | 'extracted'
  | null;

export type AlignmentValue =
  | 'rotated'
  | 'displaced_buccal'
  | 'displaced_lingual'
  | 'impacted'
  | 'mesial_out'
  | 'distal_out'
  | 'mesial_in'
  | 'distal_in'
  | null;

export type ConditionValue =
  | 'normal'
  | 'band'
  | 'molar_tube'
  | null;

export type AlertValue =
  | 'medical_alert'
  | 'root_resorption'
  | 'poor_hygiene'
  | 'anchorage_loss';

export interface ClinicalStatus {
  diagnosis: DiagnosisValue;
  alignment: AlignmentValue;
  condition:  ConditionValue;
}

export interface ToothData {
  id: number;
  type: 'incisor' | 'canine' | 'premolar' | 'molar';
  /** Legacy flat status — kept for bracket/band/molar-tube/archwire compatibility */
  status: ToothStatus;
  isUpper: boolean;
  position: number;
  bracketColor?: string;
  alertNote?: string;
  prescription?: BracketPrescription;
  slotSize?: BracketSlotSize;
  brand?: BracketBrand;
  bondingHeight?: number;
  bondingOption?: 'marginal-ridges-level' | 'middle-middle' | 'custom';
  prescriptionValues?: { tip: number; torque: number; rotation?: number };
  anchors?: ToothAnchors;
  /** Structured clinical tagging layer — Phase 3.X Clinical Snapshot Engine */
  clinicalStatus?: ClinicalStatus;
  clinicalAlerts?: AlertValue[];
}

export const getPalmerNotation = (id: number): string => {
  const quadrant = Math.floor(id / 10);
  const position = id % 10;
  
  switch (quadrant) {
    case 1: return `${position}┘`;
    case 2: return `└${position}`;
    case 3: return `┌${position}`;
    case 4: return `${position}┐`;
    default: return id.toString();
  }
};

export const calculateAnchors = (id: number, type: string, isUpper: boolean): ToothAnchors => {
  const w = 40;
  const offset = 4;
  const spacing = 65;
  const gap = spacing - w;
  
  const quadrant = Math.floor(id / 10);
  const position = id % 10;
  const isRightSide = quadrant === 1 || quadrant === 4;
  
  const crownY = 55;
  const apicalY = 5;
  
  let mesialX, distalX;
  if (isRightSide) {
    mesialX = w - offset;
    distalX = offset;
  } else {
    mesialX = offset;
    distalX = w - offset;
  }
  
  let apicalX;
  if (isRightSide) {
    apicalX = w + (gap / 2);
  } else {
    apicalX = -(gap / 2);
  }
  
  return {
    mesial: { x: mesialX, y: crownY },
    distal: { x: distalX, y: crownY },
    apical: { x: apicalX, y: apicalY },
    infrazygomatic: (isUpper && (position === 6 || position === 7)) ? { x: w / 2, y: apicalY - 60 } : undefined
  };
};

/** Safe fallback when backend data arrives without anchors — UI must NEVER crash */
export const EMPTY_ANCHOR: ToothAnchors = {
  mesial: { x: 20, y: 55 },
  distal: { x: 20, y: 55 },
  apical: { x: 20, y: 5 },
};

/**
 * ensureAnchors — Normalizes tooth data from backend hydration.
 * Guarantees every tooth has a valid `anchors` object before rendering.
 * If `anchors` is missing/incomplete, fills with calculated defaults.
 *
 * RULE: UI must NEVER trust backend completeness.
 */
export function ensureAnchors(tooth: ToothData): ToothData {
  if (!tooth) return tooth;
  if (tooth.anchors && tooth.anchors.mesial && tooth.anchors.distal && tooth.anchors.apical) {
    return tooth;
  }
  return {
    ...tooth,
    anchors: {
      mesial:      tooth.anchors?.mesial      ?? EMPTY_ANCHOR.mesial,
      distal:      tooth.anchors?.distal      ?? EMPTY_ANCHOR.distal,
      apical:      tooth.anchors?.apical      ?? EMPTY_ANCHOR.apical,
      infrazygomatic: tooth.anchors?.infrazygomatic ?? undefined,
    },
  };
}

/**
 * normalizeTeeth — Ensures all teeth in an arch have valid anchors.
 * Apply on every hydration boundary (HYDRATE_TEETH, HYDRATE_SNAPSHOT).
 */
export function normalizeTeeth(teeth: ToothData[]): ToothData[] {
  if (!teeth || !Array.isArray(teeth)) return [];
  return teeth.map(ensureAnchors);
}

export const UPPER_TEETH: ToothData[] = [
  { id: 18, type: 'molar', status: 'healthy', isUpper: true, position: 8, anchors: calculateAnchors(18, 'molar', true) },
  { id: 17, type: 'molar', status: 'healthy', isUpper: true, position: 7, anchors: calculateAnchors(17, 'molar', true) },
  { id: 16, type: 'molar', status: 'healthy', isUpper: true, position: 6, anchors: calculateAnchors(16, 'molar', true) },
  { id: 15, type: 'premolar', status: 'healthy', isUpper: true, position: 5, anchors: calculateAnchors(15, 'premolar', true) },
  { id: 14, type: 'premolar', status: 'healthy', isUpper: true, position: 4, anchors: calculateAnchors(14, 'premolar', true) },
  { id: 13, type: 'canine', status: 'healthy', isUpper: true, position: 3, anchors: calculateAnchors(13, 'canine', true) },
  { id: 12, type: 'incisor', status: 'healthy', isUpper: true, position: 2, anchors: calculateAnchors(12, 'incisor', true) },
  { id: 11, type: 'incisor', status: 'healthy', isUpper: true, position: 1, anchors: calculateAnchors(11, 'incisor', true) },
  { id: 21, type: 'incisor', status: 'healthy', isUpper: true, position: 1, anchors: calculateAnchors(21, 'incisor', true) },
  { id: 22, type: 'incisor', status: 'healthy', isUpper: true, position: 2, anchors: calculateAnchors(22, 'incisor', true) },
  { id: 23, type: 'canine', status: 'healthy', isUpper: true, position: 3, anchors: calculateAnchors(23, 'canine', true) },
  { id: 24, type: 'premolar', status: 'healthy', isUpper: true, position: 4, anchors: calculateAnchors(24, 'premolar', true) },
  { id: 25, type: 'premolar', status: 'healthy', isUpper: true, position: 5, anchors: calculateAnchors(25, 'premolar', true) },
  { id: 26, type: 'molar', status: 'healthy', isUpper: true, position: 6, anchors: calculateAnchors(26, 'molar', true) },
  { id: 27, type: 'molar', status: 'healthy', isUpper: true, position: 7, anchors: calculateAnchors(27, 'molar', true) },
  { id: 28, type: 'molar', status: 'healthy', isUpper: true, position: 8, anchors: calculateAnchors(28, 'molar', true) },
];

export const LOWER_TEETH: ToothData[] = [
  { id: 48, type: 'molar', status: 'healthy', isUpper: false, position: 8, anchors: calculateAnchors(48, 'molar', false) },
  { id: 47, type: 'molar', status: 'healthy', isUpper: false, position: 7, anchors: calculateAnchors(47, 'molar', false) },
  { id: 46, type: 'molar', status: 'healthy', isUpper: false, position: 6, anchors: calculateAnchors(46, 'molar', false) },
  { id: 45, type: 'premolar', status: 'healthy', isUpper: false, position: 5, anchors: calculateAnchors(45, 'premolar', false) },
  { id: 44, type: 'premolar', status: 'healthy', isUpper: false, position: 4, anchors: calculateAnchors(44, 'premolar', false) },
  { id: 43, type: 'canine', status: 'healthy', isUpper: false, position: 3, anchors: calculateAnchors(43, 'canine', false) },
  { id: 42, type: 'incisor', status: 'healthy', isUpper: false, position: 2, anchors: calculateAnchors(42, 'incisor', false) },
  { id: 41, type: 'incisor', status: 'healthy', isUpper: false, position: 1, anchors: calculateAnchors(41, 'incisor', false) },
  { id: 31, type: 'incisor', status: 'healthy', isUpper: false, position: 1, anchors: calculateAnchors(31, 'incisor', false) },
  { id: 32, type: 'incisor', status: 'healthy', isUpper: false, position: 2, anchors: calculateAnchors(32, 'incisor', false) },
  { id: 33, type: 'canine', status: 'healthy', isUpper: false, position: 3, anchors: calculateAnchors(33, 'canine', false) },
  { id: 34, type: 'premolar', status: 'healthy', isUpper: false, position: 4, anchors: calculateAnchors(34, 'premolar', false) },
  { id: 35, type: 'premolar', status: 'healthy', isUpper: false, position: 5, anchors: calculateAnchors(35, 'premolar', false) },
  { id: 36, type: 'molar', status: 'healthy', isUpper: false, position: 6, anchors: calculateAnchors(36, 'molar', false) },
  { id: 37, type: 'molar', status: 'healthy', isUpper: false, position: 7, anchors: calculateAnchors(37, 'molar', false) },
  { id: 38, type: 'molar', status: 'healthy', isUpper: false, position: 8, anchors: calculateAnchors(38, 'molar', false) },
];

// ═══ Cases Module Types ═══════════════════════════════════════════════

export interface CephAnalysisData {
  SNA?: number;
  SNB?: number;
  ANB?: number;
  MMP?: number;
  U1_PP?: number;
  L1_MP?: number;
  CVM?: string;
}

export interface AnalysisInterpretation {
  skeletal?: string;
  vertical?: string;
  dental?: string;
}

export interface PhotoAnalysis {
  ceph?: CephAnalysisData;
  interpretation?: AnalysisInterpretation;
  [key: string]: any; // Backward-compat with legacy flat data
}

export interface PhotoRecord {
  id: string;
  type: string;
  label: string;
  /**
   * Persistent server URL (https:// or /uploads/...).
   * ONLY this field is saved to the database.
   * null = photo slot is empty (no upload yet).
   */
  url: string | null;
  /**
   * Transient preview URL — blob: URL created from the local File
   * during upload. Used for immediate UI feedback only.
   * MUST NEVER be saved to the database or sent in any API payload.
   * Cleared automatically when upload completes (url is set).
   */
  previewUrl?: string | null;
  aspectRatio: string;
  orientation: 'portrait' | 'landscape';
  flipH: boolean;
  flipV: boolean;
  rotation?: number; // degrees, defaults to 0
  crop: { x: number; y: number; width: number; height: number } | null;
  analysis?: PhotoAnalysis;
}

// ── Print Layout Canvas ──────────────────────────────────────────────────────

export interface PrintLayoutBaseItem {
  id: string;      // unique item id
  x: number;       // pixels from canvas left
  y: number;       // pixels from canvas top
  width: number;   // px
  height: number;  // px
}

export interface PrintLayoutImageItem extends PrintLayoutBaseItem {
  type: 'image';
  recordId: string;          // references PhotoRecord.id
  objectFit?: 'cover' | 'contain' | 'fill';
  showLabel?: boolean;       // overlay label at bottom
}

export interface PrintLayoutTextItem extends PrintLayoutBaseItem {
  type: 'text';
  content: string;           // text content
  fontSize?: number;         // px, defaults 14
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;       // defaults 'Georgia, serif'
  color?: string;            // defaults '#1e293b'
  textAlign?: 'left' | 'center' | 'right';
  background?: string;       // optional fill
  border?: string;           // optional border css
}

export type PrintLayoutItem = PrintLayoutImageItem | PrintLayoutTextItem;

export interface PrintLayout {
  items: PrintLayoutItem[];
  canvasWidth: number;       // e.g. 1122 (A4 landscape at 96dpi)
  canvasHeight: number;      // e.g. 794
  updatedAt?: string;
}

export interface RecordSet {
  id: string;
  name: string;
  type?: 'PRE' | 'MID' | 'POST' | 'CUSTOM';
  date: string;
  version?: number;
  records: PhotoRecord[];
  chiefComplaint: string;
  audioUrl: string | null;
  stlFiles: { id: string; name: string; url: string }[];
  /**
   * Cast Analysis — embedded in the record set lifecycle.
   * input:  the raw form data entered by the clinician
   * result: the deterministic computed output (space, Bolton, Ashley Howe)
   * savedAt: ISO timestamp of when the clinician clicked "Save Analysis"
   */
  castAnalysis?: {
    input:   Record<string, any>;
    result:  Record<string, any>;
    savedAt: string;
  };
  problemList?: {
    pathological: {
      caries: string;
      missingTeeth: string;
      impactedTeeth: string;
      extraTeeth: string;
      ankylosedTeeth: string;
      nonRestorable: string;
      other: string;
    };
    developmental: {
      esthetics: {
        frontalSmile: string;
        frontalRest: string;
        profile: string;
      };
      spaceEruption: {
        maxilla: string;
        mandible: string;
      };
      functional: {
        none: boolean;
        tmd: boolean;
        swallowing: boolean;
        speech: boolean;
        smile: boolean;
        mastication: boolean;
      };
      transverse: {
        skeletal: boolean;
        dental: boolean;
      };
      apProblems: {
        skeletal: 'class1' | 'class2' | 'class3' | null;
        dental: {
          molarClass: string;
          canineClass: string;
          incisalClass: string;
          increasedOverjet: string;
          anteriorCrossbite: string;
        };
      };
      verticalProblems: {
        skeletal: 'open-bite' | 'deep-bite' | null;
        dental: 'open-bite' | 'deep-bite' | null;
      };
      other: string;
    };
  };
  treatmentPlan?: {
    typeOfTreatment: {
      orthopaedic: boolean;
      orthognathic: boolean;
      orthodontic: boolean;
    };
    typeOfAppliance: {
      maxilla: 'fixed' | 'removable' | 'fixed-removable' | null;
      mandible: 'fixed' | 'removable' | 'fixed-removable' | null;
      details: string;
    };
    bracketSystem: 'metal' | 'clear' | 'clear-metal-slot' | null;
    ligationSystem: 'conventional' | 'self-ligating' | null;
    slotSize: '0.018' | '0.022' | 'bidimensional' | null;
    prescription: 'ROTH' | 'MBT' | 'other' | null;
    company: string;
    spaceRequirement: {
      extraction: boolean;
      nonExtraction: boolean;
      attemptNonExtraction: boolean;
      ipr: boolean;
      expansion: boolean;
      distalization: boolean;
    };
    anchorageRequirements: {
      maxilla: 'minimum' | 'moderate' | 'maximum' | null;
      mandible: 'minimum' | 'moderate' | 'maximum' | null;
      details: string;
    };
    disarticulation: 'yes' | 'no' | null;
    specialConsideration: string;
    retention: {
      maxilla: 'fixed' | 'essix' | 'hawley' | null;
      mandible: 'fixed' | 'essix' | 'hawley' | null;
      details: string;
    };
  };
}

export interface TimelineEntry {
  visitId: string;
  visitNumber: number;
  visitDate: string;
  type: Snapshot['type'] | null;
  phaseId: string | null;
  appointmentId: string | null;
  snapshotId: string | null;
  snapshotVersion: number | null;
  procedures: string[] | any[];
  notes: {
    clinical: string;
    administrative: string;
  };
  thumbnail: string | null;
  /** Visit session status — 'active' | 'completed' | 'cancelled' */
  status?: string | null;
}

export interface Case {
  id: string;
  patientId: string;
  caseType: string;
  status: string;
  startDate: string;
  expectedEndDate?: string;
  progress: number;
  timeline: TimelineEntry[];
  problemList: string[];
  treatmentPlan: string[];
  recordSets: RecordSet[];
}

export interface LabOrder {
  id: string;
  caseId: string;
  type: 'Aligners' | 'Retainers' | 'Expanders' | 'Orthodontic Appliances';
  labName: string;
  status: 'Pending' | 'Sent' | 'In Production' | 'Received' | 'Completed';
  dateSent: string;
  expectedDelivery: string;
}
