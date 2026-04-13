import React, { useState, useMemo, useEffect } from 'react';
import { X, Link2, Copy, Check, Clock, MessageSquare, Shield, Layers, Image as ImageIcon, Download, Eye, Camera, FolderOpen, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecordSet } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';
import { createShareLink, type CreateShareOptions } from '../../api/sharedCase.api';
import { caseApi as orthodonticsApi } from '../../api/case.api';

/* ═══════════════════════════════════════════════════════════════
   ShareCaseModal (v4.0) — Record Set Level Sharing
   
   v4.0: Fetches fresh record sets from backend on open.
          Eliminates stale state bugs entirely.
   
   Features:
   - Share full case OR selected RECORD SETS
   - Each record set shown as a card with photo count + thumbnail
   - Granular permissions (comment, download, analysis)
   - Expiration picker (1d/3d/7d/14d/30d)
   - Patient anonymization toggle
   - Link copy + generation
   ═══════════════════════════════════════════════════════════════ */

interface ShareCaseModalProps {
  isOpen: boolean;
  caseId: string;
  recordSets: RecordSet[]; // Fallback — fresh data is fetched from backend
  token: string; // Auth token
  onClose: () => void;
}

const EXPIRATION_OPTIONS = [
  { value: '1d', label: '1 Day' },
  { value: '3d', label: '3 Days' },
  { value: '7d', label: '7 Days' },
  { value: '14d', label: '14 Days' },
  { value: '30d', label: '30 Days' },
];

const ShareCaseModal: React.FC<ShareCaseModalProps> = ({
  isOpen,
  caseId,
  recordSets: propRecordSets,
  token,
  onClose,
}) => {
  // Share type: full case or selected record sets
  const [shareType, setShareType] = useState<'case' | 'recordsets'>('case');
  const [selectedRecordSetIds, setSelectedRecordSetIds] = useState<string[]>([]);

  // Permissions
  const [canComment, setCanComment] = useState(true);
  const [canDownload, setCanDownload] = useState(false);
  const [canViewAnalysis, setCanViewAnalysis] = useState(true);

  // Expiration
  const [expiresIn, setExpiresIn] = useState('3d');

  // Privacy
  const [hidePatientName, setHidePatientName] = useState(false);

  // Generation state
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── FRESH DATA: Fetch from backend when modal opens ──────────────────────
  const [freshRecordSets, setFreshRecordSets] = useState<RecordSet[]>([]);
  const [isFetchingFresh, setIsFetchingFresh] = useState(false);

  useEffect(() => {
    if (!isOpen || !caseId) return;

    let cancelled = false;
    const fetchFresh = async () => {
      setIsFetchingFresh(true);
      try {
        const response = await orthodonticsApi.getWorkflow(caseId);
        if (cancelled) return;
        const wd = response.data?.data?.workflowData;
        if (wd?.recordSets && Array.isArray(wd.recordSets)) {
          // Normalize: prefer records over photos (same as CaseWorkflowContainer)
          const normalized = wd.recordSets.map((rs: any) => ({
            ...rs,
            records: (rs.records?.length > 0 ? rs.records : rs.photos) || [],
          }));
          setFreshRecordSets(normalized);
          console.log('[ShareCaseModal] ✅ Fetched fresh from backend:', normalized.map((rs: any) => ({
            id: rs.id?.slice(-6), name: rs.name,
            photos: rs.records?.filter((r: any) => r.url)?.length ?? 0,
            total: rs.records?.length ?? 0,
          })));
        }
      } catch (err) {
        console.warn('[ShareCaseModal] Failed to fetch fresh data, using prop fallback:', err);
      } finally {
        if (!cancelled) setIsFetchingFresh(false);
      }
    };

    fetchFresh();
    return () => { cancelled = true; };
  }, [isOpen, caseId]);

  // Use fresh data if available, otherwise fall back to props
  const recordSets = freshRecordSets.length > 0 ? freshRecordSets : propRecordSets;

  // PHASE 4: Strict record validation — url must be non-null AND non-empty string
  const availableRecordSets = useMemo(() => {
    const input = recordSets || [];
    const result = input.filter(rs =>
      rs.records?.some(r => r.url && typeof r.url === 'string' && r.url.trim() !== '')
    );

    // Concise diagnostic logging (kept for production traceability)
    console.log('[ShareCaseModal] Filter:', {
      source: freshRecordSets.length > 0 ? 'FRESH (backend)' : 'PROPS (parent state)',
      input: input.length,
      available: result.length,
      sets: input.map(rs => ({
        id: rs.id?.slice(-6), name: rs.name,
        photos: rs.records?.filter(r => r.url)?.length ?? 0,
        total: rs.records?.length ?? 0,
      })),
    });

    // Warn on sets that have records but NO valid URLs — likely DEFAULT_RECORDS
    input.forEach(rs => {
      if (rs.records?.length > 0 && !rs.records.some((r: any) => r.url)) {
        console.warn(`[ShareCaseModal] ⚠️ Set "${rs.name}" has ${rs.records.length} records but ZERO valid URLs — likely DEFAULT_RECORDS not yet populated`);
      }
    });

    return result;
  }, [recordSets, freshRecordSets]);

  const toggleRecordSet = (id: string) => {
    setSelectedRecordSetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedRecordSetIds(availableRecordSets.map(rs => rs.id));
  const deselectAll = () => setSelectedRecordSetIds([]);

  const handleGenerate = async () => {
    if (shareType === 'recordsets' && selectedRecordSetIds.length === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      // Collect all recordIds from selected record sets for backward compatibility
      const selectedSets = recordSets.filter(rs => selectedRecordSetIds.includes(rs.id));
      const allRecordIds = selectedSets.flatMap(rs => (rs.records || []).filter(r => r.url).map(r => r.id));

      const options: CreateShareOptions = {
        type: shareType === 'case' ? 'case' : 'records',
        recordIds: shareType === 'recordsets' ? allRecordIds : [],
        recordSetIds: shareType === 'recordsets' ? selectedRecordSetIds : [],
        expiresIn,
        permissions: { canComment, canDownload, canViewAnalysis },
        hidePatientName,
      };

      const result = await createShareLink(caseId, options, token);
      setGeneratedLink(result.data.url);
    } catch (err: any) {
      console.error('Failed to generate share link:', err);
      setError(err?.response?.data?.message || 'Failed to generate link');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setGeneratedLink(null);
    setCopied(false);
    setShareType('case');
    setSelectedRecordSetIds([]);
    setError(null);
    setFreshRecordSets([]); // Reset so next open re-fetches
    onClose();
  };

  // Get thumbnail for a record set (first photo with URL)
  const getSetThumbnail = (rs: RecordSet): string | null => {
    const firstPhoto = rs.records?.find(r => r.url);
    return firstPhoto ? resolveFileUrl(firstPhoto.url) : null;
  };

  // Count photos with URLs in a record set
  const getPhotoCount = (rs: RecordSet): number =>
    (rs.records || []).filter(r => r.url).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* ─── Header ─────────────────────────────────────── */}
            <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Share & Collaborate</h3>
                  <p className="text-xs text-slate-500">Multi-doctor collaboration link</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* ─── Body ───────────────────────────────────────── */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {!generatedLink ? (
                <>
                  {/* ── 1. Share Type ────────────────────────── */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Share Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShareType('case')}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left ${
                          shareType === 'case'
                            ? 'bg-violet-50 border-violet-300 ring-2 ring-violet-100'
                            : 'bg-slate-50 border-slate-200 hover:border-violet-200'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${shareType === 'case' ? 'bg-violet-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          <FolderOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Full Case</p>
                          <p className="text-[10px] text-slate-400">All record sets & workflow</p>
                        </div>
                      </button>
                      <button
                        onClick={() => setShareType('recordsets')}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left ${
                          shareType === 'recordsets'
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-200'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${shareType === 'recordsets' ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Record Sets</p>
                          <p className="text-[10px] text-slate-400">Pick Pre / Mid / Post</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* ── 2. Record Set Picker ──────────────────── */}
                  <AnimatePresence>
                    {shareType === 'recordsets' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Record Sets</label>
                            <div className="flex gap-2">
                              <button onClick={selectAll} className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Select All</button>
                              <span className="text-slate-300">|</span>
                              <button onClick={deselectAll} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Clear</button>
                            </div>
                          </div>

                          {isFetchingFresh ? (
                            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <Loader2 className="w-6 h-6 text-blue-400 mx-auto mb-2 animate-spin" />
                              <p className="text-xs text-slate-400">Loading record sets…</p>
                            </div>
                          ) : availableRecordSets.length === 0 ? (
                            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <Camera className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                              <p className="text-xs text-slate-400">No record sets with photos yet</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                              {availableRecordSets.map(rs => {
                                const isSelected = selectedRecordSetIds.includes(rs.id);
                                const thumbnail = getSetThumbnail(rs);
                                const photoCount = getPhotoCount(rs);
                                const stlCount = (rs.stlFiles || []).length;

                                return (
                                  <button
                                    key={rs.id}
                                    onClick={() => toggleRecordSet(rs.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left group ${
                                      isSelected
                                        ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100'
                                        : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    {/* Thumbnail */}
                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 relative">
                                      {thumbnail ? (
                                        <img src={thumbnail} alt={rs.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <Camera className="w-5 h-5 text-slate-300" />
                                        </div>
                                      )}
                                      {isSelected && (
                                        <div className="absolute inset-0 bg-blue-500/30 flex items-center justify-center">
                                          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                            <Check className="w-3.5 h-3.5 text-white" />
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-sm font-bold text-slate-800 truncate">{rs.name}</p>
                                        {rs.type && (
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                            rs.type === 'PRE' ? 'bg-emerald-100 text-emerald-700' :
                                            rs.type === 'MID' ? 'bg-amber-100 text-amber-700' :
                                            rs.type === 'POST' ? 'bg-blue-100 text-blue-700' :
                                            'bg-slate-100 text-slate-600'
                                          }`}>
                                            {rs.type}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-slate-400">{rs.date || 'No date'}</p>
                                      <div className="flex items-center gap-3 mt-1">
                                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                          <ImageIcon className="w-3 h-3" />
                                          {photoCount} photo{photoCount !== 1 ? 's' : ''}
                                        </span>
                                        {stlCount > 0 && (
                                          <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                            📐 {stlCount} STL
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Checkbox */}
                                    <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 group-hover:border-blue-300'
                                    }`}>
                                      {isSelected && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <p className="text-[10px] text-slate-400 text-center">
                            {selectedRecordSetIds.length} of {availableRecordSets.length} record set{availableRecordSets.length !== 1 ? 's' : ''} selected
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── 3. Expiration ────────────────────────── */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Clock className="w-3 h-3" />
                      Expiration
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {EXPIRATION_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setExpiresIn(opt.value)}
                          className={`px-3.5 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                            expiresIn === opt.value
                              ? 'bg-violet-600 border-violet-600 text-white shadow-lg shadow-violet-200'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── 4. Permissions ───────────────────────── */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Permissions</label>
                    <div className="space-y-2">
                      <ToggleRow
                        icon={<MessageSquare className="w-4 h-4 text-blue-500" />}
                        title="Allow Comments"
                        subtitle="Collaborators can leave text & voice notes"
                        active={canComment}
                        color="blue"
                        onToggle={() => setCanComment(!canComment)}
                      />
                      <ToggleRow
                        icon={<Download className="w-4 h-4 text-emerald-500" />}
                        title="Allow Download"
                        subtitle="Viewers can download photos & PDF"
                        active={canDownload}
                        color="emerald"
                        onToggle={() => setCanDownload(!canDownload)}
                      />
                      <ToggleRow
                        icon={<Eye className="w-4 h-4 text-purple-500" />}
                        title="Show Analysis"
                        subtitle="Include measurements & analysis data"
                        active={canViewAnalysis}
                        color="purple"
                        onToggle={() => setCanViewAnalysis(!canViewAnalysis)}
                      />
                      <ToggleRow
                        icon={<Shield className="w-4 h-4 text-amber-500" />}
                        title="Hide Patient Name"
                        subtitle="Anonymize patient information"
                        active={hidePatientName}
                        color="amber"
                        onToggle={() => setHidePatientName(!hidePatientName)}
                      />
                    </div>
                  </div>

                  {/* ── Error ──────────────────────────────────── */}
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-xs text-red-600 font-medium">{error}</p>
                    </div>
                  )}

                  {/* ── Generate Button ──────────────────────── */}
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || (shareType === 'recordsets' && selectedRecordSetIds.length === 0)}
                    className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg shadow-violet-200 disabled:opacity-40 active:scale-[0.98]"
                  >
                    {isGenerating ? 'Generating...' : 'Generate Collaboration Link'}
                  </button>
                </>
              ) : (
                /* ── Generated Link View ─────────────────────── */
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <div className="flex items-center gap-2 mb-3">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Link Generated</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={generatedLink}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-mono text-slate-700 outline-none"
                      />
                      <button
                        onClick={handleCopy}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          copied ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-20 shrink-0">Type:</span>
                      <span className="text-[10px] font-bold text-slate-700">
                        {shareType === 'case' ? '📋 Full Case' : `📦 ${selectedRecordSetIds.length} Record Set${selectedRecordSetIds.length !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                    {shareType === 'recordsets' && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 w-20 shrink-0">Sets:</span>
                        <span className="text-[10px] font-bold text-slate-700">
                          {recordSets.filter(rs => selectedRecordSetIds.includes(rs.id)).map(rs => rs.name).join(', ')}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-20 shrink-0">Expires:</span>
                      <span className="text-[10px] font-bold text-slate-700">{EXPIRATION_OPTIONS.find(o => o.value === expiresIn)?.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-20 shrink-0">Comments:</span>
                      <span className="text-[10px] font-bold text-slate-700">{canComment ? '✅ Enabled' : '❌ Disabled'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-20 shrink-0">Download:</span>
                      <span className="text-[10px] font-bold text-slate-700">{canDownload ? '✅ Enabled' : '❌ Disabled'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-20 shrink-0">Analysis:</span>
                      <span className="text-[10px] font-bold text-slate-700">{canViewAnalysis ? '✅ Visible' : '🔒 Hidden'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-20 shrink-0">Patient:</span>
                      <span className="text-[10px] font-bold text-slate-700">{hidePatientName ? '🔒 Anonymous' : '👁 Visible'}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full py-3 bg-slate-100 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─── Toggle Row Sub-Component ─────────────────────────────────────────────────

function ToggleRow({ icon, title, subtitle, active, color, onToggle }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  color: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div className="flex items-center gap-2.5">
        {icon}
        <div>
          <p className="text-xs font-bold text-slate-700">{title}</p>
          <p className="text-[9px] text-slate-400">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`w-11 h-6 rounded-full transition-all relative ${active ? (color === 'blue' ? 'bg-blue-500' : color === 'emerald' ? 'bg-emerald-500' : color === 'purple' ? 'bg-purple-500' : 'bg-amber-500') : 'bg-slate-300'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${active ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

export default ShareCaseModal;
