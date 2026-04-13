/**
 * malocclusion.engine.ts
 * ═══════════════════════════════════════════════════════════════════════
 * Malocclusion Classification Engine — Phase 3.X
 *
 * PURE DETERMINISTIC FUNCTION — no side effects, no API calls.
 *
 * Data sources (from PhotoRecord.analysis in OrthoRecordsTab):
 *   record id 'lateral-right' → analysis.canineClass, analysis.molarClass
 *   record id 'lateral-left'  → analysis.canineClass, analysis.molarClass
 *   record id 'frontal-retracted' → analysis.incisorClass (optional)
 *
 * Classification values stored in analysis:
 *   canineClass: 'I' | 'II' | 'III'
 *   molarClass:  'I' | 'II' | 'III'
 *   incisorClass (optional): 'I' | 'II div 1' | 'II div 2' | 'III'
 *
 * Returns null for full Class I (no badge shown).
 * ═══════════════════════════════════════════════════════════════════════
 */

export type MalocclusionClass =
  | 'Class II Division 1'
  | 'Class II Division 2'
  | 'Class II Malocclusion'
  | 'Class II Subdivision (Right)'
  | 'Class II Subdivision (Left)'
  | 'Class III Malocclusion'
  | 'Class III Subdivision (Right)'
  | 'Class III Subdivision (Left)'
  | null;   // ← Class I — no badge

export interface MalocclusionInput {
  right: {
    molarClass?:  string;
    canineClass?: string;
    incisorClass?: string;
  };
  left: {
    molarClass?:  string;
    canineClass?: string;
    incisorClass?: string;
  };
}

/**
 * classifyMalocclusion
 *
 * Priority order:
 *   1. Full Class I → null (no badge)
 *   2. Subdivisions (one side Class I, other Class II/III)
 *   3. Full Class II → refine with incisor division
 *   4. Full Class III
 *   5. Canine-driven fallback
 *   6. null (insufficient data / undefined)
 */
export function classifyMalocclusion(input: MalocclusionInput | null | undefined): MalocclusionClass {
  if (!input) return null;

  const { right, left } = input;

  const rm = right?.molarClass  ?? '';
  const lm = left?.molarClass   ?? '';
  const rc = right?.canineClass ?? '';
  const lc = left?.canineClass  ?? '';
  const incisor = right?.incisorClass || left?.incisorClass || '';

  // Need at least molar data from one side
  if (!rm && !lm) return null;

  // ── 1. Full Class I ────────────────────────────────────────────────────────
  if (rm === 'I' && lm === 'I' && (rc === 'I' || !rc) && (lc === 'I' || !lc)) {
    return null;
  }

  // ── 2. Subdivisions ────────────────────────────────────────────────────────
  if (rm === 'I' && lm === 'II') return 'Class II Subdivision (Left)';
  if (rm === 'II' && lm === 'I') return 'Class II Subdivision (Right)';
  if (rm === 'I' && lm === 'III') return 'Class III Subdivision (Left)';
  if (rm === 'III' && lm === 'I') return 'Class III Subdivision (Right)';

  // ── 3. Full Class II ───────────────────────────────────────────────────────
  if (rm === 'II' && lm === 'II') {
    if (incisor === 'II div 1' || incisor === 'II div1') return 'Class II Division 1';
    if (incisor === 'II div 2' || incisor === 'II div2') return 'Class II Division 2';
    return 'Class II Malocclusion';
  }

  // ── 4. Full Class III ──────────────────────────────────────────────────────
  if (rm === 'III' && lm === 'III') return 'Class III Malocclusion';

  // ── 5. Canine-driven fallback (when molar data is partial) ─────────────────
  if (rc === 'II' || lc === 'II') return 'Class II Malocclusion';
  if (rc === 'III' || lc === 'III') return 'Class III Malocclusion';

  return null;
}

// ── Badge metadata lookup ──────────────────────────────────────────────────────

export interface MalocclusionBadgeCfg {
  label:    string;
  bg:       string;   // Tailwind class
  text:     string;
}

const CLASS_II_BG   = 'bg-purple-100 text-purple-700';
const CLASS_III_BG  = 'bg-red-100 text-red-700';
const SUBDIV_BG     = 'bg-orange-100 text-orange-700';

export function getMalocclusionBadgeCfg(cls: MalocclusionClass): MalocclusionBadgeCfg | null {
  if (!cls) return null;

  if (cls.startsWith('Class II Subdivision')) return { label: cls, bg: SUBDIV_BG, text: '' };
  if (cls.startsWith('Class III Subdivision')) return { label: cls, bg: SUBDIV_BG, text: '' };
  if (cls.startsWith('Class II')) return { label: cls, bg: CLASS_II_BG, text: '' };
  if (cls.startsWith('Class III')) return { label: cls, bg: CLASS_III_BG, text: '' };

  return null;
}
