import React from 'react';
import {
  Maximize2,
  Eye,
  EyeOff,
  Tag,
  Printer,
  Download,
  Link2,
} from 'lucide-react';
import { PhotoRecord } from '../../types';
import PhotoBox from './PhotoBox';

/* ═══════════════════════════════════════════════════════════════
   RecordsPhotoGrid — Main photo grid with toolbar.
   v2.0 — Added Print / Export PDF / Share buttons to toolbar.
   ═══════════════════════════════════════════════════════════════ */

export interface RecordsPhotoGridProps {
  records: PhotoRecord[];
  patientName: string;
  chiefComplaint: string;
  date: string;
  showLabels: boolean;
  blurPatientName: boolean;
  getAspectRatioClass: (ratio: string) => string;
  onToggleLabels: () => void;
  onToggleBlurName: () => void;
  onOpenFullscreen: () => void;
  onSelectPhoto: (record: PhotoRecord) => void;
  onTriggerUpload: () => void;
  onFullscreen: (record: PhotoRecord) => void;
  onEdit: (record: PhotoRecord) => void;
  onPrint: () => void;
  onExportPdf: () => void;
  onShare: () => void;
}

const RecordsPhotoGrid: React.FC<RecordsPhotoGridProps> = ({
  records,
  patientName,
  chiefComplaint,
  date,
  showLabels,
  blurPatientName,
  getAspectRatioClass,
  onToggleLabels,
  onToggleBlurName,
  onOpenFullscreen,
  onSelectPhoto,
  onTriggerUpload,
  onFullscreen,
  onEdit,
  onPrint,
  onExportPdf,
  onShare,
}) => {
  const hasPhotos = records.some(r => r.url);

  return (
    <>
      {/* Photo Grid Layout - Seamless, X-rays on Right */}
      <div className="relative group/grid">
        {/* Grid Toolbar — two rows: export actions + view controls */}
        <div className="absolute top-4 right-4 z-10 opacity-0 group-hover/grid:opacity-100 transition-opacity flex flex-col items-end gap-2">
          {/* Row 1: Export Actions (only if photos exist) */}
          {hasPhotos && (
            <div className="flex items-center gap-2">
              <button 
                onClick={onPrint}
                className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl text-slate-700 font-bold text-xs hover:bg-white transition-all hover:scale-105"
                title="Print Records"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button 
                onClick={onExportPdf}
                className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl text-slate-700 font-bold text-xs hover:bg-white transition-all hover:scale-105"
                title="Export PDF"
              >
                <Download className="w-4 h-4" />
                PDF
              </button>
              <button 
                onClick={onShare}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-violet-500 to-purple-600 backdrop-blur-md rounded-xl border border-violet-400 shadow-xl text-white font-bold text-xs hover:from-violet-600 hover:to-purple-700 transition-all hover:scale-105"
                title="Share Records"
              >
                <Link2 className="w-4 h-4" />
                Share
              </button>
            </div>
          )}

          {/* Row 2: View Controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={onToggleLabels}
              className={`flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-xl border shadow-xl font-bold text-xs transition-all hover:scale-105 ${showLabels ? 'bg-white/90 border-slate-200 text-slate-700 hover:bg-white' : 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-600'}`}
              title={showLabels ? 'Hide Labels' : 'Show Labels'}
            >
              <Tag className="w-4 h-4" />
              {showLabels ? 'Hide Labels' : 'Show Labels'}
            </button>
            <button 
              onClick={onToggleBlurName}
              className={`flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-xl border shadow-xl font-bold text-xs transition-all hover:scale-105 ${!blurPatientName ? 'bg-white/90 border-slate-200 text-slate-700 hover:bg-white' : 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-600'}`}
              title={blurPatientName ? 'Show Patient Name' : 'Blur Patient Name'}
            >
              {blurPatientName ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {blurPatientName ? 'Show Name' : 'Blur Name'}
            </button>
            <button 
              onClick={onOpenFullscreen}
              className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200 shadow-xl text-slate-700 font-bold text-xs hover:bg-white transition-all hover:scale-105"
            >
              <Maximize2 className="w-4 h-4" />
              Full Screen
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row gap-0">
          {/* Left Column (Main Photos) */}
          <div className="flex-1 flex flex-col gap-0 border-b lg:border-b-0 lg:border-r border-slate-200">
            {/* Row 1: Extraoral (7:5 Portrait) */}
            <div className="grid grid-cols-4 gap-0">
              {records.filter(r => r.id === 'profile-rest' || r.id === 'front-rest' || r.id === 'front-smile' || r.id === 'oblique').map(record => (
                <PhotoBox key={record.id} record={record} className="border-r border-b border-slate-200 last:border-r-0" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
              ))}
            </div>

            {/* Row 2: Occlusal & Patient Info */}
            <div className="grid grid-cols-3 gap-0 border-b border-slate-200">
              <PhotoBox record={records.find(r => r.id === 'occlusal-upper')!} className="border-r border-slate-200" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
              
              <div className="flex flex-col items-center justify-center text-center p-8 bg-white h-full border-r border-slate-200">
                <h2 
                  className={`text-3xl font-serif text-slate-900 leading-tight tracking-tight transition-all duration-300 ${blurPatientName ? 'select-none' : ''}`}
                  style={blurPatientName ? { filter: 'blur(8px)', WebkitFilter: 'blur(8px)' } : {}}
                >
                  {patientName || 'Patient Records'}
                </h2>
                <p className="text-lg font-serif text-slate-600 mt-2">{date}</p>
                <div className="mt-6 pt-6 border-t border-slate-100 text-[11px] font-serif text-slate-500 space-y-2 max-w-[240px] italic">
                  <p>{chiefComplaint || "No clinical details provided"}</p>
                </div>
              </div>

              <PhotoBox record={records.find(r => r.id === 'occlusal-lower')!} getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
            </div>

            {/* Row 3: Intraoral (16:9 Widescreen) */}
            <div className="grid grid-cols-3 gap-0">
              {records.filter(r => r.id === 'lateral-right' || r.id === 'frontal-retracted' || r.id === 'lateral-left').map(record => (
                <PhotoBox key={record.id} record={record} className="border-r border-slate-200 last:border-r-0" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
              ))}
            </div>
          </div>

          {/* Right Column (X-rays) */}
          <div className="w-full lg:w-[30%] flex flex-col gap-0">
            <PhotoBox record={records.find(r => r.id === 'ceph')!} className="border-b border-slate-200 flex-1" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
            <div className="flex flex-col">
              <PhotoBox record={records.find(r => r.id === 'opg')!} className="border-b border-slate-200" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
              {/* Footer Branding Overlay */}
              <div className="p-10 bg-white flex flex-col items-end justify-end">
                <span className="text-4xl font-serif italic text-slate-900">Shady Elkelany</span>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Orthodontic Specialist</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(RecordsPhotoGrid);
