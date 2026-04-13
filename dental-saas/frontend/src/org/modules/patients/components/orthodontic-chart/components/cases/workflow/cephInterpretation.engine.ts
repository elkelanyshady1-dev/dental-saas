/**
 * cephInterpretation.engine.ts
 * ═══════════════════════════════════════════════════════════════════════
 * Orthodontic Cephalometric Interpretation Engine — Phase 3.X
 *
 * PURE DETERMINISTIC FUNCTIONS — no side effects, no API calls.
 *
 * Reads flat analysis data as stored in PhotoRecord.analysis (OrthoRecordsTab):
 *   { sna: '90', snb: '78', anb: '6', wits: '5', mmp: '29', ... }
 *
 * KEY MAPPING (CEPH_MEASUREMENTS ids from OrthoRecordsTab):
 *   'sna'       → SNA
 *   'snb'       → SNB
 *   'anb'       → ANB
 *   'wits'      → Wits appraisal
 *   'mmp'       → MMP (SN-GoGn)
 *   'maxsn'     → Max/SN
 *   'mandbsn'   → Mandb/SN
 *   'u1pp'      → U1/PP
 *   'l1mandb'   → L1/Mandb
 *   'u1l1'      → U1/L1
 *   'yaxis'     → Y axis angle
 *   'lfhtfh'    → LFH/TFH
 *   'nasolabial'→ Nasolabial angle
 *   'cvmStage'  → CVM computed stage
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── Norms (aligned with OrthoRecordsTab CEPH_MEASUREMENTS) ────────────────────

export interface CephNorm {
  mean:  number;
  tol:   number;   // 1 SD tolerance
  unit:  string;
  label: string;
  brief: string;   // short clinical name
}

export const CEPH_NORMS_ENGINE: Record<string, CephNorm> = {
  sna:        { mean: 83,  tol: 3,   unit: '°',  label: 'SNA',               brief: 'Maxillary A-P position' },
  snb:        { mean: 80,  tol: 3,   unit: '°',  label: 'SNB',               brief: 'Mandibular A-P position' },
  anb:        { mean: 2,   tol: 2,   unit: '°',  label: 'ANB',               brief: 'Skeletal relationship' },
  wits:       { mean: 0.3, tol: 2.6, unit: ' mm', label: 'Wits appraisal',   brief: 'Sagittal jaw relation' },
  mmp:        { mean: 25,  tol: 3,   unit: '°',  label: 'MMP',               brief: 'Mandibular plane angle' },
  maxsn:      { mean: 9.8, tol: 3,   unit: '°',  label: 'Max/SN',            brief: 'Maxillary plane tilt' },
  mandbsn:    { mean: 32,  tol: 5,   unit: '°',  label: 'Mandb/SN',          brief: 'Mandibular plane tilt' },
  u1pp:       { mean: 112, tol: 5,   unit: '°',  label: 'U1/PP',             brief: 'Upper incisor inclination' },
  l1mandb:    { mean: 98,  tol: 6,   unit: '°',  label: 'L1/Mandb',          brief: 'Lower incisor inclination' },
  u1l1:       { mean: 128, tol: 5,   unit: '°',  label: 'U1/L1',             brief: 'Inter-incisal angle' },
  yaxis:      { mean: 59,  tol: 2,   unit: '°',  label: 'Y axis angle',      brief: 'Growth direction' },
  lfhtfh:     { mean: 55,  tol: 2,   unit: '%',  label: 'LFH/TFH',           brief: 'Vertical face proportion' },
  nasolabial: { mean: 102, tol: 8,   unit: '°',  label: 'Nasolabial angle',  brief: 'Soft tissue lip angle' },
};

// ── Status types ───────────────────────────────────────────────────────────────

export type MeasurementStatus = 'increased' | 'decreased' | 'normal';

export interface CephStatus {
  value:      number;
  status:     MeasurementStatus;
  deviation:  number;       // positive = above norm, negative = below
  severity:   'normal' | 'mild' | 'moderate' | 'severe';
}

// ── Core classifier ────────────────────────────────────────────────────────────

export function getMeasurementStatus(value: number, norm: CephNorm): CephStatus {
  const deviation = parseFloat((value - norm.mean).toFixed(2));
  const absDev    = Math.abs(deviation);

  let status: MeasurementStatus = 'normal';
  if (deviation > norm.tol)  status = 'increased';
  if (deviation < -norm.tol) status = 'decreased';

  let severity: CephStatus['severity'] = 'normal';
  if (absDev > 0) {
    if (absDev <= norm.tol)        severity = 'mild';
    if (absDev > norm.tol)         severity = 'mild';
    if (absDev > norm.tol * 1.5)   severity = 'moderate';
    if (absDev > norm.tol * 2.5)   severity = 'severe';
  }

  return { value, status, deviation, severity };
}

// ── Sagittal diagnosis engine ─────────────────────────────────────────────────

export interface SagittalDiagnosis {
  skeletalClass:  'I' | 'II' | 'III';
  mechanism:      string;
  summary:        string;
}

export function sagittalDiagnosis(
  sna: number | undefined,
  snb: number | undefined,
  anb: number | undefined,
  wits?: number | undefined,
): SagittalDiagnosis {
  if (anb === undefined) {
    return { skeletalClass: 'I', mechanism: 'Insufficient data', summary: 'Enter ANB to classify skeletal relationship' };
  }

  const snaN = sna !== undefined ? getMeasurementStatus(sna, CEPH_NORMS_ENGINE.sna) : null;
  const snbN = snb !== undefined ? getMeasurementStatus(snb, CEPH_NORMS_ENGINE.snb) : null;
  const anbN = getMeasurementStatus(anb, CEPH_NORMS_ENGINE.anb);

  // CLASS II
  if (anbN.status === 'increased') {
    let mechanism = 'Combined maxilla/mandible dysplasia';
    if (snaN?.status === 'increased' && snbN?.status !== 'decreased') {
      mechanism = 'Prognathic maxilla (SNA elevated)';
    } else if (snbN?.status === 'decreased' && snaN?.status !== 'increased') {
      mechanism = 'Retrognathic mandible (SNB reduced)';
    } else if (snaN?.status === 'increased' && snbN?.status === 'decreased') {
      mechanism = 'Combined: prognathic maxilla + retrognathic mandible';
    }
    return {
      skeletalClass: 'II',
      mechanism,
      summary: `Skeletal Class II — ${mechanism}`,
    };
  }

  // CLASS III
  if (anbN.status === 'decreased') {
    let mechanism = 'Combined maxilla/mandible dysplasia';
    if (snaN?.status === 'decreased' && snbN?.status !== 'increased') {
      mechanism = 'Retrognathic maxilla (SNA reduced)';
    } else if (snbN?.status === 'increased' && snaN?.status !== 'decreased') {
      mechanism = 'Prognathic mandible (SNB elevated)';
    } else if (snaN?.status === 'decreased' && snbN?.status === 'increased') {
      mechanism = 'Combined: retrognathic maxilla + prognathic mandible';
    }
    return {
      skeletalClass: 'III',
      mechanism,
      summary: `Skeletal Class III — ${mechanism}`,
    };
  }

  // CLASS I
  return {
    skeletalClass: 'I',
    mechanism: 'Normal maxillomandibular relationship',
    summary: 'Skeletal Class I — Normal sagittal pattern',
  };
}

// ── Vertical diagnosis engine ──────────────────────────────────────────────────

export interface VerticalDiagnosis {
  pattern: 'high' | 'normal' | 'low';
  growthContext: string;
  summary: string;
}

export function verticalDiagnosis(
  mmp: number | undefined,
  cvmStage?: string,
): VerticalDiagnosis {
  if (mmp === undefined) {
    return { pattern: 'normal', growthContext: '', summary: 'Enter MMP to assess vertical pattern' };
  }

  const mmpN = getMeasurementStatus(mmp, CEPH_NORMS_ENGINE.mmp);
  const growing      = ['CVMS1', 'CVMS2', 'CVMS3'].includes(cvmStage ?? '');
  const earlyPostPeak = cvmStage === 'CVMS4';          // CVMS4 only — minor modification possible
  const growthCeased  = ['CVMS5', 'CVMS6'].includes(cvmStage ?? ''); // CVMS5/6 — growth largely complete

  if (mmpN.status === 'increased') {
    const growthContext = growing
      ? '— Growing patient: orthopaedic intervention may redirect growth'
      : earlyPostPeak
        ? '— Post-peak (CVMS4): limited modification may still be possible'
        : growthCeased
          ? '— Growth largely ceased: camouflage treatment or orthognathic surgery indicated'
          : '— Mature skeleton: camouflage or surgery may be indicated';
    return {
      pattern: 'high',
      growthContext: cvmStage ? growthContext : '',
      summary: `High mandibular plane angle (MMP = ${mmp}°)${cvmStage ? ` ${growthContext}` : ''}`,
    };
  }

  if (mmpN.status === 'decreased') {
    return {
      pattern: 'low',
      growthContext: '',
      summary: `Low mandibular plane angle / Hypodivergent pattern (MMP = ${mmp}°)`,
    };
  }

  return {
    pattern: 'normal',
    growthContext: '',
    summary: 'Normal vertical (Normodivergent) pattern',
  };
}

// ── Dental analysis engine ─────────────────────────────────────────────────────

export interface DentalDiagnosis {
  upperIncisor: string;
  lowerIncisor: string;
  interIncisal?: string;
  summary: string;
}

export function dentalDiagnosis(
  u1pp: number | undefined,
  l1mandb: number | undefined,
  u1l1?: number | undefined,
): DentalDiagnosis {
  const u1N = u1pp !== undefined ? getMeasurementStatus(u1pp, CEPH_NORMS_ENGINE.u1pp) : null;
  const l1N = l1mandb !== undefined ? getMeasurementStatus(l1mandb, CEPH_NORMS_ENGINE.l1mandb) : null;
  const iiN = u1l1 !== undefined ? getMeasurementStatus(u1l1, CEPH_NORMS_ENGINE.u1l1) : null;

  const upper = u1N?.status === 'increased' ? 'Proclined upper incisors'
    : u1N?.status === 'decreased' ? 'Retroclined upper incisors'
    : 'Normal upper incisor inclination';

  const lower = l1N?.status === 'increased' ? 'Proclined lower incisors'
    : l1N?.status === 'decreased' ? 'Retroclined lower incisors'
    : 'Normal lower incisor inclination';

  // Combined bimaxillary pattern — MUST be computed before inter-incisal note
  const isBimaxillary = u1N?.status === 'increased' && l1N?.status === 'increased';

  // Inter-incisal angle note:
  // ─ In bimaxillary protrusion, increased U1/L1 is a secondary geometric consequence
  //   of both incisors being proclined — NOT evidence of retroclination.
  // ─ "Retroclined incisors" only applies when the incisors themselves show decreased
  //   inclination (U1/PP or L1/Mandb decreased), not when they are proclined.
  const interIncisal: string | undefined = (() => {
    if (!iiN || iiN.status === 'normal') return undefined;
    if (iiN.status === 'decreased') {
      return 'Decreased inter-incisal angle — consistent with bimaxillary protrusion';
    }
    // increased U1/L1
    if (isBimaxillary) {
      // Both incisors proclined → increased inter-incisal angle is geometrically consistent
      // with bimaxillary protrusion where each incisor is proclined relative to its own plane
      return 'Increased inter-incisal angle — both upper and lower incisors proclined (bimaxillary pattern)';
    }
    if (u1N?.status === 'decreased' || l1N?.status === 'decreased') {
      return 'Increased inter-incisal angle — retroclined incisors';
    }
    return 'Increased inter-incisal angle';
  })();

  const summary = isBimaxillary
    ? 'Bimaxillary dentoalveolar protrusion'
    : [upper !== 'Normal upper incisor inclination' ? upper : null,
       lower !== 'Normal lower incisor inclination' ? lower : null]
        .filter(Boolean).join('; ') || 'Normal incisor inclination (both arches)';

  return { upperIncisor: upper, lowerIncisor: lower, interIncisal, summary };
}

// ── Master interpretation ──────────────────────────────────────────────────────

export interface CephInterpretation {
  sagittal:  SagittalDiagnosis;
  vertical:  VerticalDiagnosis;
  dental:    DentalDiagnosis;
  /** True if any abnormality was detected */
  hasFindings: boolean;
}

/**
 * generateCephInterpretation
 *
 * Accepts flat analysis data (as stored by OrthoRecordsTab via CEPH_MEASUREMENTS):
 *   { sna: '90', snb: '78', anb: '6', wits: '5', mmp: '29',
 *     u1pp: '120', l1mandb: '106', u1l1: '135', cvmStage: 'CVMS5' }
 */
export function generateCephInterpretation(data: Record<string, any>): CephInterpretation {
  const p = (key: string): number | undefined => {
    const v = data[key];
    if (v === undefined || v === null || v === '') return undefined;
    const n = parseFloat(String(v));
    return isNaN(n) ? undefined : n;
  };

  const sag = sagittalDiagnosis(p('sna'), p('snb'), p('anb'), p('wits'));
  const vert = verticalDiagnosis(p('mmp'), data.cvmStage);
  const dent = dentalDiagnosis(p('u1pp'), p('l1mandb'), p('u1l1'));

  const hasFindings =
    sag.skeletalClass !== 'I' ||
    vert.pattern !== 'normal' ||
    dent.upperIncisor !== 'Normal upper incisor inclination' ||
    dent.lowerIncisor !== 'Normal lower incisor inclination';

  return { sagittal: sag, vertical: vert, dental: dent, hasFindings };
}
