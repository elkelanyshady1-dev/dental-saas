/**
 * CompareEngine.tsx
 * =================
 * Main container for the Pre vs Post comparison system.
 * 
 * Workflow:
 *   1. User selects two record sets (left = "before", right = "after")
 *   2. Engine matches records by ID across both sets
 *   3. Displays matched pairs in a grid with slider/overlay/diff views
 * 
 * Data safety rules (Phase 10):
 *   - Only reads from recordSets.records (never `photos`)
 *   - Validates URL existence before rendering
 *   - Isolated by caseId
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, GitCompare, ChevronRight, AlertTriangle,
  Camera, ArrowRight, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { RecordSet } from '../../../types';
import { matchRecords, MatchedPair } from './types';
import CompareGrid from './CompareGrid';

interface CompareEngineProps {
  isOpen: boolean;
  onClose: () => void;
  recordSets: RecordSet[];
  caseId: string;
}

/** Badge color for record set type */
const TYPE_COLORS: Record<string, string> = {
  PRE: 'bg-blue-100 text-blue-700 border-blue-200',
  MID: 'bg-amber-100 text-amber-700 border-amber-200',
  POST: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CUSTOM: 'bg-slate-100 text-slate-600 border-slate-200',
};

const CompareEngine: React.FC<CompareEngineProps> = ({
  isOpen,
  onClose,
  recordSets,
  caseId,
}) => {
  // ── Selection State ──────────────────────────────────────────
  const [leftSetId, setLeftSetId] = useState<string | null>(null);
  const [rightSetId, setRightSetId] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'compare'>('select');

  // Only show sets that have at least one record with a valid URL
  const availableSets = useMemo(() => {
    return recordSets.filter(
      rs => rs.records?.some(r => r.url && typeof r.url === 'string' && r.url.trim() !== '')
    );
  }, [recordSets]);

  const leftSet = availableSets.find(s => s.id === leftSetId) || null;
  const rightSet = availableSets.find(s => s.id === rightSetId) || null;

  // ── Match Records ─────────────────────────────────────────────
  const matchedPairs = useMemo<MatchedPair[]>(() => {
    if (!leftSet || !rightSet) return [];
    return matchRecords(leftSet, rightSet);
  }, [leftSet, rightSet]);

  const photosInLeft = leftSet?.records?.filter(r => r.url)?.length || 0;
  const photosInRight = rightSet?.records?.filter(r => r.url)?.length || 0;

  const canCompare = leftSet && rightSet && leftSetId !== rightSetId;

  const handleStartCompare = useCallback(() => {
    if (!canCompare) return;
    if (matchedPairs.length === 0) {
      toast.error('No matching photos found between these two record sets. Photos are matched by their position ID (e.g., "Front smile", "Profile rest").');
      return;
    }
    setStep('compare');
  }, [canCompare, matchedPairs.length]);

  const handleReset = useCallback(() => {
    setStep('select');
    setLeftSetId(null);
    setRightSetId(null);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [onClose, handleReset]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className="w-full max-w-6xl mx-4 my-8 bg-white rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-emerald-50/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
                <GitCompare className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Compare Records</h2>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  {step === 'select' ? 'Select two record sets to compare' : `${matchedPairs.length} matched pairs`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {step === 'compare' && (
                <button
                  onClick={() => setStep('select')}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  ← Change Sets
                </button>
              )}
              <button
                onClick={handleClose}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 'select' ? (
              <SelectionStep
                availableSets={availableSets}
                leftSetId={leftSetId}
                rightSetId={rightSetId}
                onSelectLeft={setLeftSetId}
                onSelectRight={setRightSetId}
                photosInLeft={photosInLeft}
                photosInRight={photosInRight}
                matchedCount={matchedPairs.length}
                canCompare={!!canCompare}
                onCompare={handleStartCompare}
              />
            ) : (
              <CompareGrid
                pairs={matchedPairs}
                leftLabel={leftSet?.name || 'Before'}
                rightLabel={rightSet?.name || 'After'}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ══════════════════════════════════════════════════════════════════════
// SELECTION STEP — Pick left and right record sets
// ══════════════════════════════════════════════════════════════════════

interface SelectionStepProps {
  availableSets: RecordSet[];
  leftSetId: string | null;
  rightSetId: string | null;
  onSelectLeft: (id: string) => void;
  onSelectRight: (id: string) => void;
  photosInLeft: number;
  photosInRight: number;
  matchedCount: number;
  canCompare: boolean;
  onCompare: () => void;
}

const SelectionStep: React.FC<SelectionStepProps> = ({
  availableSets,
  leftSetId,
  rightSetId,
  onSelectLeft,
  onSelectRight,
  photosInLeft,
  photosInRight,
  matchedCount,
  canCompare,
  onCompare,
}) => {
  if (availableSets.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-1">Need at least 2 record sets</h3>
        <p className="text-sm text-slate-500 max-w-md">
          Add a Mid-record or Post-record set to this case before comparing.
          Each set must have at least one uploaded photo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Two-column selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left (Before) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Before (Left)</span>
          </div>
          <div className="space-y-2">
            {availableSets.map(rs => {
              const photoCount = rs.records?.filter(r => r.url)?.length || 0;
              const isSelected = rs.id === leftSetId;
              const isDisabled = rs.id === rightSetId;
              return (
                <button
                  key={rs.id}
                  onClick={() => !isDisabled && onSelectLeft(rs.id)}
                  disabled={isDisabled}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                      : isDisabled
                      ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                      : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border rounded ${
                        TYPE_COLORS[rs.type || 'CUSTOM']
                      }`}>
                        {rs.type || 'Custom'}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{rs.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <Camera className="w-3 h-3" />
                      {photoCount}
                    </div>
                  </div>
                  {rs.date && (
                    <p className="text-[10px] text-slate-400 mt-1">{rs.date}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right (After) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">After (Right)</span>
          </div>
          <div className="space-y-2">
            {availableSets.map(rs => {
              const photoCount = rs.records?.filter(r => r.url)?.length || 0;
              const isSelected = rs.id === rightSetId;
              const isDisabled = rs.id === leftSetId;
              return (
                <button
                  key={rs.id}
                  onClick={() => !isDisabled && onSelectRight(rs.id)}
                  disabled={isDisabled}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                      : isDisabled
                      ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                      : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border rounded ${
                        TYPE_COLORS[rs.type || 'CUSTOM']
                      }`}>
                        {rs.type || 'Custom'}
                      </span>
                      <span className="text-sm font-bold text-slate-800">{rs.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                      <Camera className="w-3 h-3" />
                      {photoCount}
                    </div>
                  </div>
                  {rs.date && (
                    <p className="text-[10px] text-slate-400 mt-1">{rs.date}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preview bar */}
      {canCompare && (
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-emerald-50 rounded-xl border border-blue-100"
        >
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-blue-700">{photosInLeft} photos</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400" />
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-emerald-700">{photosInRight} photos</span>
            </div>
            <span className="text-slate-400">•</span>
            <span className="font-bold text-slate-700">{matchedCount} pairs matched</span>
          </div>
          <button
            onClick={onCompare}
            disabled={matchedCount === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
              matchedCount > 0
                ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-sm hover:shadow-md hover:from-blue-700 hover:to-emerald-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            Compare Now
            <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default CompareEngine;
