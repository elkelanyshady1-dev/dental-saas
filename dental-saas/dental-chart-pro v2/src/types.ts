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
  brand?: string;
}
export type BracketPrescription = 'MBT' | 'Roth' | 'Bidimensional' | 'Standard Edgewise' | 'Ricketts';
export type BracketSlotSize = '0.022' | '0.018';
export type BracketBrand = string;
export type ApplianceType = 'TPA' | 'Lingual Arch' | 'Nance' | 'Quad Helix' | 'Mini Screw' | 'Anterior Retraction' | 'En-masse Retraction' | 'Distalization';

export interface Appliance {
  id: string;
  type: ApplianceType;
  toothIds: number[]; // Usually connects two molars
  isUpper: boolean;
}

export interface ElasticConnection {
  id: string;
  toothIds: number[];
  type: ElasticType;
  size: ElasticSize;
  brand?: string;
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
  toothIds: number[]; // Compressed coil might need 2 teeth, others 1
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
  id: string;
  caseId: string;
  appointmentId: string;
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
    upperArchwire?: ArchwireConfig;
    lowerArchwire?: ArchwireConfig;
  };
  thumbnail: string;
  createdAt: number;
}

export interface TimelineEntry {
  id: string;
  date: string;
  actions: string[];
  notes: string;
  snapshotId?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  caseId: string;
  date: string;
  time: string;
  type: string;
  doctor: string;
  status: 'scheduled' | 'checked-in' | 'completed' | 'cancelled';
  snapshotId?: string;
}

export interface PhotoRecord {
  id: string;
  type: string;
  label: string;
  url: string | null;
  aspectRatio: string; // '7:5' | '4:3' | '16:9'
  orientation: 'portrait' | 'landscape';
  flipH: boolean;
  flipV: boolean;
  crop: { x: number, y: number, width: number, height: number } | null;
  analysis?: {
    [key: string]: string;
  };
}

export interface RecordSet {
  id: string;
  name: string;
  date: string;
  records: PhotoRecord[];
  chiefComplaint: string;
  audioUrl: string | null;
  stlFiles: { id: string; name: string; url: string }[];
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

export interface ToothData {
  id: number;
  type: 'incisor' | 'canine' | 'premolar' | 'molar';
  status: ToothStatus;
  isUpper: boolean;
  position: number; // 1-8 from midline
  bracketColor?: string;
  alertNote?: string;
  prescription?: BracketPrescription;
  slotSize?: BracketSlotSize;
  brand?: BracketBrand;
  bondingHeight?: number;
  bondingOption?: 'marginal-ridges-level' | 'middle-middle' | 'custom';
  prescriptionValues?: { tip: number; torque: number; rotation?: number };
  anchors: ToothAnchors;
  targetPosition?: { x: number; y: number };
}

export const getPalmerNotation = (id: number): string => {
  const quadrant = Math.floor(id / 10);
  const position = id % 10;
  
  switch (quadrant) {
    case 1: return `${position}┘`; // Upper Right
    case 2: return `└${position}`; // Upper Left
    case 3: return `┌${position}`; // Lower Left
    case 4: return `${position}┐`; // Lower Right
    default: return id.toString();
  }
};

export const calculateAnchors = (id: number, type: string, isUpper: boolean): ToothAnchors => {
  const w = 40;
  const offset = 4;
  const spacing = 65;
  const gap = spacing - w; // 25px gap between teeth
  
  const quadrant = Math.floor(id / 10);
  const position = id % 10;
  const isRightSide = quadrant === 1 || quadrant === 4;
  
  // Canonical orientation (Maxillary): Root UP (y=5), Crown DOWN (y=55)
  // This will be flipped for Mandibular teeth in the UI
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
  
  // Place the apical anchor in the mesial interproximal space
  // For right side teeth (18-11, 48-41), mesial is towards the right (increasing x)
  // For left side teeth (21-28, 31-38), mesial is towards the left (decreasing x)
  let apicalX;
  if (isRightSide) {
    apicalX = w + (gap / 2); // Center of the gap to the right
  } else {
    apicalX = -(gap / 2); // Center of the gap to the left
  }
  
  return {
    mesial: { x: mesialX, y: crownY },
    distal: { x: distalX, y: crownY },
    apical: { x: apicalX, y: apicalY },
    infrazygomatic: (isUpper && (position === 6 || position === 7)) ? { x: w / 2, y: apicalY - 60 } : undefined
  };
};

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
