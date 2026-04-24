/**
 * changeApplier.js — Apply a single MongoDB change-stream event to a target DB
 *
 * v2 (post-review hardening):
 *   • Stale-update guard — when both incoming and existing docs carry
 *     `updatedAt`, skip if incoming ≤ existing. Prevents out-of-order
 *     replay from rolling a document back.
 *   • `invalidate` is a HARD FAILURE (throws) — the stream is dead; any
 *     event after it is silent data loss. Caller must retry from a fresh
 *     resumeToken.
 *   • Idempotency preserved: every write uses upsert / _id-based updates.
 *     E11000 duplicate-key is still swallowed (dump/replay overlap).
 *
 * Supported operationTypes:
 *   insert  → upsert on _id
 *   update  → replaceOne when fullDocument present + stale guard,
 *             else $set/$unset upsert
 *   replace → replaceOne upsert + stale guard
 *   delete  → deleteOne({ _id })
 *   drop / dropDatabase / rename → skipped (return { skipped: true })
 *   invalidate                   → THROWS ChangeStreamInvalidatedError
 *
 * PLANE: Platform. Runs inside the migration sync engine.
 */

"use strict";

class ChangeStreamInvalidatedError extends Error {
    constructor(message = "Change stream invalidated") {
        super(message);
        this.code = "CHANGE_STREAM_INVALIDATED";
        this.fatal = true;
    }
}

/**
 * Compare two updatedAt values (Date | ISO string). Returns:
 *    1 if a > b
 *   -1 if a < b
 *    0 if equal / uncomparable
 */
function _compareTimestamps(a, b) {
    if (!a || !b) return 0;
    const ta = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const tb = b instanceof Date ? b.getTime() : new Date(b).getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
    if (ta > tb) return 1;
    if (ta < tb) return -1;
    return 0;
}

/**
 * Returns true if the incoming document should be written.
 * Returns false if the existing target document has a *newer* updatedAt
 * (stale-update protection).
 */
async function _shouldApplyUpdate(col, id, incomingDoc) {
    // Only applicable when incoming actually carries updatedAt.
    if (!incomingDoc?.updatedAt) return true;
    const existing = await col.findOne({ _id: id }, { projection: { updatedAt: 1 } });
    if (!existing?.updatedAt) return true;
    // Skip if incoming is strictly older than what we already have.
    return _compareTimestamps(incomingDoc.updatedAt, existing.updatedAt) >= 0;
}

/**
 * Apply one change-stream event to the target DB.
 *
 * @param {mongoose.Connection | import("mongodb").Db} target
 *        Either a mongoose Connection (we read .db) or a raw MongoDB Db.
 * @param {object} change — raw change-stream event
 * @returns {Promise<{ op, ns, id, skipped?, reason? }>}
 * @throws {ChangeStreamInvalidatedError} on `invalidate` events
 */
async function applyChange(target, change) {
    if (!change || !change.operationType) {
        return { op: "unknown", ns: "?", id: null, skipped: true, reason: "malformed-event" };
    }

    // ── Hard failure: invalidate ──────────────────────────────────────────
    // Once invalidated, the stream is dead. ANY event after this is lost.
    // The caller must abort and retry from a fresh resumeToken.
    if (change.operationType === "invalidate") {
        throw new ChangeStreamInvalidatedError(
            "[changeApplier] Change stream invalidated (drop/rename/dropDatabase upstream). " +
            "Every event after this point is silent data loss. Abort and retry."
        );
    }

    // Unwrap mongoose connection → raw Db.
    const db = target?.db ? target.db : target;
    if (!db || typeof db.collection !== "function") {
        throw new Error("[changeApplier] target must expose a .collection() — got " + typeof db);
    }

    const { operationType, ns, documentKey } = change;
    const collName = ns?.coll;
    if (!collName) {
        return { op: operationType, ns: "?", id: null, skipped: true, reason: "no-collection-name" };
    }
    const col = db.collection(collName);
    const id = documentKey?._id;

    try {
        switch (operationType) {
            case "insert": {
                if (!change.fullDocument) {
                    return { op: operationType, ns: collName, id, skipped: true, reason: "no-fullDocument" };
                }
                // Stale-update guard (matters when the same _id was already
                // copied by the dump with a fresher updatedAt).
                if (!(await _shouldApplyUpdate(col, id, change.fullDocument))) {
                    return { op: operationType, ns: collName, id, skipped: true, reason: "stale" };
                }
                await col.updateOne(
                    { _id: id },
                    { $set: change.fullDocument },
                    { upsert: true }
                );
                return { op: operationType, ns: collName, id };
            }

            case "update":
            case "replace": {
                // Prefer full-document path — always safer than surgical updates.
                if (change.fullDocument) {
                    if (!(await _shouldApplyUpdate(col, id, change.fullDocument))) {
                        return { op: operationType, ns: collName, id, skipped: true, reason: "stale" };
                    }
                    await col.replaceOne({ _id: id }, change.fullDocument, { upsert: true });
                    return { op: operationType, ns: collName, id };
                }
                // update-only: no fullDocument (fullDocument: "updateLookup" may
                // return null if the doc was deleted mid-stream). Surgical path.
                const updated = change.updateDescription?.updatedFields || {};
                const removed = change.updateDescription?.removedFields || [];
                const update = {};
                if (Object.keys(updated).length) update.$set = updated;
                if (removed.length) {
                    update.$unset = {};
                    for (const f of removed) update.$unset[f] = "";
                }
                if (!Object.keys(update).length) {
                    return { op: operationType, ns: collName, id, skipped: true, reason: "empty-update" };
                }
                // Stale guard via updatedAt in updatedFields.
                if (updated.updatedAt &&
                    !(await _shouldApplyUpdate(col, id, { updatedAt: updated.updatedAt }))) {
                    return { op: operationType, ns: collName, id, skipped: true, reason: "stale" };
                }
                await col.updateOne({ _id: id }, update, { upsert: true });
                return { op: operationType, ns: collName, id };
            }

            case "delete": {
                await col.deleteOne({ _id: id });
                return { op: operationType, ns: collName, id };
            }

            case "drop":
            case "dropDatabase":
            case "rename":
                // The stream will emit `invalidate` right after these; we handle
                // the invalidate (hard failure). Return a skipped result here so
                // the loop sees normal completion of THIS event.
                return {
                    op: operationType,
                    ns: collName,
                    id,
                    skipped: true,
                    reason: "stream-invalidating-op-pending",
                };

            default:
                return {
                    op: operationType,
                    ns: collName,
                    id,
                    skipped: true,
                    reason: "unsupported-op",
                };
        }
    } catch (err) {
        // E11000 = duplicate key. Dump/replay overlap is expected; the dump
        // already wrote the row, replay wants to insert it again — harmless.
        if (err.code === 11000) {
            return { op: operationType, ns: collName, id, skipped: true, reason: "dup-key-idempotent" };
        }
        throw err;
    }
}

module.exports = {
    applyChange,
    ChangeStreamInvalidatedError,
};
