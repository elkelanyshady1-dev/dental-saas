import React from 'react';
import {
  Image as ImageIcon,
  Maximize2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PhotoRecord } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   PhotoViewerModal — Gallery modal for viewing all record photos.
   Extracted from OrthoRecordsTab (lines 3237–3324) without logic changes.
   ═══════════════════════════════════════════════════════════════ */

export interface PhotoViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: PhotoRecord[];
  patientName?: string;
  onSelectPhoto: (record: PhotoRecord) => void;
  onFullscreen: (record?: PhotoRecord) => void;
  blurPatientName?: boolean;
}

const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  isOpen,
  onClose,
  records,
  patientName,
  onSelectPhoto,
  onFullscreen,
  blurPatientName = false,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 
                    className={`text-xl font-bold text-slate-900 transition-all duration-300 ${blurPatientName ? 'select-none' : ''}`}
                    style={blurPatientName ? { filter: 'blur(8px)', WebkitFilter: 'blur(8px)' } : {}}
                  >{patientName ? `${patientName} — Records` : 'Patient Records Viewer'}</h3>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Select a photo to view in detail</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-slate-100 rounded-2xl transition-all text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {records.map(record => (
                  <div 
                    key={record.id}
                    className="group relative bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer"
                    onClick={() => {
                      if (record.url) {
                        onSelectPhoto(record);
                        onFullscreen(record);
                      }
                    }}
                  >
                    <div className={`relative aspect-square bg-slate-100 flex items-center justify-center overflow-hidden`}>
                      {record.url ? (
                        <img 
                          src={resolveFileUrl(record.url)} 
                          alt={record.label}
                          className="w-full h-full object-cover transition-transform group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-300">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">No Image</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-all flex items-center justify-center">
                        {record.url && <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" />}
                      </div>
                    </div>
                    <div className="p-4 bg-white border-t border-slate-100">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block text-center truncate">
                        {record.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-white border-t border-slate-100 flex justify-end">
              <button 
                onClick={onClose}
                className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
              >
                Close Viewer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PhotoViewerModal;
