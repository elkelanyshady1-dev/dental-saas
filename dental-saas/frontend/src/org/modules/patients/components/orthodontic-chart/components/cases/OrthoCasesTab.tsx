import React, { useState, useCallback, useEffect, useRef } from 'react';
import { LayoutGrid, Plus, Smile, Calendar, Activity, ChevronRight, Eye, Edit3, XCircle, ArrowLeft, X, Save, FileText, Share2, Download, Printer, Loader2, GitCompare, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Case, RecordSet } from '../../types';
import CaseWorkflowContainer, { OrthoActions } from './workflow/CaseWorkflowContainer';
import ShareCaseModal from './ShareCaseModal';
import { caseApi as orthodonticsApi } from '../../api/case.api';
import { useAuth } from '@/context/AuthContext';
import { CompareEngine } from './compare';
import AppModal from '@/components/ui/AppModal';

interface OrthoCasesTabProps {
  patientId: string;
  patientName?: string;
  cases?: Case[];
  onOpenSnapshotEditor?: (appointmentId: string) => void;
}

const OrthoCasesTab: React.FC<OrthoCasesTabProps> = ({ patientId, patientName, cases: initialCases = [], onOpenSnapshotEditor }) => {
  const [cases, setCases] = useState<Case[]>(Array.isArray(initialCases) ? initialCases : []);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedRecordSetId, setSelectedRecordSetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const [isAddRecordSetModalOpen, setIsAddRecordSetModalOpen] = useState(false);
  const [newRecordSetName, setNewRecordSetName] = useState('Mid-record');
  const [newRecordSetDate, setNewRecordSetDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRecordSetComplaint, setNewRecordSetComplaint] = useState('');
  const [isClosingCase, setIsClosingCase] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const { token } = useAuth();

  // ── Modal state for confirm dialogs ─────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    title: string;
    description: string;
    type: 'default' | 'danger' | 'warning' | 'success';
    confirmText: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);

  // Action bridge — receives working handlers from OrthoRecordsTab via CaseWorkflowContainer
  const actionsRef = useRef<OrthoActions>({ print: null, exportPdf: null, share: null, flushToParent: null, getRecordSets: null });

  // PHASE 5: Track whether OrthoRecordsTab has sent at least one onUpdate.
  // Until this fires, the recordSets in selectedCase may still have initial-load data.
  const [isRecordSetHydrated, setIsRecordSetHydrated] = useState(false);
  const handleRegisterActions = useCallback((actions: OrthoActions) => {
    actionsRef.current = actions;
  }, []);

  // ─── Load cases from backend on mount ───────────────────────────
  useEffect(() => {
    if (!patientId || patientId === 'unknown') {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const loadCases = async () => {
      try {
        const response = await orthodonticsApi.listByPatient(patientId);
        if (cancelled) return;
        const backendCases = response.data?.data || response.data?.cases || [];
        
        // Map backend cases to frontend Case type
        const mapped: Case[] = backendCases.map((bc: any) => ({
          id: String(bc._id ?? bc.id ?? ''),   // cast ObjectId → string defensively
          patientId: bc.patientId,
          caseType: bc.caseType || 'Comprehensive',
          status: bc.status || 'draft',
          startDate: bc.createdAt ? new Date(bc.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          progress: 0,
          problemList: [],
          treatmentPlan: [],
          timeline: [],
          // NOTE: The list DTO (/org/orthodontic-cases?patientId=) does NOT include workflowData.
          // recordSets are hydrated lazily when the user opens a case (via /workflow endpoint).
          // Attempting to read bc.workflowData?.recordSets here always returns [] and logs
          // '[OrthoCasesTab] Loaded 1 cases. Sets: [Array(0)]' — which is expected and correct.
          recordSets: [],
        }));

        setCases(mapped);
        console.log('[OrthoCasesTab] Loaded', mapped.length, 'cases. Sets:', mapped.map(c => 
          (c.recordSets || []).map((rs: any) => `${rs.name}(${rs.records?.filter((r: any) => r.url)?.length ?? 0} photos)`)
        ));
      } catch (err: any) {
        if (err?.response?.status !== 404) {
          console.error('[OrthoCasesTab] Failed to load cases:', err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadCases();
    return () => { cancelled = true; };
  }, [patientId]);

  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);

  const handleSelectCase = async (c: Case) => {
    // Normalize immediately — show the case detail view without recordSets first
    const normalized = {
      ...c,
      recordSets:   c.recordSets   || [],
      problemList:  c.problemList  || [],
      treatmentPlan: c.treatmentPlan || [],
      timeline:     c.timeline     || [],
    };
    setSelectedCase(normalized);
    setSelectedRecordSetId(null);
    setIsRecordSetHydrated(false);

    // Fetch workflow data lazily — list DTO does NOT include workflowData
    setIsLoadingWorkflow(true);
    try {
      const wfRes = await orthodonticsApi.getWorkflow(c.id);
      const wfData = wfRes.data?.data?.workflowData || wfRes.data?.workflowData || null;

      if (wfData?.recordSets?.length) {
        const hydratedRecordSets = wfData.recordSets.map((rs: any) => {
          // Prefer `records` (frontend-saved), fallback to `photos` (legacy)
          const mergedRecords = (rs.records?.length > 0 ? rs.records : rs.photos) || [];
          return {
            id: rs.id,
            name: rs.name || 'Record Set',
            date: rs.date || '',
            type: rs.type || undefined,
            records: mergedRecords,
            chiefComplaint: rs.chiefComplaint || '',
            audioUrl: rs.audioUrl || null,
            stlFiles: rs.stlFiles || [],
            problemList: rs.problemList || null,
            treatmentPlan: rs.treatmentPlan || null,
          };
        });

        setSelectedCase(prev => prev ? { ...prev, recordSets: hydratedRecordSets } : null);
        setSelectedRecordSetId(hydratedRecordSets[0]?.id ?? null);
      }
    } catch (err: any) {
      // 404 = no workflow yet (new case) — not an error
      if (err?.response?.status !== 404) {
        console.error('[OrthoCasesTab] Failed to load workflow for case:', c.id, err);
      }
    } finally {
      setIsLoadingWorkflow(false);
    }
  };


  // PHASE 6: Functional setState — eliminates stale closure dependency on selectedCase.
  // Uses `prev` from React, always up-to-date. No more stale capture.
  const handleUpdateRecordSet = useCallback((updatedData: Partial<RecordSet>) => {
    // Mark as hydrated — OrthoRecordsTab has sent actual record data
    setIsRecordSetHydrated(true);
    
    setSelectedCase(prev => {
      if (!prev || !selectedRecordSetId) return prev;
      const safeRecordSets = prev.recordSets || [];
      const updatedRecordSets = safeRecordSets.map(rs =>
        rs.id === selectedRecordSetId ? { ...rs, ...updatedData } : rs
      );
      const updatedCase = { ...prev, recordSets: updatedRecordSets };

      // DEBUG: Log what the share modal will see
      console.log('[OrthoCasesTab] handleUpdateRecordSet:', {
        activeSetId: selectedRecordSetId,
        updatedDataKeys: Object.keys(updatedData),
        updatedRecordsWithUrl: updatedData.records?.filter(r => r.url)?.length ?? 'N/A',
        allSetsAfterUpdate: updatedRecordSets.map(rs => ({
          id: rs.id, name: rs.name,
          recordsCount: rs.records?.length,
          recordsWithUrl: rs.records?.filter(r => r.url)?.length,
        })),
      });

      // Also update the cases array
      setCases(prevCases => prevCases.map(c => c.id === prev.id ? updatedCase : c));
      return updatedCase;
    });
  }, [selectedRecordSetId]);

  // Fresh record sets fetched from CaseWorkflowContainer right before share modal opens.
  // This bypasses stale React state — reads directly from ref.
  const [freshRecordSets, setFreshRecordSets] = useState<RecordSet[]>([]);
  const [isPreparingShare, setIsPreparingShare] = useState(false);

  const handleOpenShare = useCallback(async () => {
    // Readiness guard: don't open share if not hydrated yet
    if (!isRecordSetHydrated) {
      console.warn('[OrthoCasesTab] Share blocked — records not hydrated yet');
      return;
    }
    
    setIsPreparingShare(true);
    try {
      // Transactional flush: persist to backend, then sync to parent
      await actionsRef.current.flushToParent?.();

      // Get fresh record sets directly from the workflow container ref (never stale)
      const fresh = actionsRef.current.getRecordSets?.() || [];
      console.log('[OrthoCasesTab] Fresh record sets for share:', fresh.map(rs => ({
        id: rs.id?.slice(-6), name: rs.name,
        photos: rs.records?.filter((r: any) => r.url)?.length ?? 0,
        total: rs.records?.length ?? 0,
      })));
      setFreshRecordSets(fresh);

      setIsShareModalOpen(true);
    } catch (err) {
      console.error('[OrthoCasesTab] Flush before share failed:', err);
      // Fallback: try to get fresh data anyway
      const fresh = actionsRef.current.getRecordSets?.() || selectedCase?.recordSets || [];
      setFreshRecordSets(fresh);
      setIsShareModalOpen(true);
    } finally {
      setIsPreparingShare(false);
    }
  }, [isRecordSetHydrated, selectedCase]);

  const handleAddCase = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      // Create case in backend — returns real MongoDB _id
      const response = await orthodonticsApi.create({
        patientId,
        caseType: 'comprehensive',
      });

      const backendCase = response.data?.data || response.data;
      const realId = backendCase._id;

      if (!realId) {
        console.error('[OrthoCasesTab] Backend did not return _id:', backendCase);
        return;
      }

      // Create initial record set
      const initialRecordSet: RecordSet = {
        id: `rs-${Math.random().toString(36).substr(2, 9)}`,
        name: 'Pre-record',
        type: 'PRE',
        date: new Date().toISOString().split('T')[0],
        records: [],
        chiefComplaint: '',
        audioUrl: null,
        stlFiles: []
      };

      // Save the initial record set to backend immediately
      try {
        await orthodonticsApi.saveWorkflow(realId, {
          currentStep: 0,
          recordSets: [initialRecordSet],
        });
      } catch (saveErr) {
        console.warn('[OrthoCasesTab] Initial workflow save failed (non-critical):', saveErr);
      }

      const newCase: Case = {
        id: realId, // ← REAL MongoDB ObjectId
        patientId,
        caseType: backendCase.caseType || 'Comprehensive',
        status: backendCase.status || 'draft',
        startDate: new Date().toISOString().split('T')[0],
        progress: 0,
        problemList: [],
        treatmentPlan: [],
        timeline: [],
        recordSets: [initialRecordSet],
      };

      setCases(prev => [...prev, newCase]);
      console.log('[OrthoCasesTab] Case created with real ID:', realId);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        // Case already exists for this patient — reload the list to surface it
        console.info('[OrthoCasesTab] Case already exists (409) — reloading existing cases');
        try {
          const response = await orthodonticsApi.listByPatient(patientId);
          const backendCases = response.data?.data || response.data?.cases || [];
          const mapped: Case[] = backendCases.map((bc: any) => ({
            id: String(bc._id ?? bc.id ?? ''),
            patientId: bc.patientId,
            caseType: bc.caseType || 'Comprehensive',
            status: bc.status || 'draft',
            startDate: bc.createdAt ? new Date(bc.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            progress: 0,
            problemList: [],
            treatmentPlan: [],
            timeline: [],
            recordSets: [],
          }));
          setCases(mapped);
        } catch (reloadErr) {
          console.error('[OrthoCasesTab] Failed to reload cases after 409:', reloadErr);
        }
      } else {
        console.error('[OrthoCasesTab] Failed to create case:', err);
        // Show error modal instead of alert
        setModalData({
          title: 'Error',
          description: 'Failed to create orthodontic case. Please try again.',
          type: 'danger',
          confirmText: 'OK',
          onConfirm: async () => { setIsModalOpen(false); },
        });
        setIsModalOpen(true);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenAddRecordSetModal = () => {
    setNewRecordSetName('Mid-record');
    setNewRecordSetDate(new Date().toISOString().split('T')[0]);
    setNewRecordSetComplaint('');
    setIsAddRecordSetModalOpen(true);
  };

  const handleConfirmAddRecordSet = () => {
    if (!selectedCase) return;
    
    // Derive type from name
    const deriveRecordSetType = (name: string): RecordSet['type'] => {
      const lower = name.toLowerCase();
      if (lower.includes('pre')) return 'PRE';
      if (lower.includes('mid')) return 'MID';
      if (lower.includes('post') || lower.includes('final')) return 'POST';
      return 'CUSTOM';
    };

    const newRecordSet: RecordSet = {
      id: `rs-${Math.random().toString(36).substr(2, 9)}`,
      name: newRecordSetName,
      type: deriveRecordSetType(newRecordSetName),
      date: newRecordSetDate,
      records: [],
      chiefComplaint: newRecordSetComplaint,
      audioUrl: null,
      stlFiles: []
    };

    const updatedCase = {
      ...selectedCase,
      recordSets: [...(selectedCase.recordSets || []), newRecordSet]
    };

    setCases(cases.map(c => c.id === selectedCase.id ? updatedCase : c));
    setSelectedCase(updatedCase);
    setSelectedRecordSetId(newRecordSet.id);
    setIsAddRecordSetModalOpen(false);
  };

  // ── Close Case Handler ─────────────────────────────────────────────
  const handleCloseCase = useCallback(async (caseToClose: Case) => {
    if (isClosingCase) return;

    // Open confirmation modal
    setModalData({
      title: 'Close Case',
      description: 'Are you sure you want to close this case? This action can be reversed later by changing the case status.',
      type: 'danger',
      confirmText: 'Close Case',
      onConfirm: async () => {
        setIsClosingCase(true);
        try {
          // FSM: active → completed ("closed" is not a valid FSM state — use 'completed')
          await orthodonticsApi.updateCaseStatus(caseToClose.id, 'completed');
          setCases(prev => prev.map(c => c.id === caseToClose.id ? { ...c, status: 'completed' } : c));
          if (selectedCase?.id === caseToClose.id) {
            setSelectedCase(prev => prev ? { ...prev, status: 'completed' } : null);
          }
          setIsModalOpen(false);
        } catch (err) {
          console.error('[OrthoCasesTab] Failed to close case:', err);
          // Show error in a second modal
          setModalData({
            title: 'Error',
            description: 'Failed to close case. Please try again.',
            type: 'danger',
            confirmText: 'OK',
            onConfirm: async () => { setIsModalOpen(false); },
          });
        } finally {
          setIsClosingCase(false);
        }
      },
    });
    setIsModalOpen(true);
  }, [isClosingCase, selectedCase]);

  // ── Delete Case Handler ─────────────────────────────────────────────
  const [isDeletingCase, setIsDeletingCase] = useState(false);

  const handleDeleteCase = useCallback(async (caseToDelete: Case) => {
    if (isDeletingCase) return;

    // Open confirmation modal
    setModalData({
      title: 'Delete Case',
      description: 'This will permanently remove this case from active records. You can restore later from admin tools if needed.',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        setIsDeletingCase(true);
        try {
          await orthodonticsApi.deleteCase(caseToDelete.id);
          // Remove from local state
          setCases(prev => prev.filter(c => c.id !== caseToDelete.id));
          // Close detail view if deleted case was selected
          if (selectedCase?.id === caseToDelete.id) {
            setSelectedCase(null);
          }
          setIsModalOpen(false);
        } catch (err: any) {
          console.error('[OrthoCasesTab] Failed to delete case:', err);
          const errorMsg = err?.response?.data?.error?.message || 'Failed to delete case. Please try again.';
          setModalData({
            title: 'Error',
            description: errorMsg,
            type: 'danger',
            confirmText: 'OK',
            onConfirm: async () => { setIsModalOpen(false); },
          });
        } finally {
          setIsDeletingCase(false);
        }
      },
    });
    setIsModalOpen(true);
  }, [isDeletingCase, selectedCase]);

  if (selectedCase) {
    const safeRecordSets = selectedCase.recordSets || [];
    const activeRecordSet = safeRecordSets.find(rs => rs.id === selectedRecordSetId);
    
    // Concise trace: what the Share modal will receive
    if (isShareModalOpen) {
      console.log('[OrthoCasesTab] Share data:', safeRecordSets.map(rs => ({
        id: rs.id?.slice(-6), name: rs.name, type: rs.type,
        photos: rs.records?.filter(r => r.url)?.length ?? 0,
        total: rs.records?.length ?? 0,
      })));
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedCase(null)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Case #{(selectedCase.id ?? '').slice(-6).toUpperCase()}</h3>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{selectedCase.caseType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1 p-1 bg-blue-50/30 border border-dashed border-blue-200 rounded-2xl mr-4">
              <button
                onClick={handleOpenShare}
                disabled={isPreparingShare || !isRecordSetHydrated}
                className={`flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider group ${
                  isPreparingShare || !isRecordSetHydrated
                    ? 'text-slate-400 cursor-wait'
                    : 'text-slate-600 hover:text-blue-600'
                }`}
                title={!isRecordSetHydrated ? 'Loading records...' : 'Share records'}
              >
                {isPreparingShare 
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Share2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                }
                {isPreparingShare ? 'Preparing...' : 'Share'}
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button
                onClick={() => actionsRef.current.exportPdf?.()}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group"
                title="Export as PDF"
              >
                <Download className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Export
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button
                onClick={() => actionsRef.current.print?.()}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group"
                title="Print records"
              >
                <Printer className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Print
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button
                onClick={() => setIsCompareOpen(true)}
                disabled={(selectedCase.recordSets || []).length < 2}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wider group ${
                  (selectedCase.recordSets || []).length < 2
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'hover:bg-white text-slate-600 hover:text-blue-600'
                }`}
                title={(selectedCase.recordSets || []).length < 2 ? 'Need at least 2 record sets to compare' : 'Compare record sets'}
              >
                <GitCompare className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Compare
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button
                disabled
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-slate-300 text-[10px] font-bold uppercase tracking-wider cursor-not-allowed"
                title="Edit Case — Coming soon"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </button>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100 whitespace-nowrap">
              {selectedCase.status}
            </span>
          </div>
        </div>

        {/* Record Sets Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
          {(selectedCase.recordSets || []).map((rs) => (
            <button
              key={rs.id}
              onClick={() => setSelectedRecordSetId(rs.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedRecordSetId === rs.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 opacity-60" />
              {rs.name}
              <span className="text-[10px] opacity-60 font-medium">({rs.date})</span>
            </button>
          ))}
          <button 
            onClick={handleOpenAddRecordSetModal}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors border border-dashed border-slate-300"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Record Set
          </button>
        </div>

        {isLoadingWorkflow ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-3 text-sm text-slate-500">Loading records…</span>
          </div>
        ) : activeRecordSet ? (
          <CaseWorkflowContainer 
            key={activeRecordSet.id} 
            patientId={patientId}
            patientName={patientName}
            caseId={selectedCase?.id}
            initialData={activeRecordSet} 
            onUpdate={handleUpdateRecordSet}
            registerActions={handleRegisterActions}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
              <LayoutGrid className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-800 mb-2">No Record Sets Found</h4>
            <p className="text-sm text-slate-500 mb-6">Start by adding a pre-record, mid-record, or post-record set.</p>
            <button 
              onClick={handleOpenAddRecordSetModal}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />

              Create First Record Set
            </button>
          </div>
        )}

        {/* Add Record Set Modal */}
        <AnimatePresence>
          {isAddRecordSetModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddRecordSetModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Add Record Set</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Clinical Record</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsAddRecordSetModalOpen(false)}
                    className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      Record Set Name
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Pre-record', 'Mid-record', 'Post-record'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewRecordSetName(preset)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                            newRecordSetName === preset
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text"
                      value={newRecordSetName}
                      onChange={(e) => setNewRecordSetName(e.target.value)}
                      placeholder="e.g. Mid-record, Post-record"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Record Date
                    </label>
                    <input 
                      type="date"
                      value={newRecordSetDate}
                      onChange={(e) => setNewRecordSetDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      Chief Complaint / Details
                    </label>
                    <textarea 
                      value={newRecordSetComplaint}
                      onChange={(e) => setNewRecordSetComplaint(e.target.value)}
                      placeholder="Enter clinical details or patient complaint..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
                    />
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                  <button 
                    onClick={() => setIsAddRecordSetModalOpen(false)}
                    className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmAddRecordSet}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Create Set
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Share Case Modal */}
        <ShareCaseModal
          isOpen={isShareModalOpen}
          caseId={selectedCase.id}
          recordSets={freshRecordSets.length > 0 ? freshRecordSets : safeRecordSets}
          token={token}
          onClose={() => setIsShareModalOpen(false)}
        />

        {/* Compare Engine Modal */}
        <CompareEngine
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          recordSets={safeRecordSets}
          caseId={selectedCase.id}
        />

        {/* Confirmation Modal */}
        <AppModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onConfirm={modalData?.onConfirm || (async () => {})}
          title={modalData?.title || ''}
          description={modalData?.description || ''}
          type={modalData?.type || 'default'}
          confirmText={modalData?.confirmText || 'Confirm'}
          loading={isClosingCase || isDeletingCase || isModalLoading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Orthodontic Cases</h3>
        <button 
          onClick={handleAddCase}
          disabled={isCreating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Create New Orthodontic Case
            </>
          )}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Smile className="w-8 h-8" />
          </div>
          <h4 className="text-lg font-bold text-slate-800 mb-2">No Orthodontic Cases</h4>
          <p className="text-sm text-slate-500 mb-6">Create your first orthodontic case to get started.</p>
          <button
            onClick={handleAddCase}
            disabled={isCreating}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create First Case
          </button>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cases.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Smile className="w-6 h-6" />
                </div>
                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100">
                  {c.status}
                </span>
              </div>
              
              <h4 className="text-lg font-bold text-slate-800 mb-1">Case #{(c.id ?? '').slice(-6).toUpperCase()}</h4>
              <p className="text-xs font-medium text-slate-500 mb-4">{c.caseType}</p>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">Start Date</span>
                  <span className="font-bold text-slate-700">{c.startDate}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">Record Sets</span>
                  <span className="font-bold text-slate-700">{c.recordSets?.length || 0} Sets</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress</span>
                    <span className="text-[10px] font-bold text-blue-600">{c.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.progress}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleSelectCase(c)}
                  className="flex items-center justify-center gap-2 py-2 bg-slate-50 text-slate-700 rounded-xl text-[10px] font-bold hover:bg-slate-100 transition-colors border border-slate-100"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open Case
                </button>
              <button 
                onClick={() => onOpenSnapshotEditor?.(c.id)}
                  className="flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Snapshot Editor
                </button>
              </div>
              
              <button 
                onClick={() => handleCloseCase(c)}
                disabled={isClosingCase || c.status === 'closed'}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <XCircle className="w-3.5 h-3.5" />
                {c.status === 'closed' ? 'Case Closed' : isClosingCase ? 'Closing...' : 'Close Case'}
              </button>

              <button 
                onClick={() => handleDeleteCase(c)}
                disabled={isDeletingCase}
                className="w-full mt-1 flex items-center justify-center gap-2 py-2 text-red-500 hover:bg-red-50 rounded-xl text-[10px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingCase ? 'Deleting...' : 'Delete Case'}
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Confirmation Modal for non-selected view */}
      <AppModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={modalData?.onConfirm || (async () => {})}
        title={modalData?.title || ''}
        description={modalData?.description || ''}
        type={modalData?.type || 'default'}
        confirmText={modalData?.confirmText || 'Confirm'}
        loading={isClosingCase || isDeletingCase || isModalLoading}
      />
    </div>
  );
};

export default OrthoCasesTab;
