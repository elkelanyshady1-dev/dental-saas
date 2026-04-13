/**
 * Skeleton.tsx
 * Reusable shimmer skeleton components for loading states
 */

import React from 'react';

/* ─── Base Shimmer ────────────────────────────────────────────────── */
const shimmerClass =
  'animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] rounded-xl';

export const SkeletonBox: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`${shimmerClass} ${className}`} />
);

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = '',
}) => (
  <div className={`space-y-2.5 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={`${shimmerClass} h-3`}
        style={{ width: i === lines - 1 ? '60%' : '100%' }}
      />
    ))}
  </div>
);

export const SkeletonCircle: React.FC<{ size?: number }> = ({ size = 10 }) => (
  <div
    className={`${shimmerClass} rounded-full shrink-0`}
    style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
  />
);

/* ─── Page Skeletons ──────────────────────────────────────────────── */

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <div>
      <SkeletonBox className="h-7 w-48 mb-2" />
      <SkeletonBox className="h-3 w-32" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <SkeletonBox className="w-10 h-10 rounded-xl" />
            <SkeletonBox className="h-3 w-20" />
          </div>
          <SkeletonBox className="h-6 w-32 mb-2" />
          <SkeletonBox className="h-3 w-24" />
        </div>
      ))}
    </div>
    <div className="bg-white rounded-2xl border border-slate-200">
      <div className="p-6 border-b border-slate-100">
        <SkeletonBox className="h-4 w-28" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-slate-100">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-6 flex flex-col items-center gap-3">
            <SkeletonBox className="w-10 h-10 rounded-xl" />
            <SkeletonBox className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const AppointmentsSkeleton: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <div>
      <SkeletonBox className="h-7 w-44 mb-2" />
      <SkeletonBox className="h-3 w-36" />
    </div>
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <SkeletonBox className="h-4 w-24" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-6 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-4">
            <SkeletonBox className="w-12 h-12 rounded-2xl" />
            <div>
              <SkeletonBox className="h-3 w-28 mb-2" />
              <SkeletonBox className="h-2.5 w-36" />
            </div>
          </div>
          <SkeletonBox className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

export const FinancialSkeleton: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <div>
      <SkeletonBox className="h-7 w-32 mb-2" />
      <SkeletonBox className="h-3 w-40" />
    </div>
    <div className="grid grid-cols-2 gap-4">
      {[1, 2].map((i) => (
        <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <SkeletonBox className="w-8 h-8 rounded-lg" />
            <SkeletonBox className="h-2.5 w-20" />
          </div>
          <SkeletonBox className="h-6 w-24" />
        </div>
      ))}
    </div>
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100">
        <SkeletonBox className="h-4 w-20" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
          <SkeletonBox className="h-3 w-20" />
          <SkeletonBox className="h-3 w-16" />
          <SkeletonBox className="h-3 w-20 hidden sm:block" />
          <SkeletonBox className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  </div>
);

export const MedicalSkeleton: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <div>
      <SkeletonBox className="h-7 w-40 mb-2" />
      <SkeletonBox className="h-3 w-48" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <SkeletonBox className="w-9 h-9 rounded-xl" />
            <SkeletonBox className="h-3 w-20" />
          </div>
          <div className="p-5 space-y-2">
            <SkeletonBox className="h-8 w-full rounded-xl" />
            <SkeletonBox className="h-8 w-3/4 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const OrthoSkeleton: React.FC = () => (
  <div className="space-y-8 animate-fade-in">
    <div>
      <SkeletonBox className="h-7 w-40 mb-2" />
      <SkeletonBox className="h-3 w-44" />
    </div>
    <SkeletonBox className="h-28 w-full rounded-2xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-5 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <SkeletonBox className="w-9 h-9 rounded-xl" />
            <div>
              <SkeletonBox className="h-3 w-20 mb-1.5" />
              <SkeletonBox className="h-2.5 w-28" />
            </div>
          </div>
          <SkeletonBox className="h-9 w-full rounded-xl mt-3" />
        </div>
      ))}
    </div>
  </div>
);

export const MessagesSkeleton: React.FC = () => (
  <div className="space-y-4 animate-fade-in">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] ${i % 2 === 0 ? 'items-end' : 'items-start'}`}>
          <SkeletonBox className={`h-16 ${i % 2 === 0 ? 'w-48' : 'w-56'} rounded-2xl`} />
          <SkeletonBox className="h-2 w-14 mt-1.5" />
        </div>
      </div>
    ))}
  </div>
);
