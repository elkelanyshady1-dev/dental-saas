/**
 * workflowDerivation.ts
 * ═══════════════════════════════════════════════════════════════
 * Auto-derivation utilities for the orthodontic workflow:
 *   1. deriveProblemsFromCeph — Extracts structured problems from ceph analysis
 *   2. suggestOptionsFromProblems — Suggests treatment options based on problems
 * 
 * These are pure functions — no side effects, no API calls.
 * Called by the CaseWorkflowContainer on step transitions.
 * ═══════════════════════════════════════════════════════════════
 */

import { RecordSet } from '../../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DerivedProblem {
  id: string;
  category: 'skeletal' | 'dental' | 'soft-tissue' | 'functional' | 'esthetic';
  title: string;
  severity: 'mild' | 'moderate' | 'severe';
  source: 'auto' | 'manual' | 'algorithm';
  linkedData: string[];
}

export interface SuggestedOption {
  id: string;
  title: string;
  description: string;
  approach: 'conservative' | 'moderate' | 'aggressive';
  pros: string[];
  cons: string[];
  estimatedDuration: string;
  complexity: 'low' | 'medium' | 'high';
  isRecommended: boolean;
  extraction: boolean;
  appliances: string[];
}

// ─── Ceph Norms ───────────────────────────────────────────────────────────────

const CEPH_NORMS: Record<string, { norm: number; sd: number; label: string }> = {
  SNA:   { norm: 82, sd: 3.5, label: 'Maxillary anteroposterior position' },
  SNB:   { norm: 80, sd: 3.5, label: 'Mandibular anteroposterior position' },
  ANB:   { norm: 2, sd: 2, label: 'Skeletal relationship (Class)' },
  MMP:   { norm: 25, sd: 5, label: 'Mandibular plane angle' },
  U1_PP: { norm: 110, sd: 6, label: 'Upper incisor inclination' },
  L1_MP: { norm: 95, sd: 6, label: 'Lower incisor inclination' },
};

function classifySeverity(value: number, norm: number, sd: number): 'mild' | 'moderate' | 'severe' {
  const deviation = Math.abs(value - norm);
  if (deviation <= sd) return 'mild';
  if (deviation <= sd * 2) return 'moderate';
  return 'severe';
}

// ─── Problem Derivation from Ceph ─────────────────────────────────────────────

export function deriveProblemsFromCeph(data: RecordSet): DerivedProblem[] {
  const problems: DerivedProblem[] = [];

  // Find ceph record
  // DATA FORMAT: flat lowercase keys on PhotoRecord.analysis
  // { sna: '90', snb: '78', anb: '6', mmp: '29', u1pp: '120', l1mandb: '106' }
  const cephRecord = (data.records || []).find(r => r.id === 'ceph');
  const raw = cephRecord?.analysis;
  if (!raw) return problems;

  // Normalize flat lowercase keys → typed numbers (same as engine)
  const p = (key: string): number | undefined => {
    const v = raw[key];
    if (v === undefined || v === null || v === '') return undefined;
    const n = parseFloat(String(v));
    return isNaN(n) ? undefined : n;
  };

  // Map to uppercase-keyed object for the rest of this function
  const ceph = {
    ANB:   p('anb'),
    SNA:   p('sna'),
    SNB:   p('snb'),
    MMP:   p('mmp'),
    U1_PP: p('u1pp'),
    L1_MP: p('l1mandb'),
  };

  if (Object.values(ceph).every(v => v === undefined)) return problems;

  let problemIndex = 0;
  const makeId = () => `auto-prob-${Date.now()}-${problemIndex++}`;

  // ANB — Skeletal Class
  if (ceph.ANB !== undefined) {
    const anb = ceph.ANB;
    if (anb > 4) {
      problems.push({
        id: makeId(),
        category: 'skeletal',
        title: `Class II skeletal relationship (ANB = ${anb}°)`,
        severity: classifySeverity(anb, CEPH_NORMS.ANB.norm, CEPH_NORMS.ANB.sd),
        source: 'algorithm',
        linkedData: ['ANB'],
      });
    } else if (anb < 0) {
      problems.push({
        id: makeId(),
        category: 'skeletal',
        title: `Class III skeletal relationship (ANB = ${anb}°)`,
        severity: classifySeverity(anb, CEPH_NORMS.ANB.norm, CEPH_NORMS.ANB.sd),
        source: 'algorithm',
        linkedData: ['ANB'],
      });
    }
  }

  // SNA — Maxillary position
  if (ceph.SNA !== undefined) {
    const sna = ceph.SNA;
    if (sna > 85.5 || sna < 78.5) {
      problems.push({
        id: makeId(),
        category: 'skeletal',
        title: sna > 85.5
          ? `Maxillary prognathism (SNA = ${sna}°)`
          : `Maxillary retrognathism (SNA = ${sna}°)`,
        severity: classifySeverity(sna, CEPH_NORMS.SNA.norm, CEPH_NORMS.SNA.sd),
        source: 'algorithm',
        linkedData: ['SNA'],
      });
    }
  }

  // SNB — Mandibular position
  if (ceph.SNB !== undefined) {
    const snb = ceph.SNB;
    if (snb > 83.5 || snb < 76.5) {
      problems.push({
        id: makeId(),
        category: 'skeletal',
        title: snb > 83.5
          ? `Mandibular prognathism (SNB = ${snb}°)`
          : `Mandibular retrognathism (SNB = ${snb}°)`,
        severity: classifySeverity(snb, CEPH_NORMS.SNB.norm, CEPH_NORMS.SNB.sd),
        source: 'algorithm',
        linkedData: ['SNB'],
      });
    }
  }

  // MMP — Vertical pattern
  if (ceph.MMP !== undefined) {
    const mmp = ceph.MMP;
    if (mmp > 30) {
      problems.push({
        id: makeId(),
        category: 'skeletal',
        title: `High angle vertical pattern (MMP = ${mmp}°)`,
        severity: classifySeverity(mmp, CEPH_NORMS.MMP.norm, CEPH_NORMS.MMP.sd),
        source: 'algorithm',
        linkedData: ['MMP'],
      });
    } else if (mmp < 20) {
      problems.push({
        id: makeId(),
        category: 'skeletal',
        title: `Low angle vertical pattern (MMP = ${mmp}°)`,
        severity: classifySeverity(mmp, CEPH_NORMS.MMP.norm, CEPH_NORMS.MMP.sd),
        source: 'algorithm',
        linkedData: ['MMP'],
      });
    }
  }

  // U1/PP — Upper incisor inclination
  if (ceph.U1_PP !== undefined) {
    const u1 = ceph.U1_PP;
    if (u1 > 116 || u1 < 104) {
      problems.push({
        id: makeId(),
        category: 'dental',
        title: u1 > 116
          ? `Proclined upper incisors (U1/PP = ${u1}°)`
          : `Retroclined upper incisors (U1/PP = ${u1}°)`,
        severity: classifySeverity(u1, CEPH_NORMS.U1_PP.norm, CEPH_NORMS.U1_PP.sd),
        source: 'algorithm',
        linkedData: ['U1_PP'],
      });
    }
  }

  // L1/MP — Lower incisor inclination
  if (ceph.L1_MP !== undefined) {
    const l1 = ceph.L1_MP;
    if (l1 > 101 || l1 < 89) {
      problems.push({
        id: makeId(),
        category: 'dental',
        title: l1 > 101
          ? `Proclined lower incisors (L1/MP = ${l1}°)`
          : `Retroclined lower incisors (L1/MP = ${l1}°)`,
        severity: classifySeverity(l1, CEPH_NORMS.L1_MP.norm, CEPH_NORMS.L1_MP.sd),
        source: 'algorithm',
        linkedData: ['L1_MP'],
      });
    }
  }

  return problems;
}

// ─── Treatment Option Suggestion ──────────────────────────────────────────────

export function suggestOptionsFromProblems(problems: DerivedProblem[]): SuggestedOption[] {
  if (problems.length === 0) return [];

  const hasSkeletal = problems.some(p => p.category === 'skeletal');
  const hasSevere = problems.some(p => p.severity === 'severe');
  const skeletalCount = problems.filter(p => p.category === 'skeletal').length;
  const dentalCount = problems.filter(p => p.category === 'dental').length;
  const totalCount = problems.length;

  const options: SuggestedOption[] = [];

  // Option 1: Conservative
  options.push({
    id: `opt-conservative-${Date.now()}`,
    title: 'Conservative (Non-Extraction)',
    description: 'Alignment and leveling with arch expansion. Minimal intervention approach focusing on dental correction.',
    approach: 'conservative',
    pros: [
      'Preserves all teeth',
      'Shorter treatment time',
      'Lower cost',
      'Less invasive',
    ],
    cons: [
      ...(hasSkeletal ? ['Limited skeletal correction'] : []),
      'May require IPR for space management',
      'May not fully correct severe issues',
    ],
    estimatedDuration: totalCount <= 3 ? '12-18 months' : '18-24 months',
    complexity: totalCount <= 2 ? 'low' : 'medium',
    isRecommended: !hasSkeletal && !hasSevere && totalCount <= 3,
    extraction: false,
    appliances: ['Fixed brackets', 'Archwires', 'Elastics'],
  });

  // Option 2: Moderate
  options.push({
    id: `opt-moderate-${Date.now()}`,
    title: 'Moderate (Possible Extraction/IPR)',
    description: 'Fixed orthodontic appliance with extraction of premolars or IPR if needed. Balanced approach for moderate problems.',
    approach: 'moderate',
    pros: [
      'Good balance of correction and invasiveness',
      'Can correct moderate skeletal discrepancies',
      'Predictable results',
    ],
    cons: [
      'Possible tooth extraction',
      'Longer treatment time',
      'More appointments',
    ],
    estimatedDuration: '18-24 months',
    complexity: 'medium',
    isRecommended: !hasSevere && (hasSkeletal || totalCount > 3),
    extraction: hasSkeletal && dentalCount > 1,
    appliances: ['Fixed brackets', 'Archwires', 'Elastics', ...(hasSkeletal ? ['Class II/III mechanics'] : [])],
  });

  // Option 3: Comprehensive / Aggressive
  if (hasSkeletal || hasSevere || totalCount >= 4) {
    options.push({
      id: `opt-comprehensive-${Date.now()}`,
      title: 'Comprehensive (Full Mechanics)',
      description: 'Full fixed appliance therapy with skeletal anchorage (TADs). May include surgical consultation if severe skeletal discrepancy.',
      approach: 'aggressive',
      pros: [
        'Maximum correction potential',
        'Addresses skeletal and dental issues',
        'Best long-term stability',
      ],
      cons: [
        'Longer treatment (24-30+ months)',
        'Higher cost',
        'May require TADs or surgical consultation',
        'More complex mechanics',
      ],
      estimatedDuration: skeletalCount >= 2 ? '24-36 months' : '24-30 months',
      complexity: 'high',
      isRecommended: hasSevere || skeletalCount >= 2,
      extraction: skeletalCount >= 2,
      appliances: [
        'Fixed brackets',
        'Archwires',
        'TADs',
        ...(hasSevere ? ['Orthognathic surgery consultation'] : []),
        'Class II/III mechanics',
      ],
    });
  }

  return options;
}
