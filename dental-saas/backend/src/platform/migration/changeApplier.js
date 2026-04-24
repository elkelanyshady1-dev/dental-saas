/**
 * changeApplier.js — Apply a single MongoDB change-stream event to a target DB
 *
 * Pure function (one external call — the target write). Idempotent: replaying
 * the same event against the same target leaves state unchanged.
 *
 * Supported operationTypes:
 *   insert  → upsert on _id (dump/replay overlap: row may already exist)
 *   update  → $set + $unset from updateDescription, OR replaceOne when
 *             fullDocument is present (fullDocument: "updateLookup")
 *   replace → replaceOne upsert
 *   delete  → deleteOne({ _id })
 *   drop / dropDatabase / rename / invalidate → logged + skipped (these
 *             invalidate the stream itself; the caller's catch-up loop will
 *             detect and bail out)
 *
 * Contract:
 *   - Takes the *raw change-stream document*, not a normalised shape.
 *   - Returns a small summary the caller uses for progress reporting.
 *   - Throws only on unrecoverable DB errors. Idempotency-friendly errors
 *     (e.g. duplicate-key on re-insert) are swallowed — we already have the
 *     document from the dump.
 *
 * PLANE: Platform. Runs inside the migration worker.
 */

"use strict";

/**
 * Apply one change-stream event to the target DB.
 *
 * @param {mongoose.Connection | import("mongodb").Db} target
 *        Either the target tenant connection (we use .db) OR the underlying
 *        MongoClient Db directly.
 * @param {object} change — raw change-stream event
 * @returns {Promise<{ op: string, ns: string, id: any, skipped?: boolean, reason?: string }>}
 */
async function applyChange(target, change) {
    if (!change || !change.operationType) {
        return { op: "unknown", ns: "?", id: null, skipped: true, reason: "malformed-event" };
    }

    // Unwrap mongoose connection → raw Db (sync) if needed.
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
                // Upsert so replay against a target that already received the
                // dumped copy is a no-op.
                await col.updateOne(
                    { _id: id },
                    { $set: change.fullDocument },
                    { upsert: true }
                );
                return { op: operationType, ns: collName, id };
            }

            case "update": {
                // Prefer replaceOne when fullDocument is present — it's atomic
                // and deals with nested paths correctly. Fall back to surgical
                // $set/$unset when only updateDescription is provided.
                if (change.fullDocument) {
                    await col.replaceOne({ _id: id }, change.fullDocument, { upsert: true });
                    return { op: operationType, ns: collName, id };
                }
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
                // Upsert: if the row was created AFTER the dump and the live
                // stream first delivered the insert event that we may have
                // missed, we don't lose data by creating the row here.
                await col.updateOne({ _id: id }, update, { upsert: true });
                return { op: operationType, ns: collName, id };
            }

            case "replace": {
                if (!change.fullDocument) {
                    return { op: operationType, ns: collName, id, skipped: true, reason: "no-fullDocument" };
                }
                await col.replaceOne({ _id: id }, change.fullDocument, { upsert: true });
                return { op: operationType, ns: collName, id };
            }

            case "delete": {
                await col.deleteOne({ _id: id });
                return { op: operationType, ns: collName, id };
            }

            case "drop":
            case "dropDatabase":
            case "rename":
            case "invalidate":
                // These terminate the change stream; the caller's replay loop
                // will see `invalidate` and bail out. We skip here — the
                // target DB state is best handled by operator intervention.
                return {
                    op: operationType,
                    ns: collName,
                    id,
                    skipped: true,
                    reason: "stream-invalidating-op",
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
        // E11000 = duplicate key. If we race a dump+replay and the dumped
        // insert landed first, a replayed insert may trip this — swallow
        // because the row is already correct.
        if (err.code === 11000) {
            return { op: operationType, ns: collName, id, skipped: true, reason: "dup-key-idempotent" };
        }
        throw err;
    }
}

module.exports = { applyChange };
