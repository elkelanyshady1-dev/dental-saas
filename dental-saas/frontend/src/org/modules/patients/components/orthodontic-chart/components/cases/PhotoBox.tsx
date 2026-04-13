import React from 'react';
import {
  Activity,
  Image as ImageIcon,
  Maximize2,
  Crop,
  Loader2,
} from 'lucide-react';
import { PhotoRecord } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   PhotoBox — Individual photo cell in the records grid.
   Extracted from OrthoRecordsTab (lines 592–666) without logic changes.

   URL PRIORITY (render only):
     1. record.url        — server-committed URL (persistent, stored in DB)
     2. record.previewUrl — transient blob URL (preview during upload)

   SAVE RULE:
     previewUrl is NEVER saved to DB. CaseWorkflowContainer.buildWorkflowPayload()
     strips previewUrl and blob: urls from all records before persisting.
   ═══════════════════════════════════════════════════════════════ */

export interface PhotoBoxProps {
  record: PhotoRecord | undefined;
  className?: string;
  showLabels?: boolean;
  getAspectRatioClass: (ratio: string) => string;
  onSelectPhoto: (record: PhotoRecord) => void;
  onTriggerUpload: () => void;
  onFullscreen: (record: PhotoRecord) => void;
  onEdit: (record: PhotoRecord) => void;
}

const PhotoBox: React.FC<PhotoBoxProps> = ({
  record,
  className = "",
  showLabels = true,
  getAspectRatioClass,
  onSelectPhoto,
  onTriggerUpload,
  onFullscreen,
  onEdit,
}) => {
  if (!record) return <div className={`bg-slate-100 rounded-2xl ${className}`} />;

  // Determine what to render:
  //   serverSrc  = persistent URL (from server) — used for full-screen, toolbar, save
  //   displaySrc = what the <img> actually shows — server URL OR blob preview
  const serverSrc = resolveFileUrl(record.url);
  const isUploading = !record.url && !!record.previewUrl;
  const displaySrc = serverSrc ?? record.previewUrl ?? undefined;

  return (
    <div className={`group relative bg-slate-50/50 overflow-hidden flex items-center justify-center cursor-pointer transition-all ${getAspectRatioClass(record.aspectRatio)} ${className}`}
      onClick={(e) => {
        // Allow click to trigger upload only when no image present at all
        if (!record.url && !record.previewUrl) {
          onSelectPhoto(record);
          onTriggerUpload();
        }
      }}
    >
    {displaySrc ? (
      <>
        <img 
          src={displaySrc}
          alt={record.label}
          className="w-full h-full object-contain bg-slate-50 transition-transform duration-700 group-hover:scale-105"
          style={{ 
            transform: `rotate(${record.rotation || 0}deg) scaleX(${record.flipH ? -1 : 1}) scaleY(${record.flipV ? -1 : 1})`,
            referrerPolicy: 'no-referrer'
          } as any}
        />
        {/* Uploading badge — shown while blob preview is visible, upload in-flight */}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/30 backdrop-blur-[1px]">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-lg border border-white/10">
              <Loader2 className="w-3 h-3 text-white animate-spin" />
              <span className="text-[9px] font-bold text-white uppercase tracking-widest">Uploading…</span>
            </div>
          </div>
        )}
        {/* Permanent Label Overlay — conditionally visible */}
        {showLabels && !isUploading && (
          <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none transition-opacity duration-300">
            <div className="px-2.5 py-1 bg-slate-900/60 backdrop-blur-md rounded-lg border border-white/10 shadow-lg">
              <span className="text-[10px] font-bold text-white uppercase tracking-[0.1em]">{record.label}</span>
            </div>
            {record.analysis && Object.keys(record.analysis).length > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/80 backdrop-blur-md rounded-lg border border-blue-400/30 shadow-lg">
                <Activity className="w-3 h-3 text-white" />
                <span className="text-[8px] font-bold text-white uppercase tracking-wider">Analyzed</span>
              </div>
            )}
          </div>
        )}
      </>
    ) : (
      <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-blue-500 transition-all p-6">
        <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
          <ImageIcon className="w-5 h-5" />
        </div>
        <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] text-center leading-tight">{record.label}</span>
      </div>
    )}
    
    {/* Overlay controls — only shown when a server URL is committed (not during upload) */}
    {serverSrc && (
      <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onFullscreen(record);
          }}
          className="p-3 bg-white/95 backdrop-blur-sm rounded-2xl text-slate-800 shadow-xl hover:bg-white hover:scale-110 transition-all"
          title="Full Screen"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onEdit(record);
          }}
          className="p-3 bg-white/95 backdrop-blur-sm rounded-2xl text-slate-800 shadow-xl hover:bg-white hover:scale-110 transition-all"
          title="Edit Photo"
        >
          <Crop className="w-5 h-5" />
        </button>
      </div>
    )}
  </div>
  );
};

export default PhotoBox;
