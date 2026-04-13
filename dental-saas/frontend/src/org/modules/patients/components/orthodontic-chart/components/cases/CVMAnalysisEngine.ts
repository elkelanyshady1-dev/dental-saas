/**
 * CVMAnalysisEngine.ts
 * ════════════════════════════════════════════════════════════════════
 * Deterministic CVM (Cervical Vertebral Maturation) Stage Engine V2
 *
 * Input model aligns with the V2 spec:
 *   C2/C3/C4 lower border:  "flat" | "concave"
 *   C3/C4 shape:            "trapezoid" | "rectangular_horizontal" | "square" | "rectangular_vertical"
 *   manual_override_stage:  "CVMS1"–"CVMS6" | null
 *
 * Rule priority:
 *   1. Manual override (always wins)
 *   2. Deterministic rule cascade CVMS1 → CVMS6
 *   3. "TRANSITION" for mixed / partial matches
 *   4. "UNDETERMINED" for conflicting morphology
 *
 * All outputs are < 1ms (pure JS, no async).
 * ════════════════════════════════════════════════════════════════════
 */

// ── Types ───────────────────────────────────────────────────────────

export type BorderStatus  = 'flat' | 'concave' | '';
export type VertebralShape =
  | 'trapezoid'
  | 'rectangular_horizontal'
  | 'square'
  | 'rectangular_vertical'
  | '';

export type CVMStage =
  | 'CVMS1' | 'CVMS2' | 'CVMS3' | 'CVMS4' | 'CVMS5' | 'CVMS6'
  | 'TRANSITION' | 'UNDETERMINED' | '';

export interface CVMInput {
  C2_lower_border:       BorderStatus;
  C3_lower_border:       BorderStatus;
  C4_lower_border:       BorderStatus;
  C3_shape:              VertebralShape;
  C4_shape:              VertebralShape;
  manual_override_stage: CVMStage | null;
}

export interface CVMWarning {
  code:    string;
  message: string;
}

export interface CVMResult {
  stage:                   CVMStage;
  growth_status:           string;
  growth_timing:           string;      // "~2 years", "~1 year", "within 1 year", etc.
  badge_color:             'blue' | 'green' | 'orange' | 'gray';
  clinical_recommendations: string[];
  confidence:              number;      // 0–1
  source:                  'auto' | 'manual_override' | 'incomplete';
  warnings:                CVMWarning[];
}

// ── Growth Status Maps ──────────────────────────────────────────────

const STAGE_META: Record<
  Exclude<CVMStage, 'TRANSITION' | 'UNDETERMINED' | ''>,
  Pick<CVMResult, 'growth_status' | 'growth_timing' | 'badge_color' | 'clinical_recommendations'>
> = {
  CVMS1: {
    growth_status:           'Pre-Peak — Growth not yet started',
    growth_timing:           'Peak mandibular growth in ~2 years',
    badge_color:             'blue',
    clinical_recommendations: [
      'Monitor with annual records',
      'Delay functional appliances — too early',
      'Schedule recall in 12 months',
    ],
  },
  CVMS2: {
    growth_status:           'Pre-Peak — Growth approaching',
    growth_timing:           'Peak mandibular growth in ~1 year',
    badge_color:             'blue',
    clinical_recommendations: [
      'Begin growth modification planning',
      'Consider functional appliance in 6–12 months',
      'Take new lateral ceph in 6 months',
    ],
  },
  CVMS3: {
    growth_status:           'Peak — Growth active NOW',
    growth_timing:           'Peak mandibular growth within 1 year',
    badge_color:             'green',
    clinical_recommendations: [
      '✅ Start functional appliance immediately',
      'Growth modification window is ACTIVE',
      'Maximize skeletal correction now',
      'Monitor every 3–4 months',
    ],
  },
  CVMS4: {
    growth_status:           'Post-Peak — Growth decelerating',
    growth_timing:           'Peak passed 1–2 years ago',
    badge_color:             'orange',
    clinical_recommendations: [
      'Growth modification less effective',
      'Consider camouflage treatment or reassess',
      'Orthognathic surgery may be needed for severe cases',
    ],
  },
  CVMS5: {
    growth_status:           'Post-Peak — Growth largely complete',
    growth_timing:           'Peak ended >1 year ago',
    badge_color:             'orange',
    clinical_recommendations: [
      'Skeletal growth essentially complete',
      'Orthodontic camouflage or surgery planning',
      'No benefit from functional appliances',
    ],
  },
  CVMS6: {
    growth_status:           'Mature — Growth complete',
    growth_timing:           'Peak ended >2 years ago',
    badge_color:             'orange',
    clinical_recommendations: [
      'Skeletal growth complete',
      'Plan definitive orthodontic treatment',
      'Surgical correction if skeletal discrepancy present',
    ],
  },
};

// ── Conflict Detector ───────────────────────────────────────────────

function detectWarnings(input: CVMInput): CVMWarning[] {
  const warnings: CVMWarning[] = [];
  const { C3_shape, C4_shape, C3_lower_border, C4_lower_border } = input;

  // Square/vertical body with flat border = clinically inconsistent
  if ((C3_shape === 'square' || C3_shape === 'rectangular_vertical') && C3_lower_border === 'flat') {
    warnings.push({
      code:    'C3_MORPHOLOGY_CONFLICT',
      message: 'C3: Square/vertical body with flat border is inconsistent',
    });
  }
  if ((C4_shape === 'square' || C4_shape === 'rectangular_vertical') && C4_lower_border === 'flat') {
    warnings.push({
      code:    'C4_MORPHOLOGY_CONFLICT',
      message: 'C4: Square/vertical body with flat border is inconsistent',
    });
  }
  // C4 more mature than C3 is physiologically unlikely
  const shapeOrder: VertebralShape[] = [
    'trapezoid', 'rectangular_horizontal', 'square', 'rectangular_vertical',
  ];
  const c3Rank = shapeOrder.indexOf(C3_shape as VertebralShape);
  const c4Rank = shapeOrder.indexOf(C4_shape as VertebralShape);
  if (c3Rank >= 0 && c4Rank >= 0 && c4Rank > c3Rank + 1) {
    warnings.push({
      code:    'C4_AHEAD_OF_C3',
      message: 'C4 shape appears more mature than C3 — verify radiograph landmarks',
    });
  }

  return warnings;
}

// ── Main Engine ─────────────────────────────────────────────────────

export function determineCVMStage(input: CVMInput): CVMResult {
  const {
    C2_lower_border,
    C3_lower_border,
    C4_lower_border,
    C3_shape,
    C4_shape,
    manual_override_stage,
  } = input;

  // Guard — nothing selected yet
  const hasAnyInput = C2_lower_border || C3_lower_border || C4_lower_border || C3_shape || C4_shape;
  if (!hasAnyInput && !manual_override_stage) {
    return {
      stage: '',
      growth_status: 'No input provided',
      growth_timing: '',
      badge_color: 'gray',
      clinical_recommendations: [],
      confidence: 0,
      source: 'incomplete',
      warnings: [],
    };
  }

  const warnings = detectWarnings(input);

  // ── Priority 1: Manual Override ─────────────────────────────────
  if (Boolean(manual_override_stage)) {
    const meta = STAGE_META[manual_override_stage as keyof typeof STAGE_META];
    return {
      stage:                   manual_override_stage,
      growth_status:           meta?.growth_status ?? '',
      growth_timing:           meta?.growth_timing ?? '',
      badge_color:             meta?.badge_color ?? 'gray',
      clinical_recommendations: meta?.clinical_recommendations ?? [],
      confidence:              1.0,
      source:                  'manual_override',
      warnings,
    };
  }

  // Helpers
  const shapeIn = (shape: VertebralShape, ...allowed: VertebralShape[]) =>
    allowed.includes(shape);

  // ── CVMS 1 ─────────────────────────────────────────────────────
  if (
    C2_lower_border === 'flat' &&
    C3_lower_border === 'flat' &&
    C4_lower_border === 'flat' &&
    C3_shape === 'trapezoid' &&
    C4_shape === 'trapezoid'
  ) {
    return buildResult('CVMS1', 0.95, 'auto', warnings);
  }

  // ── CVMS 2 ─────────────────────────────────────────────────────
  if (
    C2_lower_border === 'concave' &&
    C3_lower_border === 'flat' &&
    C3_shape === 'trapezoid'
  ) {
    return buildResult('CVMS2', 0.92, 'auto', warnings);
  }

  // ── CVMS 3 ─────────────────────────────────────────────────────
  if (
    C2_lower_border === 'concave' &&
    C3_lower_border === 'concave' &&
    shapeIn(C3_shape, 'trapezoid', 'rectangular_horizontal') &&
    shapeIn(C4_shape, 'trapezoid', 'rectangular_horizontal')
  ) {
    return buildResult('CVMS3', 0.90, 'auto', warnings);
  }

  // ── CVMS 4 ─────────────────────────────────────────────────────
  if (
    C2_lower_border === 'concave' &&
    C3_lower_border === 'concave' &&
    C4_lower_border === 'concave' &&
    C3_shape === 'rectangular_horizontal' &&
    C4_shape === 'rectangular_horizontal'
  ) {
    return buildResult('CVMS4', 0.93, 'auto', warnings);
  }

  // ── CVMS 5 ─────────────────────────────────────────────────────
  if (
    shapeIn(C3_shape, 'square') ||
    shapeIn(C4_shape, 'square')
  ) {
    return buildResult('CVMS5', 0.88, 'auto', warnings);
  }

  // ── CVMS 6 ─────────────────────────────────────────────────────
  if (
    shapeIn(C3_shape, 'rectangular_vertical') ||
    shapeIn(C4_shape, 'rectangular_vertical')
  ) {
    return buildResult('CVMS6', 0.91, 'auto', warnings);
  }

  // ── Partial input — transition / undetermined ───────────────────
  const isPartial =
    !C2_lower_border || !C3_lower_border || !C4_lower_border || !C3_shape || !C4_shape;

  if (isPartial) {
    return {
      stage:                   'TRANSITION',
      growth_status:           'Incomplete inputs — fill all fields',
      growth_timing:           '',
      badge_color:             'gray',
      clinical_recommendations: [],
      confidence:              0,
      source:                  'incomplete',
      warnings,
    };
  }

  return {
    stage:                   'UNDETERMINED',
    growth_status:           'Conflicting morphology detected',
    growth_timing:           '',
    badge_color:             'gray',
    clinical_recommendations: ['Review radiograph landmarks', 'Consider manual override'],
    confidence:              0,
    source:                  'auto',
    warnings: [
      ...warnings,
      { code: 'CONFLICT', message: 'No deterministic stage matched — verify inputs' },
    ],
  };
}

// ── Builder ─────────────────────────────────────────────────────────

function buildResult(
  stage: keyof typeof STAGE_META,
  confidence: number,
  source: 'auto' | 'manual_override',
  warnings: CVMWarning[],
): CVMResult {
  const meta = STAGE_META[stage];
  return {
    stage,
    growth_status:           meta.growth_status,
    growth_timing:           meta.growth_timing,
    badge_color:             meta.badge_color,
    clinical_recommendations: meta.clinical_recommendations,
    confidence,
    source,
    warnings,
  };
}

// ── Helpers (re-exported for UI) ────────────────────────────────────

export const BORDER_OPTIONS: { id: BorderStatus; label: string }[] = [
  { id: 'flat',    label: 'Flat'    },
  { id: 'concave', label: 'Concave' },
];

export const SHAPE_OPTIONS: {
  id: VertebralShape;
  label: string;
  abbr: string;
  /** SVG path for the vertebra body thumbnail (30×30 viewport) */
  path: string;
}[] = [
  {
    id:    'trapezoid',
    label: 'Trapezoid',
    abbr:  'TRAP',
    path:  'M 5 18 L 25 18 L 22 8 L 8 8 Z',              // wider bottom
  },
  {
    id:    'rectangular_horizontal',
    label: 'Rectangular Horiz.',
    abbr:  'R-H',
    path:  'M 4 10 L 26 10 L 26 22 L 4 22 Z',             // wide rectangle
  },
  {
    id:    'square',
    label: 'Square',
    abbr:  'SQ',
    path:  'M 7 7 L 23 7 L 23 23 L 7 23 Z',              // square
  },
  {
    id:    'rectangular_vertical',
    label: 'Rectangular Vert.',
    abbr:  'R-V',
    path:  'M 9 4 L 21 4 L 21 26 L 9 26 Z',              // tall rectangle
  },
];
