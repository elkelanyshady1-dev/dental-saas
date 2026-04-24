import React from 'react';
import { Clock, MessageSquare, Mic, Paperclip, Save, CheckCircle2, Activity, RefreshCw } from 'lucide-react';
import { Action } from '../../../types';

interface AppointmentActionPanelProps {
  actions: Action[];
  notes: string;
  onNotesChange: (notes: string) => void;
  onSaveSnapshot: () => void;
  isSaving: boolean;
}

const AppointmentActionPanel: React.FC<AppointmentActionPanelProps> = ({ 
  actions, 
  notes, 
  onNotesChange, 
  onSaveSnapshot,
  isSaving
}) => {
  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          Appointment Actions
        </h3>
      </div>

      {/* Real-time Actions Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {actions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
              <Activity className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-slate-400">No actions logged yet. Interactions with the chart will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-100">
            {actions.map((action, i) => (
              <div key={action.id} className="relative pl-6">
                <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center z-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-bold text-slate-400">
                    {new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-700 mt-0.5">{action.description}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Tooth: {action.tooth}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clinical Notes & Tools */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/30 space-y-4">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Clinical Notes</label>
          <div className="relative">
            <textarea 
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Enter appointment notes..."
              className="w-full h-32 bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none shadow-sm"
            />
            <button className="absolute right-2 bottom-2 p-1.5 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors">
              <Mic className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
            <Paperclip className="w-3.5 h-3.5" />
            Attachments
          </button>
          <button 
            onClick={onSaveSnapshot}
            disabled={isSaving}
            className={`flex-[1.5] flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-bold hover:bg-blue-700 transition-all shadow-md ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {isSaving ? 'Saving...' : 'Save Snapshot'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppointmentActionPanel;
