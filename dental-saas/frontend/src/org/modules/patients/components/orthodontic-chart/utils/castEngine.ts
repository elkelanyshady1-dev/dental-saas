/**
 * castEngine.ts
 * ════════════════════════════════════════════════════════════════
 * Client-side mirror of castAnalysis.service.js
 * Pure deterministic calculation — zero network calls.
 * Used for real-time UI updates (< 1ms per run).
 * ════════════════════════════════════════════════════════════════
 */

// ── Types ────────────────────────────────────────────────────────

export interface ArchSegment {
  /** Segments keyed s1–s4 (space available) */
  [key: string]: number | string;
}

export interface ArchInput {
  required: {
    right: (number | string)[]; // 6 teeth
    left:  (number | string)[]; // 6 teeth
  };
  available: {
    right: ArchSegment;         // S3 + S4
    left:  ArchSegment;         // S1 + S2
  };
}

export interface ToothSizeInput {
  upperAnterior: number | string;
  lowerAnterior: number | string;
  upperTotal:    number | string;
  lowerTotal:    number | string;
}

export interface AshleyInput {
  upperPM:    number | string;
  upperBasal: number | string;
  lowerPM:    number | string;
  lowerBasal: number | string;
}

export interface CastInput {
  upper:     ArchInput;
  lower:     ArchInput;
  toothSize: ToothSizeInput;
  ashley:    AshleyInput;
}

export type Severity = 'positive' | 'adequate' | 'mild' | 'moderate' | 'severe';

export interface DiscrepancyResult {
  net:      number;
  status:   string;
  severity: Severity;
}

export interface ArchResult {
  right:          DiscrepancyResult;
  left:           DiscrepancyResult;
  total:          number;
  classification: string;
  severity:       Severity;
}

export interface BoltonSide {
  value:     number | null;
  norm:      number;
  label:     string;
  deviation: number | null;
  status:    'normal' | 'discrepancy' | null;
}

export interface AshleySide {
  value:          number | null;
  interpretation: string | null;
}

export interface CastResult {
  upper:    ArchResult;
  lower:    ArchResult;
  bolton: {
    anterior: BoltonSide;
    total:    BoltonSide;
  };
  ashley: {
    upper: AshleySide;
    lower: AshleySide;
  };
  insights:    string[];
  computedAt:  string;
}

// ── Helpers ──────────────────────────────────────────────────────

const toNum = (v: number | string | undefined): number => Number(v) || 0;

const sumArr = (arr: (number | string)[]): number =>
  arr.reduce((acc, v) => acc + toNum(v), 0);

const sumObj = (obj: ArchSegment): number =>
  Object.values(obj).reduce((acc, v) => acc + toNum(v as number | string), 0);

const ratio = (num: number | string, den: number | string): number | null => {
  const d = toNum(den);
  if (!d) return null;
  return parseFloat(((toNum(num) / d) * 100).toFixed(2));
};

function classifyDiscrepancy(net: number): DiscrepancyResult {
  const n = parseFloat(net.toFixed(2));
  if (n >= 2)    return { net: n, status: 'spacing',           severity: 'positive'  };
  if (n >= 0)    return { net: n, status: 'adequate',          severity: 'adequate'  };
  if (n >= -4)   return { net: n, status: 'mild crowding',     severity: 'mild'      };
  if (n >= -8)   return { net: n, status: 'moderate crowding', severity: 'moderate'  };
  return          { net: n, status: 'severe crowding',          severity: 'severe'    };
}

function ashleyClass(pct: number | null): string | null {
  if (pct === null) return null;
  if (pct >= 45)   return 'Favourable — arch expansion indicated';
  if (pct >= 37)   return 'Borderline — expansion may be feasible';
  return            'Unfavourable — extraction likely required';
}

const BOLTON = {
  anterior: { norm: 77.2, label: 'Anterior (77.2% ± 1.5)' },
  total:    { norm: 91.3, label: 'Total (91.3% ± 1.5)'    },
};

// ── Main Engine ──────────────────────────────────────────────────

function calcArch(arch: ArchInput): ArchResult {
  const rightReq = sumArr(arch.required?.right || []);
  const leftReq  = sumArr(arch.required?.left  || []);
  const rightAvl = sumObj(arch.available?.right || {});
  const leftAvl  = sumObj(arch.available?.left  || {});

  const rightNet = rightAvl - rightReq;
  const leftNet  = leftAvl  - leftReq;
  const totalNet = rightNet + leftNet;

  return {
    right:          classifyDiscrepancy(rightNet),
    left:           classifyDiscrepancy(leftNet),
    total:          parseFloat(totalNet.toFixed(2)),
    classification: classifyDiscrepancy(totalNet).status,
    severity:       classifyDiscrepancy(totalNet).severity,
  };
}

export function runCastAnalysis(input: CastInput): CastResult {
  const { upper, lower, toothSize, ashley } = input;

  const boltonAnterior = ratio(toothSize.lowerAnterior, toothSize.upperAnterior);
  const boltonTotal    = ratio(toothSize.lowerTotal,    toothSize.upperTotal);

  const ashleyUpper = ratio(ashley.upperPM, ashley.upperBasal);
  const ashleyLower = ratio(ashley.lowerPM, ashley.lowerBasal);

  const upperResult = calcArch(upper);
  const lowerResult = calcArch(lower);

  // Clinical insights
  const insights: string[] = [];
  if (upperResult.total < -5 || lowerResult.total < -5) {
    insights.push('Severe crowding detected — extraction or surgical intervention may be required.');
  }
  if (boltonAnterior !== null && Math.abs(boltonAnterior - BOLTON.anterior.norm) > 1.5) {
    const excess = boltonAnterior > BOLTON.anterior.norm ? 'lower' : 'upper';
    insights.push(`Bolton anterior discrepancy — ${excess} anterior excess. Consider IPR or composite addition.`);
  }
  if (ashleyUpper !== null && ashleyUpper < 37) {
    insights.push('Ashley Howe index unfavourable — upper arch expansion not recommended.');
  }
  if (!insights.length) {
    insights.push('Cast analysis within acceptable clinical range.');
  }

  return {
    upper: upperResult,
    lower: lowerResult,
    bolton: {
      anterior: {
        value:     boltonAnterior,
        norm:      BOLTON.anterior.norm,
        label:     BOLTON.anterior.label,
        deviation: boltonAnterior !== null ? parseFloat((boltonAnterior - BOLTON.anterior.norm).toFixed(2)) : null,
        status:    boltonAnterior !== null
          ? (Math.abs(boltonAnterior - BOLTON.anterior.norm) <= 1.5 ? 'normal' : 'discrepancy')
          : null,
      },
      total: {
        value:     boltonTotal,
        norm:      BOLTON.total.norm,
        label:     BOLTON.total.label,
        deviation: boltonTotal !== null ? parseFloat((boltonTotal - BOLTON.total.norm).toFixed(2)) : null,
        status:    boltonTotal !== null
          ? (Math.abs(boltonTotal - BOLTON.total.norm) <= 1.5 ? 'normal' : 'discrepancy')
          : null,
      },
    },
    ashley: {
      upper: { value: ashleyUpper, interpretation: ashleyClass(ashleyUpper) },
      lower: { value: ashleyLower, interpretation: ashleyClass(ashleyLower) },
    },
    insights,
    computedAt: new Date().toISOString(),
  };
}

// ── Initial State ────────────────────────────────────────────────

const emptyArch = (): ArchInput => ({
  required:  { right: ['', '', '', '', '', ''], left:  ['', '', '', '', '', ''] },
  available: { right: { s3: '', s4: '' },       left:  { s1: '', s2: '' }       },
});

export const INITIAL_CAST_INPUT: CastInput = {
  upper:     emptyArch(),
  lower:     emptyArch(),
  toothSize: { upperAnterior: '', lowerAnterior: '', upperTotal: '', lowerTotal: '' },
  ashley:    { upperPM: '', upperBasal: '', lowerPM: '', lowerBasal: '' },
};
