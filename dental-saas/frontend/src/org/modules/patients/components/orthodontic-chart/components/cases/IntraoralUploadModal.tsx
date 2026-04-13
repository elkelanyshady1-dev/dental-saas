import React from 'react';
import {
  Activity,
  Plus,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PhotoRecord } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   IntraoralUploadModal — Modal grid for uploading intraoral photos.
   Extracted from OrthoRecordsTab (lines 3153–3235) without logic changes.
   ═══════════════════════════════════════════════════════════════ */

export interface IntraoralUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: PhotoRecord[];
  getAspectRatioClass: (ratio: string) => string;
  onSelectPhoto: (record: PhotoRecord) => void;
  onTriggerUpload: () => void;
}

const IntraoralUploadModal: React.FC<IntraoralUploadModalProps> = ({
  isOpen,
  onClose,
  records,
  getAspectRatioClass,
  onSelectPhoto,
  onTriggerUpload,
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
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Intraoral Records</h3>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">16:9 Widescreen Aspect Ratio</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {records.filter(r => r.type === 'intraoral' || r.type === 'occlusal' || r.id?.toLowerCase().includes('occlusal')).map(record => (
                  <div key={record.id} className="space-y-4">
                    <div 
                      className={`group relative bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-all ${getAspectRatioClass(record.aspectRatio)}`}
                      onClick={() => {
                        onSelectPhoto(record);
                        onTriggerUpload();
                      }}
                    >
                      {record.url ? (
                        <img 
                          src={resolveFileUrl(record.url)} 
                          alt={record.label}
                          className="w-full h-full object-contain bg-slate-50"
                          style={{ 
                            transform: `rotate(${record.rotation || 0}deg) scaleX(${record.flipH ? -1 : 1}) scaleY(${record.flipV ? -1 : 1})`,
                            referrerPolicy: 'no-referrer'
                          } as any}
                        />
                      ) : (
                        <Plus className="w-8 h-8 text-slate-300 group-hover:text-emerald-400" />
                      )}
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{record.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-4">
              <button 
                onClick={onClose}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Close
              </button>
              <button 
                onClick={onClose}
                className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                Save All
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default IntraoralUploadModal;
