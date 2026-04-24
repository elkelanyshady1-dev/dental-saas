import React, { useRef } from 'react';
import { 
  History, 
  StickyNote, 
  Paperclip, 
  Mic, 
  Trash2, 
  X, 
  Image as ImageIcon, 
  File as FileIcon,
  Camera,
  Save,
  ScanLine,
  Stethoscope,
} from 'lucide-react';
import { useOrthodonticAppointment } from '../../context/OrthodonticAppointmentContext';

interface ActionPanelProps {
  onSaveSnapshot:           (actions: any[], notes: string, attachments: any[]) => void;
  /** Phase 3.X — triggers OPG analysis modal (saves as pretreatment snapshot) */
  onOpenOPGAnalysis?:       () => void;
  /** Phase 3.X — triggers Occlusal analysis modal (saves as pretreatment snapshot) */
  onOpenOcclusalAnalysis?:  () => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  onSaveSnapshot,
  onOpenOPGAnalysis,
  onOpenOcclusalAnalysis,
}) => {
  const { 
    actions, 
    notes, 
    attachments, 
    removeAction, 
    updateNotes, 
    addAttachment, 
    removeAttachment,
    resetAppointment
  } = useOrthodonticAppointment();
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => addAttachment(file));
    }
  };

  const handleSave = () => {
    onSaveSnapshot(actions, notes, attachments);
    // Optionally reset after save if that's the desired workflow
    // resetAppointment();
  };

  return (
    <aside className="w-80 border-r border-slate-200 bg-white flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Appointment Actions</h2>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Live Timeline</p>
          </div>
        </div>
      </div>

      {/* Actions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <History className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-xs font-bold uppercase tracking-widest">No actions recorded</p>
          </div>
        ) : (
          actions.slice().reverse().map((action) => (
            <div key={action.id} className="group relative bg-slate-50 rounded-lg p-3 border border-slate-100 hover:border-blue-200 transition-all">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  {formatTime(action.timestamp)}
                </span>
                <button 
                  onClick={() => removeAction(action.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-xs text-slate-700 font-medium">
                <span className="font-bold text-slate-900 mr-1">{action.tooth}:</span>
                {action.description}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Notes Section */}
      <div className="p-4 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="w-3.5 h-3.5 text-slate-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clinical Notes</h3>
          </div>
          <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
            <Mic className="w-4 h-4" />
          </button>
        </div>
        <textarea
          className="w-full h-24 p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none custom-scrollbar"
          placeholder="Type clinical observations..."
          value={notes}
          onChange={(e) => updateNotes(e.target.value)}
        />
      </div>

      {/* Attachments Section */}
      <div className="p-4 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-slate-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attachments</h3>
          </div>
          <div className="flex gap-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            onChange={handleFileChange}
          />
        </div>

        {attachments.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {attachments.map((att) => (
              <div key={att.id} className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden group">
                {att.preview ? (
                  <img src={att.preview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                    <FileIcon className="w-4 h-4 text-slate-400" />
                  </div>
                )}
                <button 
                  onClick={() => removeAttachment(att.id)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analysis Buttons — Phase 3.X */}
      <div className="px-4 pb-2 space-y-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pretreatment Analysis</p>
        <button
          onClick={onOpenOPGAnalysis}
          disabled={!onOpenOPGAnalysis}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all"
        >
          <ScanLine className="w-3.5 h-3.5" />
          OPG Radiographic Analysis
        </button>
        <button
          onClick={onOpenOcclusalAnalysis}
          disabled={!onOpenOcclusalAnalysis}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all"
        >
          <Stethoscope className="w-3.5 h-3.5" />
          Occlusal Analysis
        </button>
      </div>

      {/* Save Button */}
      <div className="p-4 border-t border-slate-100">
        <button 
          onClick={handleSave}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95"
        >
          <Save className="w-4 h-4" />
          Save Visit Snapshot
        </button>
      </div>
    </aside>
  );
};

