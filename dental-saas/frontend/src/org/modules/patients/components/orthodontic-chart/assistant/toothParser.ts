/**
 * toothParser.ts — Multi-format Tooth Identifier Parser
 *
 * Supports ALL clinical tooth notation formats:
 *   1. Palmer quadrant: UR5, UL3, LL6, LR1
 *   2. FDI two-digit: 15, 26, 36, 47
 *   3. Natural language: "upper right second premolar", "lower left first molar"
 *
 * Also parses surface qualifiers: palatal, buccal, lingual, labial, mesial, distal
 *
 * Output: ParsedTooth or null if unrecognized.
 */

export type Quadrant = 'UR' | 'UL' | 'LL' | 'LR';
export type Surface = 'PALATAL' | 'BUCCAL' | 'LINGUAL' | 'LABIAL' | 'MESIAL' | 'DISTAL' | null;

export interface ParsedTooth {
  toothNumberFDI: number;   // e.g. 15
  quadrant: Quadrant;       // e.g. "UR"
  toothIndex: number;       // e.g. 5 (1-8 within quadrant)
  label: string;            // e.g. "UR5"
  surface: Surface;
}

// ─── FDI → Palmer mapping ────────────────────────────────────────────────────

/** Maps FDI number → { quadrant, toothIndex } */
function fdiToQuadrant(fdi: number): { quadrant: Quadrant; toothIndex: number } | null {
  if (fdi >= 11 && fdi <= 18) return { quadrant: 'UR', toothIndex: fdi - 10 };
  if (fdi >= 21 && fdi <= 28) return { quadrant: 'UL', toothIndex: fdi - 20 };
  if (fdi >= 31 && fdi <= 38) return { quadrant: 'LL', toothIndex: fdi - 30 };
  if (fdi >= 41 && fdi <= 48) return { quadrant: 'LR', toothIndex: fdi - 40 };
  return null;
}

/** Maps Palmer { quadrant, index } → FDI */
function palmerToFDI(quadrant: Quadrant, index: number): number {
  const base: Record<Quadrant, number> = { UR: 10, UL: 20, LL: 30, LR: 40 };
  return base[quadrant] + index;
}

// ─── Natural language dictionaries ───────────────────────────────────────────

const TOOTH_INDEX_NAMES: Record<string, number> = {
  'central incisor':      1,
  'lateral incisor':      2,
  'canine':               3,
  'cuspid':               3,
  'first premolar':       4,
  'first bicuspid':       4,
  'second premolar':      5,
  'second bicuspid':      5,
  'first molar':          6,
  'second molar':         7,
  'third molar':          8,
  'wisdom tooth':         8,
  'wisdom':               8,
};

const QUADRANT_NAMES: Record<string, Quadrant> = {
  'upper right':  'UR',
  'upper left':   'UL',
  'lower left':   'LL',
  'lower right':  'LR',
  'upper-right':  'UR',
  'upper-left':   'UL',
  'lower-left':   'LL',
  'lower-right':  'LR',
};

// ─── Surface parser ──────────────────────────────────────────────────────────

const SURFACE_MAP: Record<string, Surface> = {
  palatal:  'PALATAL',
  lingual:  'LINGUAL',
  buccal:   'BUCCAL',
  labial:   'LABIAL',
  mesial:   'MESIAL',
  distal:   'DISTAL',
};

export function parseSurface(text: string): Surface {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(SURFACE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// ─── Palmer notation: UR5, UL3, LL6, LR1 ─────────────────────────────────────

const PALMER_REGEX = /\b(UR|UL|LL|LR)([1-8])\b/i;

function parsePalmer(text: string): ParsedTooth | null {
  const match = text.match(PALMER_REGEX);
  if (!match) return null;
  const quadrant = match[1].toUpperCase() as Quadrant;
  const toothIndex = parseInt(match[2], 10);
  return {
    toothNumberFDI: palmerToFDI(quadrant, toothIndex),
    quadrant,
    toothIndex,
    label: `${quadrant}${toothIndex}`,
    surface: parseSurface(text),
  };
}

// ─── FDI notation: 15, 26, 36, 47 ────────────────────────────────────────────
// Standalone 2-digit number 11-48: prevent matching years/arbitrary numbers.

const FDI_REGEX = /\b(1[1-8]|2[1-8]|3[1-8]|4[1-8])\b/;

function parseFDI(text: string): ParsedTooth | null {
  // Only match if NOT preceded by another digit (avoid matching "315")
  const match = text.match(FDI_REGEX);
  if (!match) return null;
  const fdi = parseInt(match[1], 10);
  const q = fdiToQuadrant(fdi);
  if (!q) return null;
  return {
    toothNumberFDI: fdi,
    quadrant: q.quadrant,
    toothIndex: q.toothIndex,
    label: `${q.quadrant}${q.toothIndex}`,
    surface: parseSurface(text),
  };
}

// ─── Natural language: "upper right second premolar" ─────────────────────────

function parseNaturalLanguage(text: string): ParsedTooth | null {
  const lower = text.toLowerCase();

  // Find quadrant
  let quadrant: Quadrant | null = null;
  for (const [phrase, q] of Object.entries(QUADRANT_NAMES)) {
    if (lower.includes(phrase)) {
      quadrant = q;
      break;
    }
  }
  if (!quadrant) return null;

  // Find tooth within quadrant
  let toothIndex: number | null = null;
  // Sort by descending length so "first premolar" matches before "premolar"
  const sortedNames = Object.entries(TOOTH_INDEX_NAMES).sort(([a], [b]) => b.length - a.length);
  for (const [name, idx] of sortedNames) {
    if (lower.includes(name)) {
      toothIndex = idx;
      break;
    }
  }
  if (!toothIndex) return null;

  const fdi = palmerToFDI(quadrant, toothIndex);
  return {
    toothNumberFDI: fdi,
    quadrant,
    toothIndex,
    label: `${quadrant}${toothIndex}`,
    surface: parseSurface(text),
  };
}

// ─── Main exported parser ─────────────────────────────────────────────────────

/**
 * parseTooth
 *
 * Attempts to extract a tooth identifier from input text.
 * Tries formats in priority order:
 *   1. Palmer notation (UR5, UL3)
 *   2. FDI two-digit (15, 26)
 *   3. Natural language (upper right second premolar)
 *
 * @param text - Raw input text (can include surface, command words, etc.)
 * @returns ParsedTooth or null if no tooth identified
 */
export function parseTooth(text: string): ParsedTooth | null {
  return parsePalmer(text) ?? parseFDI(text) ?? parseNaturalLanguage(text);
}

/**
 * parseAllTeeth
 *
 * Extracts ALL tooth references from the text.
 * Used for multi-tooth commands like "rebond UR4 and UR5".
 */
export function parseAllTeeth(text: string): ParsedTooth[] {
  const results: ParsedTooth[] = [];

  // Find all Palmer matches
  const palmerGlobal = /\b(UR|UL|LL|LR)([1-8])\b/gi;
  let match;
  while ((match = palmerGlobal.exec(text)) !== null) {
    const quadrant = match[1].toUpperCase() as Quadrant;
    const toothIndex = parseInt(match[2], 10);
    results.push({
      toothNumberFDI: palmerToFDI(quadrant, toothIndex),
      quadrant,
      toothIndex,
      label: `${quadrant}${toothIndex}`,
      surface: parseSurface(text),
    });
  }

  if (results.length > 0) return results;

  // Fallback to single-tooth parse
  const single = parseTooth(text);
  return single ? [single] : [];
}

/** Returns a human-readable tooth label with surface */
export function formatToothLabel(tooth: ParsedTooth): string {
  const base = `${tooth.label} (FDI ${tooth.toothNumberFDI})`;
  return tooth.surface ? `${base} — ${tooth.surface.toLowerCase()}` : base;
}
