/**
 * CaseWorkflowContainer.tsx
 * ═══════════════════════════════════════════════════════════════
 * Orchestrates the 6-step orthodontic workflow:
 *   Records → Analysis → Problems → Goals → Options → Final Plan
 * 
 * Features:
 *   - Debounced auto-save (2s) to backend
 *   - Load saved workflow on open
 *   - Fallback to empty state if no saved data
 *   - Non-blocking save (never blocks UI)
 *   - Validation gates between steps
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { 
  ArrowLeft, ArrowRight, Save, 
  AlertTriangle, CheckCircle2, Loader2,
  Cloud, CloudOff, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecordSet } from '../../../types';
import { caseApi as orthodonticsApi } from '../../../api/case.api';
import { computeWorkflowDiff, WorkflowPayload } from '../../../utils/workflowDiff';
import { useWorkflowPatchQueue } from '../../../hooks/useWorkflowPatchQueue';
import { saveDraft, loadDraft, clearDraft } from '../../../utils/autosaveDraft';


// Existing components (unchanged — named exports)
import OrthoRecordsTab from '../OrthoRecordsTab';
import { ProblemListTab } from '../ProblemListTab';

// New workflow components
import WorkflowStepper, { WORKFLOW_STEPS } from './WorkflowStepper';
import AnalysisStep from './AnalysisStep';
import GoalsStep, { TreatmentGoal } from './GoalsStep';
import TreatmentOptionsStep, { TreatmentOption } from './TreatmentOptionsStep';
import FinalPlanStep from './FinalPlanStep';
import { deriveProblemsFromCeph, suggestOptionsFromProblems, DerivedProblem } from './workflowDerivation';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface OrthoActions {
  print: (() => void) | null;
  exportPdf: (() => void) | null;
  share: (() => void) | null;
  flushToParent: (() => Promise<void>) | null;
  /** Returns the latest, fully-hydrated record sets from the workflow container.
   *  Bypasses React state (reads from ref) — always fresh. */
  getRecordSets: (() => any[]) | null;
}

interface CaseWorkflowContainerProps {
  patientId: string;
  patientName?: string;
  caseId?: string; // Backend OrthodonticCase._id (optional — graceful degradation if missing)
  initialData: RecordSet;
  onUpdate: (data: Partial<RecordSet>) => void;
  registerActions?: (actions: OrthoActions) => void;
}

interface ValidationResult {
  valid: boolean;
  message: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const AUTOSAVE_DELAY_MS = 2000; // 2-second debounce

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

const CaseWorkflowContainer: React.FC<CaseWorkflowContainerProps> = ({
  patientId,
  patientName,
  caseId,
  initialData,
  onUpdate,
  registerActions,
}) => {
  // ─── Workflow State ─────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(0);
  const [treatmentGoals, setTreatmentGoals] = useState<TreatmentGoal[]>([]);
  const [treatmentOptions, setTreatmentOptions] = useState<TreatmentOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isLoaded, setIsLoaded] = useState(false);
  const [derivedProblems, setDerivedProblems] = useState<DerivedProblem[]>([]);

  // Refs for debounce
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  // ── SAVE LOCK: prevents overlapping concurrent saves (full PUT path) ──
  const isSavingRef = useRef(false);

  // ── ENTERPRISE AUTOSAVE: last successfully saved payload for diffing ──
  // Tracks what was last committed so computeWorkflowDiff can produce minimal diffs.
  // null = nothing saved yet (first save sends full payload).
  const lastSavedPayloadRef = useRef<WorkflowPayload | null>(null);

  // Track the latest record set data from OrthoRecordsTab for saving
  const latestRecordSetRef = useRef<Partial<RecordSet> | null>(null);
  const [recordSetVersion, setRecordSetVersion] = useState(0);

  // CRITICAL: Store ALL record sets from backend to prevent cross-overwrite.
  // When saving, we merge the current set back into this array.
  const allRecordSetsRef = useRef<any[]>([]);

  // ── updateRecordSet — CANONICAL RECORD SET MUTATOR ────────────────────────
  // ALL mutations to the active record set MUST go through this function.
  //
  // WHY: latestRecordSetRef is a React ref — mutating it directly does NOT
  //      trigger the autosave effect (which depends on recordSetVersion state).
  //      This function guarantees:
  //        1. Ref is updated (always fresh for buildWorkflowPayload)
  //        2. recordSetVersion is bumped   → autosave fires
  //        3. Structured debug log         → easy tracing
  //
  // USAGE:
  //   updateRecordSet({ castAnalysis: data })          ← plain object merge
  //   updateRecordSet(prev => ({ ...prev, foo: bar })) ← functional updater
  //
  const updateRecordSet = useCallback(
    (updater: Partial<RecordSet> | ((prev: Partial<RecordSet>) => Partial<RecordSet>), source = 'unknown') => {
      const current = latestRecordSetRef.current || {};
      const updated =
        typeof updater === 'function' ? updater(current) : { ...current, ...updater };

      latestRecordSetRef.current = updated;

      // ✅ CRITICAL: bump state → triggers autosave useEffect
      setRecordSetVersion(v => v + 1);

      // ✅ OFFLINE-FIRST: persist full draft to IndexedDB immediately
      // Fire-and-forget — never blocks the UI thread
      if (caseId) {
        saveDraft(caseId, {
          savedAt:  Date.now(),
          recordSets: allRecordSetsRef.current.length > 0
            ? allRecordSetsRef.current.map((rs: any) =>
                rs.id === (updated as any).id ? { ...rs, ...updated } : rs
              )
            : [updated],
        }).catch(() => {});
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[updateRecordSet] mutated + autosave triggered', {
          source,
          keys: Object.keys(typeof updater === 'object' ? updater : {}),
          newVersion: '(pending)',
        });
      }
    },
    [caseId]
  );

  // ── Optimistic Concurrency ── Backend version counter for conflict detection.
  // Sent as expectedVersion on save. Updated from save/get responses.
  const workflowVersionRef = useRef<number>(0);

  // ── Snapshot Pointer ── Latest committed snapshot ID from backend.
  // Used by share/compare to read immutable committed data.
  const currentSnapshotIdRef = useRef<string | null>(null);

  // ── PHASE 1 FIX: Ref-based stable callback to eliminate stale closure ─────
  // onUpdate prop changes when selectedCase changes in parent. Without ref,
  // the empty-deps useCallback captures the FIRST onUpdate forever.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // ─── Derived State ──────────────────────────────────────────
  const [restoredRecordSet, setRestoredRecordSet] = useState<Partial<RecordSet> | null>(null);

  const safeData: RecordSet = useMemo(() => {
    // Priority: restored from backend → initial from parent
    const source = restoredRecordSet || initialData;
    return {
      id: source?.id || initialData?.id || '',
      name: source?.name || initialData?.name || '',
      date: source?.date || initialData?.date || '',
      records: Array.isArray(source?.records) && source.records.length > 0 ? source.records : (Array.isArray(initialData?.records) ? initialData.records : []),
      chiefComplaint: source?.chiefComplaint || initialData?.chiefComplaint || '',
      audioUrl: source?.audioUrl ?? initialData?.audioUrl ?? null,
      stlFiles: Array.isArray(source?.stlFiles) && source.stlFiles.length > 0 ? source.stlFiles : (Array.isArray(initialData?.stlFiles) ? initialData.stlFiles : []),
      problemList: source?.problemList ?? initialData?.problemList,
      treatmentPlan: source?.treatmentPlan ?? initialData?.treatmentPlan,
      // Cast Analysis — sourced from restored backend state, falling back to prop
      castAnalysis: (source as any)?.castAnalysis ?? (initialData as any)?.castAnalysis ?? undefined,
    } as RecordSet;
  }, [initialData, restoredRecordSet]);

  const selectedOption = useMemo(() => {
    return treatmentOptions.find(o => o.id === selectedOptionId) || null;
  }, [treatmentOptions, selectedOptionId]);

  // ─── Step 4: Load Saved Workflow on Open ────────────────────
  useEffect(() => {
    if (!caseId) {
      // No backend case ID — use empty state (Step 5: Fallback)
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    const loadWorkflow = async () => {
      try {
        const response = await orthodonticsApi.getWorkflow(caseId);
        if (cancelled) return;

        const saved = response.data?.data?.workflowData;
        const serverVersion = response.data?.data?.workflowVersion;
        const serverSnapshotId = response.data?.data?.currentSnapshotId;

        // Capture server version for optimistic concurrency
        if (typeof serverVersion === 'number') {
          workflowVersionRef.current = serverVersion;
        }
        // Capture current snapshot pointer
        if (serverSnapshotId) {
          currentSnapshotIdRef.current = serverSnapshotId;
        }

        if (saved) {
          // Restore saved state
          if (Array.isArray(saved.treatmentGoals) && saved.treatmentGoals.length > 0) {
            setTreatmentGoals(saved.treatmentGoals);
          }
          if (Array.isArray(saved.treatmentOptions) && saved.treatmentOptions.length > 0) {
            setTreatmentOptions(saved.treatmentOptions);
          }
          if (Array.isArray(saved.derivedProblems) && saved.derivedProblems.length > 0) {
            setDerivedProblems(saved.derivedProblems);
          }
          if (saved.selectedOptionId) {
            setSelectedOptionId(saved.selectedOptionId);
          }
          if (typeof saved.currentStep === 'number' && saved.currentStep >= 0) {
            setCurrentStep(saved.currentStep);
          }
          // Restore recordSet data (photos, analysis, STL, etc.)
          if (Array.isArray(saved.recordSets) && saved.recordSets.length > 0) {
            // CRITICAL: Store ALL record sets so we don't lose sibling sets on save
            // Also normalize records/photos: backend has both fields with default: []
            allRecordSetsRef.current = saved.recordSets.map((rs: any) => ({
              ...rs,
              records: (rs.records?.length > 0 ? rs.records : rs.photos) || [],
            }));

            // CRITICAL FIX: Do NOT fallback to [0]! If the user just created a new recordSet locally, 
            // falling back to [0] will copy all photos from the Pre-record into the new empty set!
            const matchingSet = allRecordSetsRef.current.find((rs: any) => rs.id === initialData?.id);
            if (matchingSet) {
              setRestoredRecordSet(matchingSet);
              console.log('[CaseWorkflowContainer] Restored recordSet from backend:', {
                recordCount: matchingSet.records?.length || 0,
                photosWithUrl: matchingSet.records?.filter((r: any) => r.url).length || 0,
                totalSetsInCase: saved.recordSets.length,
              });
            } else {
              setRestoredRecordSet(null);
              console.log('[CaseWorkflowContainer] New recordSet not in backend yet. Using empty initialData.');
            }
          }

          console.log('[CaseWorkflowContainer] Restored workflow from backend:', {
            step: saved.currentStep,
            goals: saved.treatmentGoals?.length || 0,
            options: saved.treatmentOptions?.length || 0,
            lastSaved: saved.lastSavedAt,
          });
        }
        // else: no saved data → try IndexedDB draft as fallback
        // Covers: crash / tab close / PATCH never reached server
        else if (caseId) {
          const draft = await loadDraft(caseId);
          if (draft && Array.isArray(draft.recordSets) && draft.recordSets.length > 0) {
            allRecordSetsRef.current = draft.recordSets as any[];
            // Do NOT fallback to [0] here either to prevent duplication
            const matchingDraft = (draft.recordSets as any[]).find((rs: any) => rs.id === initialData?.id);
            if (matchingDraft) {
              latestRecordSetRef.current = matchingDraft;
              setRestoredRecordSet(matchingDraft);
              console.log('[CaseWorkflowContainer] DRAFT RESTORED from IndexedDB (server had no data)');
            }
          }
        }
      } catch (err: any) {
        // 404 = case exists but no workflow data yet — fallback silently
        if (err?.response?.status !== 404) {
          console.warn('[CaseWorkflowContainer] Failed to load workflow:', err);
        }
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    };

    loadWorkflow();
    return () => { cancelled = true; };
  }, [caseId]);

  // ── Offline recovery: restore queued patches + online listener ─────────────
  // Called once after load. Replays any localStorage-persisted patch job that
  // never reached the server (e.g. browser crashed while offline).
  useEffect(() => {
    if (!isLoaded || !caseId) return;

    // Replay any stored offline patch job
    patchQueue.restoreOfflineQueue();

    // Resume sync automatically when the browser comes back online
    const handleOnline = () => {
      console.log('[CaseWorkflowContainer] Back online — flushing patch queue');
      patchQueue.flush().catch(() => {});
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, caseId]);

  // ─── Step 3: Debounced Auto-Save ────────────────────────────
  const buildWorkflowPayload = useCallback(() => {
    // ── REF PRIORITY (CRITICAL) ──────────────────────────────────────────────
    // latestRecordSetRef.current is ALWAYS fresher than safeData (which is React
    // state and may lag one render behind). Always prefer the ref.
    // safeData is the fallback for initial render before any user interaction.
    const currentRecordSet = latestRecordSetRef.current
      ? { ...safeData, ...latestRecordSetRef.current }
      : safeData;

    const payload = {
      currentStep,
      treatmentGoals,
      treatmentOptions,
      selectedOptionId,
      problemList: currentRecordSet.problemList || safeData.problemList || null,
      derivedProblems,
      // CRITICAL FIX: Merge the current set into ALL record sets.
      // The old code was: recordSets: [{ single set }]
      // This deleted all sibling sets (Pre/Mid/Post) on every save.
      recordSets: (() => {
        const thisSet = {
          id: currentRecordSet.id || safeData.id,
          name: currentRecordSet.name || safeData.name,
          date: currentRecordSet.date || safeData.date,
          records: currentRecordSet.records || safeData.records || [],
          chiefComplaint: currentRecordSet.chiefComplaint || safeData.chiefComplaint || '',
          audioUrl: currentRecordSet.audioUrl ?? safeData.audioUrl ?? null,
          stlFiles: currentRecordSet.stlFiles || safeData.stlFiles || [],
          treatmentPlan: currentRecordSet.treatmentPlan || safeData.treatmentPlan || null,
          // Cast Analysis — embedded in record set, versioned with snapshot
          castAnalysis: (currentRecordSet as any).castAnalysis ?? (safeData as any).castAnalysis ?? null,
        };

        const existingSets = allRecordSetsRef.current;
        if (existingSets.length === 0) {
          // No sibling sets loaded — save just this one (first-time case)
          return [thisSet];
        }

        // Replace matching set, keep all others untouched
        const merged = existingSets.map((rs: any) =>
          rs.id === thisSet.id ? thisSet : rs
        );

        // If this set doesn't exist in the array yet, append it
        if (!existingSets.some((rs: any) => rs.id === thisSet.id)) {
          merged.push(thisSet);
        }

        // Update the ref so subsequent saves have the latest
        allRecordSetsRef.current = merged;

        return merged;
      })(),
    };

    console.log('[CaseWorkflowContainer] BUILD PAYLOAD:', {
      totalRecordSets: payload.recordSets.length,
      activeSetId: currentRecordSet.id || safeData.id,
      photosWithUrl: payload.recordSets.find((rs: any) => rs.id === (currentRecordSet.id || safeData.id))?.records?.filter((r: any) => r.url).length || 0,
      hasLatestRef: !!latestRecordSetRef.current,
      step: payload.currentStep,
    });

    // ── BLOB URL SANITIZER (MANDATORY SAFETY NET) ──────────────────────────────
    // Strip previewUrl and any blob:/data: URLs before the payload ever reaches
    // the save pipeline. This is the last line of defense — even if upstream
    // code accidentally sets record.url to a blob, this catches it.
    //
    // RULES:
    //   record.previewUrl → always stripped (UI-only field, never persisted)
    //   record.url        → set to null if it starts with 'blob:' or 'data:'
    //   stlFiles[].url    → same treatment
    //   audioUrl          → set to null if blob/data scheme
    const isBlobOrDataUrl = (url: string | null | undefined) =>
      typeof url === 'string' && (url.startsWith('blob:') || url.startsWith('data:'));

    const sanitizeRecord = (r: any) => {
      const cleaned: any = { ...r, previewUrl: undefined }; // strip always
      if (isBlobOrDataUrl(cleaned.url)) {
        console.warn('[CaseWorkflowContainer] SANITIZED blob url from record:', r.id, r.url?.substring(0, 40));
        cleaned.url = null;
      }
      return cleaned;
    };

    const sanitizedPayload = {
      ...payload,
      recordSets: payload.recordSets.map((rs: any) => ({
        ...rs,
        records: (rs.records || []).map(sanitizeRecord),
        stlFiles: (rs.stlFiles || []).map((stl: any) => {
          if (isBlobOrDataUrl(stl.url)) {
            console.warn('[CaseWorkflowContainer] SANITIZED blob url from stlFile:', stl.name);
            return { ...stl, url: null };
          }
          return stl;
        }),
        audioUrl: isBlobOrDataUrl(rs.audioUrl) ? null : rs.audioUrl,
      })),
    };

    return sanitizedPayload as WorkflowPayload;
  }, [currentStep, treatmentGoals, treatmentOptions, selectedOptionId, safeData, derivedProblems, recordSetVersion]);


  // ── Enterprise Autosave Queue (Phase 3.3) ───────────────────────────────────
  // Replaces the old direct-call autosave with a diff-based, queue-backed system.
  const patchQueue = useWorkflowPatchQueue(
    async (job) => {
      const res = await orthodonticsApi.patchWorkflow(
        caseId!,
        job.changes,
        job.expectedVersion,
        { trigger: 'AUTO' }
      );
      const newVersion = res.data?.data?.workflowVersion;
      const newSnapshotId = res.data?.data?.currentSnapshotId;
      if (typeof newVersion === 'number') {
        workflowVersionRef.current = newVersion;
      }
      if (newSnapshotId) {
        currentSnapshotIdRef.current = newSnapshotId;
      }
      return { version: newVersion, snapshotId: newSnapshotId ?? null };
    },
    {
      onSuccess: (result) => {
        // Update last-saved baseline so next diff is relative to this commit
        lastSavedPayloadRef.current = buildWorkflowPayload();
        // ✅ OFFLINE-FIRST: server confirmed save — safe to clear local draft
        if (caseId) clearDraft(caseId).catch(() => {});
        if (isMountedRef.current) {
          setSaveStatus('saved');
          setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 3000);
        }
      },
      onError: (err) => {
        if (isMountedRef.current) {
          setSaveStatus('error');
          setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 5000);
        }
      },
      onConflict: (serverVersion) => {
        console.warn('[CaseWorkflowContainer] PATCH 409 — auto-resolving to v' + serverVersion);
      },
      fetchFresh: async () => {
        const res = await orthodonticsApi.getWorkflow(caseId!);
        const freshData = res.data?.data;
        const freshVersion = freshData?.workflowVersion ?? workflowVersionRef.current;
        if (typeof freshVersion === 'number') {
          workflowVersionRef.current = freshVersion;
        }
        if (freshData?.workflowData?.recordSets) {
          allRecordSetsRef.current = freshData.workflowData.recordSets.map((rs: any) => ({
            ...rs,
            records: (rs.records?.length > 0 ? rs.records : rs.photos) || [],
          }));
        }
        // Reset diff baseline to server state so next diff is correct
        lastSavedPayloadRef.current = freshData?.workflowData ?? null;
        return { workflowVersion: freshVersion, workflowData: freshData?.workflowData ?? {} };
      },
      offlineStorageKey: `wf_queue_${caseId ?? 'unknown'}`,
    }
  );


  const persistWorkflow = useCallback(async (trigger: 'SAVE' | 'AUTO' | 'SHARE' | 'APPROVE' | 'RESTORE' | 'IMPORT' = 'SAVE') => {
    if (!caseId) {
      console.log('[CaseWorkflowContainer] SKIP SAVE: no caseId');
      return;
    }

    // ── SAVE LOCK: drop if a save is already in-flight ─────────────────────
    // Root cause of 409 spam: parallel saves each send expectedVersion=N.
    // By the time save #2 arrives, the DB is at N+1 → conflict.
    // Fix: only one save in-flight at a time. The in-flight save already
    // reads latestRecordSetRef (ref-based, never stale) so no data is lost.
    if (isSavingRef.current) {
      console.log(`[CaseWorkflowContainer] SKIP SAVE [${trigger}]: save already in-flight`);
      return;
    }

    isSavingRef.current = true;

    const payload = buildWorkflowPayload();
    console.log(`[CaseWorkflowContainer] PERSIST [${trigger}] v` + workflowVersionRef.current + ':', {
      caseId,
      photosWithUrl: payload.recordSets?.[0]?.records?.filter((r: any) => r.url).length,
    });

    if (isMountedRef.current) setSaveStatus('saving');
    try {
      const response = await orthodonticsApi.saveWorkflow(caseId, payload, workflowVersionRef.current, { trigger });
      
      // Update version + snapshot pointer from server response
      const newVersion = response.data?.data?.workflowVersion;
      const newSnapshotId = response.data?.data?.snapshotId;
      if (typeof newVersion === 'number') {
        workflowVersionRef.current = newVersion;
      }
      if (newSnapshotId) {
        currentSnapshotIdRef.current = newSnapshotId;
      }
      
      console.log('[CaseWorkflowContainer] SAVE OK v' + workflowVersionRef.current, 'snap=' + (newSnapshotId || 'none'));
      if (isMountedRef.current) {
        setSaveStatus('saved');
        setTimeout(() => {
          if (isMountedRef.current) setSaveStatus('idle');
        }, 3000);
      }
    } catch (err: any) {
      // ── Handle VERSION_CONFLICT (409) ──
      if (err?.response?.status === 409) {
        console.warn('[CaseWorkflowContainer] VERSION CONFLICT — reloading from server');
        const serverVersion = err.response?.data?.error?.currentVersion;
        if (typeof serverVersion === 'number') {
          workflowVersionRef.current = serverVersion;
        }
        // Reload fresh data from server
        try {
          const fresh = await orthodonticsApi.getWorkflow(caseId);
          const freshData = fresh.data?.data;
          if (freshData?.workflowVersion != null) {
            workflowVersionRef.current = freshData.workflowVersion;
          }
          if (freshData?.workflowData?.recordSets) {
            allRecordSetsRef.current = freshData.workflowData.recordSets.map((rs: any) => ({
              ...rs,
              records: (rs.records?.length > 0 ? rs.records : rs.photos) || [],
            }));
          }
          if (isMountedRef.current) {
            setSaveStatus('error');
            setTimeout(() => { if (isMountedRef.current) setSaveStatus('idle'); }, 5000);
          }
        } catch (reloadErr) {
          console.error('[CaseWorkflowContainer] Failed to reload after conflict:', reloadErr);
        }
        return;
      }
      
      console.error('[CaseWorkflowContainer] SAVE FAILED:', err);
      if (isMountedRef.current) {
        setSaveStatus('error');
        setTimeout(() => {
          if (isMountedRef.current) setSaveStatus('idle');
        }, 5000);
      }
    } finally {
      // Always release the lock — even on error / conflict
      isSavingRef.current = false;
    }
  }, [caseId, buildWorkflowPayload]);

  // ── Enterprise Autosave Effect (Phase 3.3) ──────────────────────────────────
  // Fires on any workflow state change. Computes a diff against the last known
  // committed state — only enqueues if something actually changed.
  // The queue coalesces rapid changes within 50ms and sends one PATCH.
  useEffect(() => {
    if (!isLoaded) return;
    if (!caseId) return;

    // 600ms debounce before computing diff + enqueueing
    const timer = setTimeout(() => {
      const currentPayload = buildWorkflowPayload();
      const diff = computeWorkflowDiff(lastSavedPayloadRef.current, currentPayload);

      if (Object.keys(diff).length === 0) {
        // Nothing changed — skip (this is the key cost saving vs old system)
        return;
      }

      if (isMountedRef.current) setSaveStatus('saving');

      patchQueue.enqueue({
        changes: diff,
        expectedVersion: workflowVersionRef.current,
      });
    }, 600);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, treatmentGoals, treatmentOptions, selectedOptionId, isLoaded, caseId, recordSetVersion]);


  // Cleanup on unmount — FLUSH pending patch queue instead of dropping it
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      // FLUSH: drain any pending patch before unmount (fire-and-forget)
      patchQueue.flush().catch(() => {
        // If flush fails (e.g. offline), it's already persisted to localStorage
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);


  // ─── Step Completion Tracking ───────────────────────────────
  const stepCompletion = useMemo(() => {
    const records = safeData.records || [];
    const uploadedPhotos = records.filter(r => r.url);
    
    return [
      uploadedPhotos.length >= 1,                     // Step 0: Records — at least 1 photo
      true,                                            // Step 1: Analysis — always passable (review step)
      !!safeData.problemList,                          // Step 2: Problems — problem list exists
      treatmentGoals.length > 0,                       // Step 3: Goals — at least 1 goal
      !!selectedOptionId,                              // Step 4: Options — option selected
      !!safeData.treatmentPlan && !!selectedOptionId,  // Step 5: Final Plan — plan + option
    ];
  }, [safeData, treatmentGoals, selectedOptionId]);

  // ─── Validation Gates ───────────────────────────────────────
  const validateStep = useCallback((stepIndex: number): ValidationResult => {
    switch (WORKFLOW_STEPS[stepIndex]?.id) {
      case 'records': {
        const photos = (safeData.records || []).filter(r => r.url);
        if (photos.length === 0) {
          return { valid: false, message: 'Upload at least one clinical photo before proceeding.' };
        }
        return { valid: true, message: '' };
      }

      case 'analysis':
        return { valid: true, message: '' };

      case 'problems': {
        if (!safeData.problemList) {
          return { valid: false, message: 'Define the problem list before proceeding to goals.' };
        }
        return { valid: true, message: '' };
      }

      case 'goals': {
        if (treatmentGoals.length === 0) {
          return { valid: false, message: 'Define at least one treatment goal before proceeding.' };
        }
        return { valid: true, message: '' };
      }

      case 'options': {
        if (!selectedOptionId) {
          return { valid: false, message: 'Select a treatment option before proceeding to the final plan.' };
        }
        return { valid: true, message: '' };
      }

      case 'final':
        return { valid: true, message: '' };

      default:
        return { valid: true, message: '' };
    }
  }, [safeData, treatmentGoals, selectedOptionId]);

  // ─── Navigation Handlers ────────────────────────────────────
  const handleNext = useCallback(() => {
    const validation = validateStep(currentStep);
    if (!validation.valid) {
      setValidationError(validation.message);
      setTimeout(() => setValidationError(null), 4000);
      return;
    }
    setValidationError(null);

    const nextStep = currentStep + 1;
    const nextStepId = WORKFLOW_STEPS[nextStep]?.id;

    // ─── Auto-Derivation Hooks ───────────────────────────────
    // Runs ONCE when entering a step for the first time (lists empty)

    // Entering Problems step → derive from ceph analysis
    if (nextStepId === 'problems' && derivedProblems.length === 0) {
      const derived = deriveProblemsFromCeph(safeData);
      if (derived.length > 0) {
        setDerivedProblems(derived);
        console.log('[Workflow] Auto-derived problems from ceph:', derived.length);
      }
    }

    // Entering Options step → suggest options from problems
    if (nextStepId === 'options' && treatmentOptions.length === 0) {
      const suggested = suggestOptionsFromProblems(derivedProblems);
      if (suggested.length > 0) {
        setTreatmentOptions(suggested as TreatmentOption[]);
        console.log('[Workflow] Auto-suggested treatment options:', suggested.length);
      }
    }

    setCurrentStep(Math.min(nextStep, WORKFLOW_STEPS.length - 1));
  }, [currentStep, validateStep, safeData, derivedProblems, treatmentOptions.length]);

  const handleBack = useCallback(() => {
    setValidationError(null);
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleStepClick = useCallback((index: number) => {
    if (index <= currentStep || stepCompletion[index]) {
      setValidationError(null);
      setCurrentStep(index);
    }
  }, [currentStep, stepCompletion]);

  // Manual save — immediate, bypasses debounce
  const handleSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    await persistWorkflow();
  }, [persistWorkflow]);

  const handleApprove = useCallback(() => {
    console.log('[CaseWorkflowContainer] Treatment plan approved:', {
      recordSet: safeData.id,
      goals: treatmentGoals,
      selectedOption,
      plan: safeData.treatmentPlan,
    });
    // Save final state immediately on approve
    persistWorkflow('APPROVE');
  }, [safeData, treatmentGoals, selectedOption, persistWorkflow]);

  // ─── Pass-through handlers for existing components ──────────
  // PHASE 1: Ref-based stable callback — eliminates stale closure.
  // onUpdateRef always holds the latest onUpdate from parent.
  //
  // All child components (OrthoRecordsTab, CastAnalysisModal, CephPanel, etc.)
  // call onUpdate → handleRecordSetUpdate → updateRecordSet (single path).
  // updateRecordSet guarantees ref freshness AND autosave trigger.
  const handleRecordSetUpdate = useCallback((update: Partial<RecordSet>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[CaseWorkflowContainer] RECEIVED UPDATE:', {
        keys: Object.keys(update),
        hasRecords: !!update.records,
        photosWithUrl: update.records?.filter(r => r.url).length ?? 'N/A',
        hasCastAnalysis: !!(update as any).castAnalysis,
      });
    }

    // ✅ Use canonical mutator — bumps ref AND triggers autosave effect
    updateRecordSet(update, 'handleRecordSetUpdate');

    // Pass through to parent via ref (never stale)
    onUpdateRef.current(update);
  }, [updateRecordSet]);

  // ── PHASE 2+3: Transactional flush — persist to backend THEN sync to parent ───
  // Called by OrthoCasesTab BEFORE opening the share modal.
  // Drains the patch queue first, then falls back to full PUT for reliability.
  const flushToParent = useCallback(async () => {
    if (latestRecordSetRef.current) {
      console.log('[CaseWorkflowContainer] TRANSACTIONAL FLUSH:', {
        photosWithUrl: latestRecordSetRef.current.records?.filter(r => r.url)?.length ?? 'N/A',
        version: workflowVersionRef.current,
      });
      // Step 1: Flush any pending patch queue items (enterprise autosave)
      await patchQueue.flush();
      // Step 2: Full PUT to ensure complete state is committed (share requires full data)
      await persistWorkflow();
      // Step 3: Sync to parent (UI)
      onUpdateRef.current(latestRecordSetRef.current);
    }
  }, [persistWorkflow, patchQueue]);


  // Get ALL record sets (fully hydrated, from ref — never stale)
  const getRecordSets = useCallback(() => {
    // Build the most up-to-date picture by merging the active set into allRecordSetsRef
    const thisSet = {
      ...(safeData || {}),
      ...(latestRecordSetRef.current || {}),
    };
    const existingSets = allRecordSetsRef.current;
    if (existingSets.length === 0) return thisSet.id ? [thisSet] : [];
    // Replace matching set with fresh data
    const merged = existingSets.map((rs: any) =>
      rs.id === thisSet.id ? { ...rs, ...thisSet } : rs
    );
    return merged;
  }, [safeData]);

  // ─── Save Status Indicator ──────────────────────────────────
  const SaveStatusBadge = () => {
    if (!caseId) return null; // No backend — no save indicator

    switch (saveStatus) {
      case 'saving':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
          </span>
        );
      case 'saved':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
            <Cloud className="w-3 h-3" /> Saved
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
            <CloudOff className="w-3 h-3" /> Save failed
          </span>
        );
      default:
        return null;
    }
  };

  // ─── Render Step Content ────────────────────────────────────
  const renderStepContent = () => {
    const stepId = WORKFLOW_STEPS[currentStep]?.id;

    switch (stepId) {
      case 'records':
        return (
          <OrthoRecordsTab
            key={safeData.id}
            patientId={patientId}
            patientName={patientName}
            caseId={caseId}
            initialData={safeData}
            onUpdate={handleRecordSetUpdate}
            registerActions={(childActions) => {
              // Intercept: inject flushToParent from CaseWorkflowContainer,
              // then forward the combined actions to the grandparent (OrthoCasesTab).
              registerActions?.({
                ...childActions,
                flushToParent,
                getRecordSets,
              });
            }}
          />
        );

      case 'analysis':
        return (
          <AnalysisStep
            data={safeData}
            onComplete={() => handleNext()}
          />
        );

      case 'problems':
        return (
          <ProblemListTab
            data={safeData}
            onUpdate={handleRecordSetUpdate}
            onOpenPhotoViewer={() => { /* Photo viewer is available in Records step */ }}
          />
        );

      case 'goals':
        return (
          <GoalsStep
            data={safeData}
            goals={treatmentGoals}
            onGoalsChange={setTreatmentGoals}
          />
        );

      case 'options':
        return (
          <TreatmentOptionsStep
            goals={treatmentGoals}
            options={treatmentOptions}
            selectedOptionId={selectedOptionId}
            onOptionsChange={setTreatmentOptions}
            onSelectOption={setSelectedOptionId}
          />
        );

      case 'final':
        return (
          <FinalPlanStep
            data={safeData}
            goals={treatmentGoals}
            selectedOption={selectedOption}
            onApprove={handleApprove}
          />
        );

      default:
        return null;
    }
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Stepper */}
      <WorkflowStepper
        currentStep={currentStep}
        completedSteps={stepCompletion}
        onStepClick={handleStepClick}
      />

      {/* Validation Error Banner */}
      <AnimatePresence>
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-xl"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm text-amber-700 font-medium">{validationError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {renderStepContent()}
        </motion.div>
      </AnimatePresence>

      {/* Navigation Bar */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur-xl border-t border-slate-200 rounded-t-2xl shadow-lg p-4 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Back button */}
          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-50 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <SaveStatusBadge />
          </div>

          {/* Center: Step indicators */}
          <div className="flex items-center gap-1.5">
            {WORKFLOW_STEPS.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-6 bg-blue-600'
                    : stepCompletion[index]
                      ? 'bg-emerald-500'
                      : 'bg-slate-200'
                }`}
              />
            ))}
          </div>

          {/* Right: Save + Next buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || !caseId}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
              title={!caseId ? 'Save unavailable — no backend case linked' : 'Save workflow'}
            >
              {saveStatus === 'saving' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveStatus === 'saved' ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>

            {currentStep < WORKFLOW_STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-600/20"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleApprove}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve Plan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseWorkflowContainer;
