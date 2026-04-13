/**
 * normalizedEntities.ts — Production-Grade Normalized Entity State
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HARDENING (Phase 8 — Production Safety)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PROBLEM:
 *   Array-based state allows structural duplication. An array `.push()` or
 *   spread `[...arr, item]` with a duplicate ID silently creates two entries.
 *   O(n) `.some()` scans on every insert are fragile and slow for large sets.
 *
 * SOLUTION:
 *   Normalized entity collections: { byId: Record<string, T>, allIds: string[] }
 *   - O(1) existence check via `byId[id]`
 *   - `allIds` preserves insertion order (deterministic iteration)
 *   - No `.push()` allowed — only `insertEntity` / `removeEntity`
 *   - Structural duplication is IMPOSSIBLE (byId is a dict)
 *
 * INVARIANTS:
 *   - ALL functions are PURE — no mutations, no side effects
 *   - allIds and byId are always in sync (insertEntity/removeEntity enforce this)
 *   - Idempotent: inserting an existing ID returns state unchanged
 *   - toArray() provides backward-compatible array view for UI rendering
 *
 * @pure
 */

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface NormalizedCollection<T extends { id: string }> {
  readonly byId:   Readonly<Record<string, T>>;
  readonly allIds: readonly string[];
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create an empty normalized collection. */
export function emptyCollection<T extends { id: string }>(): NormalizedCollection<T> {
  return { byId: {}, allIds: [] };
}

/** Create a normalized collection from an existing array. Deduplicates by ID. */
export function fromArray<T extends { id: string }>(items: T[]): NormalizedCollection<T> {
  const byId: Record<string, T> = {};
  const allIds: string[] = [];

  for (const item of items) {
    if (!item.id) continue;       // skip malformed entries
    if (byId[item.id]) continue;  // skip duplicates
    byId[item.id] = item;
    allIds.push(item.id);
  }

  return { byId, allIds };
}

// ─── Mutations (PURE — return new objects) ───────────────────────────────────

/**
 * Insert an entity. Returns state UNCHANGED if entity already exists (idempotent).
 *
 * ❌ NEVER use array.push() or [...arr, item] for entities.
 * ✅ ALWAYS use insertEntity().
 */
export function insertEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  entity: T,
): NormalizedCollection<T> {
  if (!entity.id) return collection;

  // O(1) idempotency check — if ID already exists, return unchanged
  if (collection.byId[entity.id]) return collection;

  return {
    byId:   { ...collection.byId, [entity.id]: entity },
    allIds: [...collection.allIds, entity.id],
  };
}

/**
 * Remove an entity by ID. Returns state UNCHANGED if entity doesn't exist.
 */
export function removeEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  id: string,
): NormalizedCollection<T> {
  if (!id || !collection.byId[id]) return collection;

  const { [id]: _removed, ...restById } = collection.byId;
  return {
    byId:   restById,
    allIds: collection.allIds.filter(eid => eid !== id),
  };
}

/**
 * Update an entity by ID. Returns state UNCHANGED if entity doesn't exist.
 * Applies a partial patch — only provided fields are overwritten.
 */
export function updateEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  id: string,
  patch: Partial<T>,
): NormalizedCollection<T> {
  if (!id || !collection.byId[id]) return collection;

  return {
    byId:   { ...collection.byId, [id]: { ...collection.byId[id], ...patch } },
    allIds: collection.allIds, // order unchanged
  };
}

/**
 * Check if an entity exists by ID. O(1).
 */
export function hasEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  id: string,
): boolean {
  return !!id && !!collection.byId[id];
}

/**
 * Get an entity by ID. O(1). Returns undefined if not found.
 */
export function getEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  id: string,
): T | undefined {
  return collection.byId[id];
}

/**
 * Find an entity by a predicate. O(n) — use sparingly, prefer ID-based lookup.
 */
export function findEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  predicate: (entity: T) => boolean,
): T | undefined {
  for (const id of collection.allIds) {
    const entity = collection.byId[id];
    if (predicate(entity)) return entity;
  }
  return undefined;
}

/**
 * Check if any entity matches a predicate. O(n).
 */
export function someEntity<T extends { id: string }>(
  collection: NormalizedCollection<T>,
  predicate: (entity: T) => boolean,
): boolean {
  return collection.allIds.some(id => predicate(collection.byId[id]));
}

// ─── Selectors ───────────────────────────────────────────────────────────────

/**
 * Convert to array for rendering. Preserves insertion order.
 * UI components SHOULD use this instead of accessing byId directly.
 *
 * Usage: const miniscrews = toArray(state.tads);
 */
export function toArray<T extends { id: string }>(
  collection: NormalizedCollection<T>,
): T[] {
  return collection.allIds.map(id => collection.byId[id]);
}

/** Count of entities. O(1). */
export function count<T extends { id: string }>(
  collection: NormalizedCollection<T>,
): number {
  return collection.allIds.length;
}

/** Check if collection is empty. O(1). */
export function isEmpty<T extends { id: string }>(
  collection: NormalizedCollection<T>,
): boolean {
  return collection.allIds.length === 0;
}

// ─── Position-Aware Helpers (TAD-specific) ───────────────────────────────────

/** Check if a TAD exists at a specific tooth+position. O(n) worst case, but typically small set. */
export function hasTadAtPosition(
  collection: NormalizedCollection<{ id: string; toothId: number; anchorType: string }>,
  toothId: number,
  anchorType: string,
): boolean {
  return someEntity(collection, (t) => t.toothId === toothId && t.anchorType === anchorType);
}

// ─── Processed Event IDs (Global Idempotency) ───────────────────────────────

/**
 * ProcessedEventRegistry — tracks which event IDs have been applied.
 *
 * USAGE:
 *   At the TOP of every reducer invocation:
 *     if (hasProcessedEvent(state._processedEventIds, event.eventId)) return state;
 *     state = { ...state, _processedEventIds: markProcessed(state._processedEventIds, event.eventId) };
 *
 * This prevents:
 *   - StrictMode double renders from duplicating state
 *   - Multi-tab replays from double-applying events
 *   - Retry storms from producing phantom entities
 *
 * Implementation: Set<string> (fast O(1) membership check)
 * Memory: bounded by event count per session (typically < 10,000)
 */

/** Check if an event has already been processed. */
export function hasProcessedEvent(
  registry: ReadonlySet<string> | undefined,
  eventId: string | undefined,
): boolean {
  if (!eventId || !registry) return false;
  return registry.has(eventId);
}

/** Mark an event as processed. Returns a NEW Set (immutable). */
export function markProcessed(
  registry: ReadonlySet<string> | undefined,
  eventId: string | undefined,
): ReadonlySet<string> {
  if (!eventId) return registry ?? new Set();
  const next = new Set(registry);
  next.add(eventId);
  return next;
}
