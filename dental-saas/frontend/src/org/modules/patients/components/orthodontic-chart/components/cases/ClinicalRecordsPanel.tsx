import React from 'react';
import { FileText } from 'lucide-react';
import AudioRecorder from './AudioRecorder';

/* ═══════════════════════════════════════════════════════════════
   ClinicalRecordsPanel — Chief complaint + voice note panel.
   Extracted from OrthoRecordsTab (lines 744–811).
   ═══════════════════════════════════════════════════════════════ */

export interface ClinicalRecordsPanelProps {
  patientId: string;
  chiefComplaint: string;
  onChiefComplaintChange: (value: string) => void;
  audioUrl: string | null;
  onAudioChange: (url: string | null) => void;
}

const ClinicalRecordsPanel: React.FC<ClinicalRecordsPanelProps> = ({
  patientId,
  chiefComplaint,
  onChiefComplaintChange,
  audioUrl,
  onAudioChange,
}) => {
  return (
    <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">Clinical Records</h3>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Patient ID: {patientId}</p>
        </div>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Chief Complaint</label>
            <AudioRecorder audioUrl={audioUrl} onAudioChange={onAudioChange} />
          </div>
          <textarea 
            value={chiefComplaint}
            onChange={(e) => onChiefComplaintChange(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
            placeholder="Enter patient's chief complaint..."
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(ClinicalRecordsPanel);
