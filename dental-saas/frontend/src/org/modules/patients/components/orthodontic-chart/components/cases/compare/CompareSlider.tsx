/**
 * CompareSlider.tsx
 * =================
 * Clinical-grade before/after image comparison with a draggable divider.
 * 
 * Features:
 *   - Draggable vertical curtain (mouse + touch)
 *   - Keyboard control (← →, snap points)
 *   - Animated labels (PRE / POST)
 *   - Zoom support via CSS transform
 *   - Responsive — fills parent container
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';

interface CompareSliderProps {
  leftUrl: string;
  rightUrl: string;
  leftLabel?: string;
  rightLabel?: string;
  aspectRatio?: string;
  className?: string;
}

const CompareSlider: React.FC<CompareSliderProps> = ({
  leftUrl,
  rightUrl,
  leftLabel = 'PRE',
  rightLabel = 'POST',
  aspectRatio = '4:3',
  className = '',
}) => {
  const [position, setPosition] = useState(50); // 0–100%
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [leftLoaded, setLeftLoaded] = useState(false);
  const [rightLoaded, setRightLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert aspect ratio string to CSS
  const getAspectPadding = () => {
    const parts = aspectRatio.split(':').map(Number);
    if (parts.length === 2 && parts[0] > 0) {
      return `${(parts[1] / parts[0]) * 100}%`;
    }
    return '75%'; // Default 4:3
  };

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(2, Math.min(98, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    updatePosition(e.touches[0].clientX);
  }, [updatePosition]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      updatePosition(clientX);
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, updatePosition]);

  // Keyboard control
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft': setPosition(p => Math.max(2, p - 2)); break;
      case 'ArrowRight': setPosition(p => Math.min(98, p + 2)); break;
      case 'Home': setPosition(2); break;
      case 'End': setPosition(98); break;
      case ' ': setPosition(50); break; // Reset to center
    }
  }, []);

  const bothLoaded = leftLoaded && rightLoaded;

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-xl bg-slate-900 ${className}`}
      style={{ paddingBottom: getAspectPadding() }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="slider"
      aria-label="Compare slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
    >
      {/* Loading skeleton */}
      {!bothLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80 z-30">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* RIGHT image (full, underneath) — POST */}
      <img
        src={rightUrl}
        alt={rightLabel}
        onLoad={() => setRightLoaded(true)}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* LEFT image (clipped) — PRE */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={leftUrl}
          alt={leftLabel}
          onLoad={() => setLeftLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%' }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 z-20"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        {/* Line */}
        <div className="absolute inset-y-0 w-0.5 bg-white/80 shadow-[0_0_8px_rgba(0,0,0,0.5)]" />
        
        {/* Handle */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center cursor-ew-resize"
          animate={{ scale: isDragging ? 1.2 : isHovering ? 1.05 : 1 }}
          transition={{ duration: 0.15 }}
        >
          <GripVertical className="w-4 h-4 text-slate-600" />
        </motion.div>

        {/* Arrow hints */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -left-8"
          animate={{ opacity: isHovering || isDragging ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronLeft className="w-5 h-5 text-white/70" />
        </motion.div>
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -right-8"
          animate={{ opacity: isHovering || isDragging ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-5 h-5 text-white/70" />
        </motion.div>
      </div>

      {/* Labels */}
      <motion.div
        className="absolute top-3 left-3 z-10"
        animate={{ opacity: isHovering || isDragging ? 1 : 0.6 }}
      >
        <span className="px-2.5 py-1 bg-blue-600/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow">
          {leftLabel}
        </span>
      </motion.div>
      <motion.div
        className="absolute top-3 right-3 z-10"
        animate={{ opacity: isHovering || isDragging ? 1 : 0.6 }}
      >
        <span className="px-2.5 py-1 bg-emerald-600/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow">
          {rightLabel}
        </span>
      </motion.div>
    </div>
  );
};

export default CompareSlider;
