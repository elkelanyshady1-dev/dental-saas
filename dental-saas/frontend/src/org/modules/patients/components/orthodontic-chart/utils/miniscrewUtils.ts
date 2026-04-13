/**
 * miniscrewUtils.ts
 * Domain: orthodontic / TAD engine
 * Layer: Frontend > Utils
 *
 * Canonical FDI-based miniscrew interradicular position resolver.
 *
 * Clinical anatomy rules (validated test cases):
 *   Mesial to 14  → between 14 & 13  (toward midline in Q1)
 *   Distal to 14  → between 14 & 15  (away from midline in Q1)
 *   Mesial to 24  → between 24 & 23  (toward midline in Q2)
 *   Distal to 24  → between 24 & 25  (away from midline in Q2)
 *
 * Formula: mesial = tooth - 1 within quadrant (cross-midline handled explicitly)
 *          distal = tooth + 1 within quadrant
 *
 * Replaces the inline getAdjacentTooth function that mixed index/ID logic.
 *
 * ❌ No array index tricks
 * ❌ No hardcoded tooth-pair tables
 * ✅ FDI-quadrant arithmetic only
 */

export type MiniscrewAnchorType = 'mesial' | 'distal' | 'apical' | 'infrazygomatic';

/**
 * Resolved interradicular position.
 * `between` → miniscrew goes between these two adjacent teeth.
 * `apical`  → miniscrew is placed apically (root-end of single tooth).
 * `infrazygomatic` → placed at the infrazygomatic crest above this tooth.
 */
export type ResolvedPosition =
  | { type: 'interradicular'; between: [number, number] }
  | { type: 'apical';          tooth:   number           }
  | { type: 'infrazygomatic';  tooth:   number           }
  | null;

// ── Core resolver ─────────────────────────────────────────────────────────────

/**
 * Given a tooth (FDI number) and anchor type, returns the anatomically correct
 * miniscrew position descriptor.
 *
 * @throws never — returns null for invalid positions instead
 */
export function resolveMiniscrewPosition(
  tooth: number,
  anchorType: MiniscrewAnchorType,
): ResolvedPosition {
  if (anchorType === 'infrazygomatic') {
    return { type: 'infrazygomatic', tooth };
  }

  if (anchorType === 'apical') {
    return { type: 'apical', tooth };
  }

  const quadrant = Math.floor(tooth / 10);
  const position = tooth % 10; // 1-8, where 1 = closest to midline

  // ── MESIAL — toward the midline ─────────────────────────────────────────────
  if (anchorType === 'mesial') {
    // Boundary: already at midline — cross to the other central incisor
    if (position === 1) {
      const crossTooth: Record<number, number> = {
        1: 21, // 11 ↔ 21 (upper centrals)
        2: 11, // 21 ↔ 11
        3: 41, // 31 ↔ 41 (lower centrals)
        4: 31, // 41 ↔ 31
      };
      const neighbor = crossTooth[quadrant];
      if (!neighbor) return null; // invalid FDI quadrant
      return { type: 'interradicular', between: [tooth, neighbor] };
    }

    // Within quadrant: mesial = lower FDI number (closer to midline)
    const mesialNeighbor = tooth - 1;
    if (mesialNeighbor % 10 < 1) return null; // underflow guard
    return { type: 'interradicular', between: [tooth, mesialNeighbor] };
  }

  // ── DISTAL — away from midline ──────────────────────────────────────────────
  if (anchorType === 'distal') {
    // Boundary: last molar (position 8) has no distal neighbor
    if (position >= 8) return null;

    // Within quadrant: distal = higher FDI number (further from midline)
    const distalNeighbor = tooth + 1;
    if (distalNeighbor % 10 > 8) return null; // overflow guard
    return { type: 'interradicular', between: [tooth, distalNeighbor] };
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for the resolved position.
 * Used in audit log and toast notifications.
 */
export function getMiniscrewPositionLabel(
  tooth: number,
  anchorType: MiniscrewAnchorType,
): string {
  const resolved = resolveMiniscrewPosition(tooth, anchorType);
  if (!resolved) return `tooth ${tooth}`;

  if (resolved.type === 'interradicular') {
    const [t1, t2] = [...resolved.between].sort((a, b) => a - b);
    return `interradicular between tooth ${t1} and ${t2}`;
  }
  if (resolved.type === 'apical') {
    return `apical to tooth ${tooth}`;
  }
  if (resolved.type === 'infrazygomatic') {
    return `infrazygomatic crest above tooth ${tooth}`;
  }
  return `tooth ${tooth}`;
}

/**
 * Returns the adjacent tooth ID for a given anchor direction.
 * Returns null when at a boundary (last molar, cross-quadrant not applicable, etc.).
 * This is the corrected replacement for the inline getAdjacentTooth.
 */
export function getAdjacentToothId(
  tooth: number,
  anchorType: 'mesial' | 'distal' | 'apical',
): number | null {
  const resolved = resolveMiniscrewPosition(tooth, anchorType);
  if (!resolved) return null;
  if (resolved.type === 'interradicular') {
    // Return the neighbor (not the anchor tooth itself)
    return resolved.between[0] === tooth ? resolved.between[1] : resolved.between[0];
  }
  return null;
}
