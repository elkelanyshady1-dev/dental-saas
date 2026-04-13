import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PhotoRecord } from '../../types';
import PhotoBox from './PhotoBox';

/* ═══════════════════════════════════════════════════════════════
   GridFullscreenModal — Full-screen replicated photo grid.
   Extracted from OrthoRecordsTab (lines 726–806).
   ═══════════════════════════════════════════════════════════════ */

export interface GridFullscreenModalProps {
  isOpen: boolean;
  records: PhotoRecord[];
  patientName: string;
  chiefComplaint: string;
  date: string;
  showLabels: boolean;
  blurPatientName: boolean;
  getAspectRatioClass: (ratio: string) => string;
  onClose: () => void;
  onSelectPhoto: (record: PhotoRecord) => void;
  onTriggerUpload: () => void;
  onFullscreen: (record: PhotoRecord) => void;
  onEdit: (record: PhotoRecord) => void;
}

const GridFullscreenModal: React.FC<GridFullscreenModalProps> = ({
  isOpen,
  records,
  patientName,
  chiefComplaint,
  date,
  showLabels,
  blurPatientName,
  getAspectRatioClass,
  onClose,
  onSelectPhoto,
  onTriggerUpload,
  onFullscreen,
  onEdit,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[250] flex items-start justify-center bg-slate-950 overflow-y-auto scroll-smooth p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-[95vw] bg-white rounded-2xl shadow-2xl"
          >
            <div className="sticky top-0 right-0 p-4 flex justify-end z-20 pointer-events-none">
              <button 
                onClick={onClose}
                className="p-3 bg-slate-900/80 backdrop-blur-md rounded-xl text-white hover:bg-slate-900 transition-all border border-white/10 pointer-events-auto shadow-xl"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 md:p-8 pb-10">
              {/* Re-render the grid inside the modal */}
              <div className="bg-white border border-slate-200 shadow-sm relative overflow-hidden flex flex-col lg:flex-row gap-0">
                {/* Left Column (Main Photos) */}
                <div className="flex-1 flex flex-col gap-0 border-b lg:border-b-0 lg:border-r border-slate-200">
                  {/* Row 1: Extraoral */}
                  <div className="grid grid-cols-4 gap-0">
                    {records.filter(r => r.id === 'profile-rest' || r.id === 'front-rest' || r.id === 'front-smile' || r.id === 'oblique').map(record => (
                      <PhotoBox key={record.id} record={record} className="border-r border-b border-slate-200 last:border-r-0" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
                    ))}
                  </div>

                  {/* Row 2: Occlusal & Info */}
                  <div className="grid grid-cols-3 gap-0 border-b border-slate-200">
                    <PhotoBox record={records.find(r => r.id === 'occlusal-upper')!} className="border-r border-slate-200" getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
                    <div className="flex flex-col items-center justify-center text-center p-8 bg-white h-full border-r border-slate-200">
                      <h2 
                        className={`text-3xl font-serif text-slate-900 leading-tight tracking-tight transition-all duration-300 ${blurPatientName ? 'select-none' : ''}`}
                        style={blurPatientName ? { filter: 'blur(8px)', WebkitFilter: 'blur(8px)' } : {}}
                      >{patientName || 'Patient Records'}</h2>
                      <p className="text-lg font-serif text-slate-600 mt-2">{date}</p>
                      <div className="mt-6 pt-6 border-t border-slate-100 text-[11px] font-serif text-slate-500 space-y-2 max-w-[240px] italic">
                        <p>{chiefComplaint || "No clinical details provided"}</p>
                      </div>
                    </div>
                    <PhotoBox record={records.find(r => r.id === 'occlusal-lower')!} getAspectRatioClass={getAspectRatioClass} showLabels={showLabels} onSelectPhoto={onSelectPhoto} onTriggerUpload={onTriggerUpload} onFullscreen={onFullscreen} onEdit={onEdit} />
                  </div>

                  {/* Row 3: Intraoral */}
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
                    <div className="p-10 bg-white flex flex-col items-end justify-end">
                      <span className="text-4xl font-serif italic text-slate-900">Shady Elkelany</span>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Orthodontic Specialist</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(GridFullscreenModal);
