import React, { useState } from 'react';
import { 
  FileText, 
  Activity, 
  Camera,
  Plus, 
  CheckCircle2,
  AlertTriangle,
  Save,
  Layers,
  Settings,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecordSet, PhotoRecord } from '../../types';

interface TreatmentPlanTabProps {
  data: RecordSet;
  onUpdate: (data: Partial<RecordSet>) => void;
  onOpenPhotoViewer: () => void;
}

export const TreatmentPlanTab: React.FC<TreatmentPlanTabProps> = ({ data, onUpdate, onOpenPhotoViewer }) => {
  const [isPlanCreated, setIsPlanCreated] = useState(!!data.treatmentPlan);
  
  const treatmentPlan = data.treatmentPlan || {
    typeOfTreatment: {
      orthopaedic: false,
      orthognathic: false,
      orthodontic: true
    },
    typeOfAppliance: {
      maxilla: 'fixed' as const,
      mandible: 'fixed' as const,
      details: ''
    },
    bracketSystem: 'metal' as const,
    ligationSystem: 'conventional' as const,
    slotSize: '0.022' as const,
    prescription: 'MBT' as const,
    company: '',
    spaceRequirement: {
      extraction: false,
      nonExtraction: true,
      attemptNonExtraction: false,
      ipr: false,
      expansion: false,
      distalization: false
    },
    anchorageRequirements: {
      maxilla: 'moderate' as const,
      mandible: 'minimum' as const,
      details: ''
    },
    disarticulation: 'no' as const,
    specialConsideration: '',
    retention: {
      maxilla: 'fixed' as const,
      mandible: 'fixed' as const,
      details: ''
    }
  };

  const handleCreatePlan = () => {
    setIsPlanCreated(true);
    onUpdate({ treatmentPlan });
  };

  const handleUpdatePlan = (field: string, value: any) => {
    const updatedPlan = JSON.parse(JSON.stringify(treatmentPlan));
    if (field.includes('.')) {
      const parts = field.split('.');
      let current = updatedPlan;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    } else {
      updatedPlan[field] = value;
    }
    onUpdate({ treatmentPlan: updatedPlan });
  };

  const suggestPlanFromProblems = () => {
    if (!data.problemList) return;
    
    const updatedPlan = JSON.parse(JSON.stringify(treatmentPlan));
    const problems = data.problemList.developmental;

    if (problems.apProblems.skeletal === 'class2') {
      updatedPlan.anchorageRequirements.maxilla = 'maximum';
      updatedPlan.typeOfTreatment.orthopaedic = true;
    } else if (problems.apProblems.skeletal === 'class3') {
      updatedPlan.anchorageRequirements.mandible = 'maximum';
      updatedPlan.typeOfTreatment.orthognathic = true;
    }

    if (problems.transverse.skeletal) {
      updatedPlan.spaceRequirement.expansion = true;
    }

    if (problems.spaceEruption.maxilla.toLowerCase().includes('crowding') || 
        problems.spaceEruption.mandible.toLowerCase().includes('crowding')) {
      updatedPlan.spaceRequirement.extraction = true;
      updatedPlan.spaceRequirement.nonExtraction = false;
    }

    onUpdate({ treatmentPlan: updatedPlan });
  };

  if (!isPlanCreated) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-slate-200 shadow-sm min-h-[400px] animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center text-blue-600 mb-6 shadow-lg shadow-blue-100/50">
          <Target className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">No Treatment Plan Found</h3>
        <p className="text-slate-500 mb-8 text-center max-w-sm">Create a comprehensive treatment plan based on the problem list and clinical records.</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={handleCreatePlan}
            className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 hover:scale-105 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Create Treatment Plan
          </button>
          <button 
            onClick={onOpenPhotoViewer}
            className="flex items-center gap-3 px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all border border-slate-200"
          >
            <Camera className="w-5 h-5" />
            Review Records First
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Treatment Plan</h3>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Orthodontic Strategy & Mechanics</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={suggestPlanFromProblems}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all border border-blue-100"
          >
            <Activity className="w-4 h-4" />
            Suggest from Problems
          </button>
          <button 
            onClick={onOpenPhotoViewer}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all border border-slate-200"
          >
            <Camera className="w-4 h-4" />
            View Records
          </button>
          <button 
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
          >
            <Save className="w-4 h-4" />
            Save Plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Treatment Type & Appliance */}
          <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
              <Settings className="w-5 h-5 text-blue-500" />
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Treatment Strategy</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Type of Treatment</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'orthodontic', label: 'Orthodontic' },
                    { id: 'orthopaedic', label: 'Orthopaedic' },
                    { id: 'orthognathic', label: 'Orthognathic' }
                  ].map(type => (
                    <button
                      key={type.id}
                      onClick={() => handleUpdatePlan(`typeOfTreatment.${type.id}`, !(treatmentPlan.typeOfTreatment as any)[type.id])}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        (treatmentPlan.typeOfTreatment as any)[type.id]
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Appliance Type</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'maxilla', label: 'Maxilla' },
                    { key: 'mandible', label: 'Mandible' }
                  ].map(arch => (
                    <div key={arch.key} className="space-y-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">{arch.label}</span>
                      <select 
                        value={(treatmentPlan.typeOfAppliance as any)[arch.key] || ''}
                        onChange={(e) => handleUpdatePlan(`typeOfAppliance.${arch.key}`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="removable">Removable</option>
                        <option value="fixed-removable">Fixed-Removable</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Bracket System Details</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">System</span>
                  <select 
                    value={treatmentPlan.bracketSystem || ''}
                    onChange={(e) => handleUpdatePlan('bracketSystem', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="metal">Metal</option>
                    <option value="clear">Clear</option>
                    <option value="clear-metal-slot">Clear Metal Slot</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Ligation</span>
                  <select 
                    value={treatmentPlan.ligationSystem || ''}
                    onChange={(e) => handleUpdatePlan('ligationSystem', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="conventional">Conventional</option>
                    <option value="self-ligating">Self-Ligating</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Slot Size</span>
                  <select 
                    value={treatmentPlan.slotSize || ''}
                    onChange={(e) => handleUpdatePlan('slotSize', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="0.018">0.018"</option>
                    <option value="0.022">0.022"</option>
                    <option value="bidimensional">Bidimensional</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Prescription</span>
                  <select 
                    value={treatmentPlan.prescription || ''}
                    onChange={(e) => handleUpdatePlan('prescription', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="ROTH">ROTH</option>
                    <option value="MBT">MBT</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Space & Anchorage */}
          <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-3 mb-2">
              <Layers className="w-5 h-5 text-purple-500" />
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Space & Anchorage</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Space Requirement</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'extraction', label: 'Extraction' },
                    { id: 'nonExtraction', label: 'Non-Extraction' },
                    { id: 'ipr', label: 'IPR' },
                    { id: 'expansion', label: 'Expansion' },
                    { id: 'distalization', label: 'Distalization' }
                  ].map(req => (
                    <button
                      key={req.id}
                      onClick={() => handleUpdatePlan(`spaceRequirement.${req.id}`, !(treatmentPlan.spaceRequirement as any)[req.id])}
                      className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all border ${
                        (treatmentPlan.spaceRequirement as any)[req.id]
                        ? 'bg-purple-600 border-purple-600 text-white shadow-md'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-purple-300 hover:text-purple-600'
                      }`}
                    >
                      {req.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Anchorage Requirements</label>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'maxilla', label: 'Maxilla' },
                    { key: 'mandible', label: 'Mandible' }
                  ].map(arch => (
                    <div key={arch.key} className="space-y-2">
                      <span className="text-[9px] font-bold text-slate-500 uppercase">{arch.label}</span>
                      <select 
                        value={(treatmentPlan.anchorageRequirements as any)[arch.key] || ''}
                        onChange={(e) => handleUpdatePlan(`anchorageRequirements.${arch.key}`, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-purple-500/20"
                      >
                        <option value="minimum">Minimum</option>
                        <option value="moderate">Moderate</option>
                        <option value="maximum">Maximum</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar / Summary */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-xl">
            <h4 className="text-sm font-bold uppercase tracking-widest mb-6 text-white/60">Plan Summary</h4>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Status</span>
                  <p className="text-xs text-white/80 leading-relaxed">
                    Plan active and ready for implementation
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Mechanics</span>
                  <p className="text-xs text-white/80 leading-relaxed">
                    {treatmentPlan.bracketSystem} system, {treatmentPlan.slotSize} slot, {treatmentPlan.prescription} prescription
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Special Considerations</span>
                  </div>
                  <textarea 
                    value={treatmentPlan.specialConsideration}
                    onChange={(e) => handleUpdatePlan('specialConsideration', e.target.value)}
                    className="w-full bg-transparent border-none text-[10px] text-white/60 focus:ring-0 p-0 resize-none h-16"
                    placeholder="Enter any special considerations..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Retention Strategy</h4>
            <div className="space-y-4">
              {[
                { key: 'maxilla', label: 'Maxilla' },
                { key: 'mandible', label: 'Mandible' }
              ].map(arch => (
                <div key={arch.key} className="space-y-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">{arch.label}</span>
                  <select 
                    value={(treatmentPlan.retention as any)[arch.key] || ''}
                    onChange={(e) => handleUpdatePlan(`retention.${arch.key}`, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="fixed">Fixed</option>
                    <option value="essix">Essix</option>
                    <option value="hawley">Hawley</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
