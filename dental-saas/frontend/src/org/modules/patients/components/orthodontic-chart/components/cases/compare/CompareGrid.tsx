/**
 * CompareGrid.tsx
 * ===============
 * Multi-view grid displaying all matched image pairs organized by type.
 * Each pair shows a CompareSlider or side-by-side view.
 * 
 * Features:
 *   - Groups by type (Extraoral, Intraoral, Occlusal, X-rays)
 *   - Toggleable view mode (slider vs side-by-side vs diff)
 *   - Lazy loading with intersection observer
 *   - Responsive grid (1-3 columns)
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  SlidersHorizontal, Columns, Eye, Maximize2,
  ChevronDown, ChevronUp
} from 'lucide-react';
import CompareSlider from './CompareSlider';
import DiffOverlay from './DiffOverlay';
import { MatchedPair, CompareViewMode, groupPairsByType, TYPE_LABELS } from './types';

interface CompareGridProps {
  pairs: MatchedPair[];
  leftLabel?: string;
  rightLabel?: string;
}

/** Lazy-loaded image that only renders when in viewport */
const LazyPairCard: React.FC<{
  pair: MatchedPair;
  viewMode: CompareViewMode;
  leftLabel: string;
  rightLabel: string;
  onExpand: (pair: MatchedPair) => void;
}> = ({ pair, viewMode, leftLabel, rightLabel, onExpand }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative group">
      {/* Label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {pair.label}
        </span>
        <button
          onClick={() => onExpand(pair)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded-lg"
          title="Expand"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {isVisible ? (
        <>
          {viewMode === 'slider' && (
            <CompareSlider
              leftUrl={pair.left.url!}
              rightUrl={pair.right.url!}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              aspectRatio={pair.aspectRatio}
              className="rounded-xl shadow-sm border border-slate-200"
            />
          )}

          {viewMode === 'sideBySide' && (
            <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-slate-200">
              <div className="relative">
                <img src={pair.left.url!} alt={leftLabel} className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600/80 text-white text-[9px] font-bold uppercase rounded">
                  {leftLabel}
                </span>
              </div>
              <div className="relative">
                <img src={pair.right.url!} alt={rightLabel} className="w-full h-full object-cover" loading="lazy" />
                <span className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600/80 text-white text-[9px] font-bold uppercase rounded">
                  {rightLabel}
                </span>
              </div>
            </div>
          )}

          {viewMode === 'diff' && (
            <div className="relative rounded-xl overflow-hidden border border-slate-200">
              <img src={pair.right.url!} alt={rightLabel} className="w-full" loading="lazy" />
              <DiffOverlay
                leftUrl={pair.left.url!}
                rightUrl={pair.right.url!}
                className="absolute inset-0"
              />
            </div>
          )}

          {viewMode === 'overlay' && (
            <OverlayView pair={pair} leftLabel={leftLabel} rightLabel={rightLabel} />
          )}
        </>
      ) : (
        <div className="bg-slate-100 rounded-xl animate-pulse" style={{ paddingBottom: '75%' }} />
      )}
    </div>
  );
};

/** Opacity-based overlay — crossfade between left and right */
const OverlayView: React.FC<{
  pair: MatchedPair;
  leftLabel: string;
  rightLabel: string;
}> = ({ pair, leftLabel, rightLabel }) => {
  const [opacity, setOpacity] = useState(0.5);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-slate-200">
        <img src={pair.left.url!} alt={leftLabel} className="w-full" loading="lazy" />
        <img
          src={pair.right.url!}
          alt={rightLabel}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity }}
          loading="lazy"
        />
      </div>
      <div className="flex items-center gap-3 px-1">
        <span className="text-[9px] font-bold text-blue-600 uppercase">{leftLabel}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity * 100}
          onChange={e => setOpacity(Number(e.target.value) / 100)}
          className="flex-1 h-1 accent-blue-600"
        />
        <span className="text-[9px] font-bold text-emerald-600 uppercase">{rightLabel}</span>
      </div>
    </div>
  );
};

const CompareGrid: React.FC<CompareGridProps> = ({
  pairs,
  leftLabel = 'PRE',
  rightLabel = 'POST',
}) => {
  const [viewMode, setViewMode] = useState<CompareViewMode>('slider');
  const [expandedPair, setExpandedPair] = useState<MatchedPair | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const grouped = groupPairsByType(pairs);
  const groupKeys = Object.keys(grouped);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const viewModes: { mode: CompareViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'slider', icon: <SlidersHorizontal className="w-3.5 h-3.5" />, label: 'Slider' },
    { mode: 'sideBySide', icon: <Columns className="w-3.5 h-3.5" />, label: 'Side by Side' },
    { mode: 'overlay', icon: <Eye className="w-3.5 h-3.5" />, label: 'Overlay' },
    { mode: 'diff', icon: <Eye className="w-3.5 h-3.5" />, label: 'AI Diff' },
  ];

  return (
    <div className="space-y-6">
      {/* View Mode Selector */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        {viewModes.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
              viewMode === mode
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
        <span>{pairs.length} matched pairs</span>
        <span>•</span>
        <span>{groupKeys.length} categories</span>
      </div>

      {/* Grouped Pairs */}
      {groupKeys.map(key => {
        const isCollapsed = collapsedGroups.has(key);
        return (
          <div key={key} className="space-y-3">
            <button
              onClick={() => toggleGroup(key)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <h4 className="text-sm font-bold text-slate-800">
                {TYPE_LABELS[key] || key}
              </h4>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {grouped[key].length}
              </span>
              <div className="flex-1" />
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              )}
            </button>

            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {grouped[key].map(pair => (
                      <LazyPairCard
                        key={pair.id}
                        pair={pair}
                        viewMode={viewMode}
                        leftLabel={leftLabel}
                        rightLabel={rightLabel}
                        onExpand={setExpandedPair}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Expanded View Modal */}
      <AnimatePresence>
        {expandedPair && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8"
            onClick={() => setExpandedPair(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="w-full max-w-5xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">{expandedPair.label}</h3>
                <button
                  onClick={() => setExpandedPair(null)}
                  className="text-white/60 hover:text-white text-sm font-bold"
                >
                  Close ✕
                </button>
              </div>
              <CompareSlider
                leftUrl={expandedPair.left.url!}
                rightUrl={expandedPair.right.url!}
                leftLabel={leftLabel}
                rightLabel={rightLabel}
                aspectRatio={expandedPair.aspectRatio}
                className="rounded-2xl shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompareGrid;
