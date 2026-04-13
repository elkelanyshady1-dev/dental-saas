/**
 * autosaveDb.ts
 * ═══════════════════════════════════════════════════════════════════════
 * IndexedDB layer for offline-first autosave.
 * Uses `idb` (Jake Archibald's typed IDB wrapper).
 *
 * Two stores:
 *   drafts     — full recordSet payload keyed by caseId
 *                Survives tab close / crash. Restored on next open.
 *   patchQueue — NOT USED (existing useWorkflowPatchQueue uses localStorage
 *                already; kept for future multi-device sync)
 *
 * Only imported by autosaveDraft.ts — import nothing else from this file.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { openDB, IDBPDatabase } from 'idb';

const DB_NAME    = 'dental-autosave-v1';
const DB_VERSION = 1;

export interface AutosaveSchema {
  drafts: {
    key:   string;    // caseId
    value: unknown;   // serialised draft payload
  };
}

let _db: IDBPDatabase<AutosaveSchema> | null = null;

export async function getAutosaveDB(): Promise<IDBPDatabase<AutosaveSchema>> {
  if (_db) return _db;

  _db = await openDB<AutosaveSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts');
      }
    },
    blocked() {
      console.warn('[AutosaveDB] upgrade blocked by open tab — close other tabs');
    },
    blocking() {
      // Another tab wants a newer version — close so it can upgrade
      _db?.close();
      _db = null;
    },
  });

  return _db;
}
