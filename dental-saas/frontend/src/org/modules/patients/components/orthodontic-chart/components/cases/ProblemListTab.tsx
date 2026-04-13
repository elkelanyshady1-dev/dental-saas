import React, { useState } from 'react';
import { 
  AlertCircle, 
  Activity, 
  Camera, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Smile, 
  Eye, 
  FileText,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecordSet, PhotoRecord } from '../../types';
import { DentalNotationChart } from './DentalNotationChart';
import { generateProblemsFromAnalysis, mergeAutoProblems } from './analysisToProblems';

interface ProblemListTabProps {
  data: RecordSet;
  onUpdate: (data: Partial<RecordSet>) => void;
  onOpenPhotoViewer: () => void;
}

export const ProblemListTab: React.FC<ProblemListTabProps> = ({ data, onUpdate, onOpenPhotoViewer }) => {
  const [activeCategory, setActiveCategory] = useState<'pathological' | 'developmental'>('pathological');
  
  const problemList = data.problemList || {
    pathological: {
      caries: '',
      missingTeeth: '',
      impactedTeeth: '',
      extraTeeth: '',
      ankylosedTeeth: '',
      nonRestorable: '',
      other: ''
    },
    developmental: {
      esthetics: {
        frontalSmile: '',
        frontalRest: '',
        profile: ''
      },
      spaceEruption: {
        maxilla: '',
        mandible: ''
      },
      functional: {
        none: true,
        tmd: false,
        swallowing: false,
        speech: false,
        smile: false,
        mastication: false
      },
      transverse: {
        skeletal: false,
        dental: false
      },
      apProblems: {
        skeletal: null,
        dental: {
          molarClass: '',
          canineClass: '',
          incisalClass: '',
          increasedOverjet: '',
          anteriorCrossbite: ''
        }
      },
      verticalProblems: {
        skeletal: null,
        dental: null
      },
      other: ''
    }
  };

  const handleUpdateProblem = (category: 'pathological' | 'developmental', field: string, value: any) => {
    const updatedProblemList = JSON.parse(JSON.stringify(problemList));
    
    if (category === 'pathological') {
      updatedProblemList.pathological[field] = value;
    } else {
      if (field.includes('.')) {
        const parts = field.split('.');
        let current = updatedProblemList.developmental;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        updatedProblemList.developmental[field] = value;
      }
    }
    onUpdate({ problemList: updatedProblemList });
  };

  const deriveFromCephAnalysis = () => {
    const cephRecord = data.records?.find(r => r.id === 'ceph');
    if (!cephRecord || !cephRecord.analysis) return;

    const analysis = cephRecord.analysis;
    const updatedProblemList = JSON.parse(JSON.stringify(problemList));

    const anb = parseFloat(analysis.anb);
    if (!isNaN(anb)) {
      if (anb > 4) updatedProblemList.developmental.apProblems.skeletal = 'class2';
      else if (anb < 0) updatedProblemList.developmental.apProblems.skeletal = 'class3';
      else updatedProblemList.developmental.apProblems.skeletal = 'class1';
    }

    const sna = parseFloat(analysis.sna);
    if (!isNaN(sna)) {
      let maxPos = '';
      if (sna > 86) maxPos = 'Maxillary Protrusion';
      else if (sna < 80) maxPos = 'Maxillary Retrusion';
      else maxPos = 'Maxillary Normal';
      if (!updatedProblemList.developmental.other.includes(maxPos)) {
        updatedProblemList.developmental.other += (updatedProblemList.developmental.other ? ', ' : '') + maxPos;
      }
    }

    const snb = parseFloat(analysis.snb);
    if (!isNaN(snb)) {
      let mandPos = '';
      if (snb > 83) mandPos = 'Mandibular Protrusion';
      else if (snb < 77) mandPos = 'Mandibular Retrusion';
      else mandPos = 'Mandibular Normal';
      if (!updatedProblemList.developmental.other.includes(mandPos)) {
        updatedProblemList.developmental.other += (updatedProblemList.developmental.other ? ', ' : '') + mandPos;
      }
    }

    const mmp = parseFloat(analysis.mmp);
    if (!isNaN(mmp)) {
      if (mmp > 28) updatedProblemList.developmental.verticalProblems.skeletal = 'open-bite';
      else if (mmp < 22) updatedProblemList.developmental.verticalProblems.skeletal = 'deep-bite';
      else updatedProblemList.developmental.verticalProblems.skeletal = null;
    }

    const u1pp = parseFloat(analysis.u1pp);
    if (!isNaN(u1pp)) {
      if (u1pp > 117) updatedProblemList.developmental.apProblems.dental.incisalClass = 'Proclined Upper Incisors';
      else if (u1pp < 107) updatedProblemList.developmental.apProblems.dental.incisalClass = 'Retroclined Upper Incisors';
      else updatedProblemList.developmental.apProblems.dental.incisalClass = 'Normal Upper Incisors';
    }

    const l1mandb = parseFloat(analysis.l1mandb);
    if (!isNaN(l1mandb)) {
      if (l1mandb > 104) updatedProblemList.developmental.apProblems.dental.canineClass = 'Proclined Lower Incisors';
      else if (l1mandb < 92) updatedProblemList.developmental.apProblems.dental.canineClass = 'Retroclined Lower Incisors';
      else updatedProblemList.developmental.apProblems.dental.canineClass = 'Normal Lower Incisors';
    }

    const cvm = analysis.cvmStage;
    if (cvm) {
      const isGrowing = cvm === 'CS2' || cvm === 'CS3';
      const growthStatus = isGrowing ? 'Growing (CVM Stage ' + cvm + ')' : 'Non-Growing (CVM Stage ' + cvm + ')';
      if (!updatedProblemList.developmental.other.includes(growthStatus)) {
        updatedProblemList.developmental.other += (updatedProblemList.developmental.other ? ', ' : '') + growthStatus;
      }
    }

    onUpdate({ problemList: updatedProblemList });
  };

  const handleAutoGenerateAll = () => {
    const records = data.records || [];
    const autoProblems = generateProblemsFromAnalysis(records);
    if (autoProblems.length === 0) return;
    const merged = mergeAutoProblems(problemList, autoProblems);
    onUpdate({ problemList: merged });
  };

  const handleDentalChartChange = (tooth: string, statuses: string[]) => {
    const updatedProblemList = { ...problemList };
    onUpdate({ problemList: updatedProblemList });
  };

  const deriveEstheticsFromRecords = () => {
    const records = data.records || [];
    const frontRest = records.find(r => r.id === 'front-rest')?.analysis || {};
    const frontSmile = records.find(r => r.id === 'front-smile')?.analysis || {};
    const profileRest = records.find(r => r.id === 'profile-rest')?.analysis || {};

    const frontalRestStr = [
      frontRest.facialType ? `Facial Type: ${frontRest.facialType}` : '',
      frontRest.lipLength ? `Lip Length: ${frontRest.lipLength}` : '',
      frontRest.lipPosture ? `Lip Posture: ${frontRest.lipPosture}` : '',
      frontRest.lipCompetency ? `Lip Competency: ${frontRest.lipCompetency}` : '',
      frontRest.asymmetry ? `Asymmetry: ${frontRest.asymmetry}` : ''
    ].filter(Boolean).join(', ');

    const frontalSmileStr = [
      frontSmile.upperLipPosition ? `Upper Lip Position: ${frontSmile.upperLipPosition}` : '',
      frontSmile.smileArc ? `Smile Arc: ${frontSmile.smileArc}` : '',
      frontSmile.incisalDisplay ? `Incisal Display: ${frontSmile.incisalDisplay}` : '',
      frontSmile.buccalCorridors ? `Buccal Corridors: ${frontSmile.buccalCorridors}` : '',
      frontSmile.smileSymmetry ? `Smile Symmetry: ${frontSmile.smileSymmetry}` : ''
    ].filter(Boolean).join(', ');

    const profileStr = [
      profileRest.profileType ? `Profile Type: ${profileRest.profileType}` : '',
      profileRest.nasolabialAngle ? `Nasolabial Angle: ${profileRest.nasolabialAngle}` : '',
      profileRest.mentolabialSulcus ? `Mentolabial Sulcus: ${profileRest.mentolabialSulcus}` : '',
      profileRest.chinPosition ? `Chin Position: ${profileRest.chinPosition}` : '',
      profileRest.upperLipProminence ? `Upper Lip: ${profileRest.upperLipProminence}` : '',
      profileRest.lowerLipProminence ? `Lower Lip: ${profileRest.lowerLipProminence}` : '',
      profileRest.throatAngle ? `Throat Angle: ${profileRest.throatAngle}` : '',
      profileRest.doubleChin ? `Double Chin: ${profileRest.doubleChin}` : '',
      profileRest.midfaceDeficiency ? `Midface: ${profileRest.midfaceDeficiency}` : '',
      profileRest.nasalDeformity ? `Nasal: ${profileRest.nasalDeformity}` : '',
      profileRest.lipFullness ? `Lip Fullness: ${profileRest.lipFullness}` : '',
      profileRest.vermilionLine ? `Vermilion Line: ${profileRest.vermilionLine}` : ''
    ].filter(Boolean).join(', ');

    const updatedProblemList = {
      ...problemList,
      developmental: {
        ...problemList.developmental,
        esthetics: {
          frontalSmile: frontalSmileStr || problemList.developmental.esthetics.frontalSmile,
          frontalRest: frontalRestStr || problemList.developmental.esthetics.frontalRest,
          profile: profileStr || problemList.developmental.esthetics.profile
        }
      }
    };

    onUpdate({ problemList: updatedProblemList });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header with Category Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Problem List</h3>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Diagnosis & Clinical Findings</p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => setActiveCategory('pathological')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'pathological'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Pathological
          </button>
          <button
            onClick={() => setActiveCategory('developmental')}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'developmental'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Developmental
          </button>
        </div>

        <button 
          onClick={onOpenPhotoViewer}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
        >
          <Camera className="w-4 h-4" />
          View Records
        </button>
        <button 
          onClick={handleAutoGenerateAll}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-xs font-bold hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-200 active:scale-95"
        >
          <Zap className="w-4 h-4" />
          Auto Generate Problems
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {activeCategory === 'pathological' ? (
            <div className="space-y-6">
              {/* Pathological Problems Form */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                <div className="flex items-center gap-3 mb-2">
                  <Stethoscope className="w-5 h-5 text-rose-500" />
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Pathological Assessment</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Caries</label>
                    <textarea 
                      value={problemList.pathological.caries}
                      onChange={(e) => handleUpdateProblem('pathological', 'caries', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-20 resize-none"
                      placeholder="List teeth with caries..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Missing Teeth</label>
                    <textarea 
                      value={problemList.pathological.missingTeeth}
                      onChange={(e) => handleUpdateProblem('pathological', 'missingTeeth', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-20 resize-none"
                      placeholder="List missing teeth..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Impacted Teeth</label>
                    <textarea 
                      value={problemList.pathological.impactedTeeth}
                      onChange={(e) => handleUpdateProblem('pathological', 'impactedTeeth', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-20 resize-none"
                      placeholder="List impacted teeth..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Extra / Supernumerary</label>
                    <textarea 
                      value={problemList.pathological.extraTeeth}
                      onChange={(e) => handleUpdateProblem('pathological', 'extraTeeth', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-20 resize-none"
                      placeholder="List extra teeth..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ankylosed Teeth</label>
                    <textarea 
                      value={problemList.pathological.ankylosedTeeth}
                      onChange={(e) => handleUpdateProblem('pathological', 'ankylosedTeeth', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-20 resize-none"
                      placeholder="List ankylosed teeth..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Non-Restorable</label>
                    <textarea 
                      value={problemList.pathological.nonRestorable}
                      onChange={(e) => handleUpdateProblem('pathological', 'nonRestorable', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-20 resize-none"
                      placeholder="List non-restorable teeth..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Other Pathological Problems</label>
                  <textarea 
                    value={problemList.pathological.other}
                    onChange={(e) => handleUpdateProblem('pathological', 'other', e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none transition-all h-24 resize-none"
                    placeholder="Enter any other pathological findings..."
                  />
                </div>
              </div>

              {/* Dental Chart Snapshot */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-purple-500" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Problem List Snapshot</h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">Interactive Chart</span>
                </div>
                <DentalNotationChart 
                  arch="both"
                  data={{}}
                  onChange={handleDentalChartChange}
                  mode="problem-list"
                />
                <p className="mt-4 text-[10px] text-slate-500 italic text-center">Tag teeth directly on the chart to visualize pathological issues.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Developmental Problems Form */}
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Smile className="w-5 h-5 text-blue-500" />
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Developmental Assessment</h4>
                  </div>
                  <button 
                    onClick={deriveFromCephAnalysis}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-[10px] font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200 active:scale-95"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Derive from Ceph
                  </button>
                </div>

                {/* Chief Complaint (Derived) */}
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chief Complaint</label>
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 uppercase">From Records</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 italic">"{data.chiefComplaint || 'No chief complaint recorded.'}"</p>
                </div>

                {/* Esthetic Problems */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Eye className="w-4 h-4" />
                      </div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">1) Esthetic Analysis</label>
                    </div>
                    <button 
                      onClick={deriveEstheticsFromRecords}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      Derive from Records
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { key: 'frontalSmile', label: 'Frontal Smile', hint: 'Smile Arc, Display' },
                      { key: 'frontalRest', label: 'Frontal Rest', hint: 'Proportions, Lips' },
                      { key: 'profile', label: 'Profile', hint: 'Nasolabial, Chin' }
                    ].map(item => (
                      <div key={item.key} className="group space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</span>
                          <span className="text-[8px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">{item.hint}</span>
                        </div>
                        <textarea 
                          value={(problemList.developmental.esthetics as any)[item.key]}
                          onChange={(e) => handleUpdateProblem('developmental', `esthetics.${item.key}`, e.target.value)}
                          className="w-full px-4 py-4 rounded-[24px] border border-slate-200 text-[11px] font-medium text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all h-32 resize-none bg-slate-50/50 hover:bg-white leading-relaxed placeholder:text-slate-300"
                          placeholder={`Describe ${item.label.toLowerCase()} findings...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Space & Eruption */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Maxillary Space/Eruption</label>
                    <textarea 
                      value={problemList.developmental.spaceEruption.maxilla}
                      onChange={(e) => handleUpdateProblem('developmental', 'spaceEruption.maxilla', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-20 resize-none"
                      placeholder="Crowding, spacing, eruption issues..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mandibular Space/Eruption</label>
                    <textarea 
                      value={problemList.developmental.spaceEruption.mandible}
                      onChange={(e) => handleUpdateProblem('developmental', 'spaceEruption.mandible', e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-20 resize-none"
                      placeholder="Crowding, spacing, eruption issues..."
                    />
                  </div>
                </div>

                {/* Transverse Problems */}
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">5) Transverse Problems</label>
                  <div className="flex gap-6">
                    {['skeletal', 'dental'].map(type => (
                      <label key={type} className="flex items-center gap-3 cursor-pointer group">
                        <div 
                          onClick={() => handleUpdateProblem('developmental', `transverse.${type}`, !(problemList.developmental.transverse as any)[type])}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${(problemList.developmental.transverse as any)[type] ? 'bg-blue-600 border-blue-600' : 'border-slate-200 group-hover:border-blue-400'}`}
                        >
                          {(problemList.developmental.transverse as any)[type] && <Plus className="w-3.5 h-3.5 text-white rotate-45" />}
                        </div>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider capitalize">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* A.P. Problems */}
                <div className="space-y-6">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">6) A.P. Problems</label>
                  
                  <div className="space-y-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-500 uppercase block">a. Skeletal Classification</span>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { id: 'class1', label: 'Class I' },
                        { id: 'class2', label: 'Class II' },
                        { id: 'class3', label: 'Class III' }
                      ].map(cls => (
                        <button
                          key={cls.id}
                          onClick={() => handleUpdateProblem('developmental', 'apProblems.skeletal', cls.id)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${
                            problemList.developmental.apProblems.skeletal === cls.id
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                          }`}
                        >
                          {cls.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <span className="text-[9px] font-bold text-slate-500 uppercase block">b. Dental Details</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        { field: 'molarClass', label: 'Molar Class', placeholder: 'e.g. Class I' },
                        { field: 'canineClass', label: 'Canine Class', placeholder: 'e.g. Class II' },
                        { field: 'incisalClass', label: 'Incisal Class', placeholder: 'e.g. Class I' },
                        { field: 'increasedOverjet', label: 'Increased Overjet', placeholder: 'e.g. 4mm' },
                        { field: 'anteriorCrossbite', label: 'Anterior Crossbite', placeholder: 'e.g. 11, 21' }
                      ].map(item => (
                        <div key={item.field} className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase">{item.label}</label>
                          <input 
                            type="text"
                            value={(problemList.developmental.apProblems.dental as any)[item.field]}
                            onChange={(e) => handleUpdateProblem('developmental', `apProblems.dental.${item.field}`, e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder={item.placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Vertical Problems */}
                <div className="space-y-6">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">7) Vertical Problems</label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { key: 'skeletal', label: 'a. Skeletal' },
                      { key: 'dental', label: 'b. Dental' }
                    ].map(section => (
                      <div key={section.key} className="space-y-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">{section.label}</span>
                        <div className="flex gap-3">
                          {[
                            { id: 'open-bite', label: 'Open-bite' },
                            { id: 'deep-bite', label: 'Deep-bite' }
                          ].map(v => (
                            <button
                              key={v.id}
                              onClick={() => handleUpdateProblem('developmental', `verticalProblems.${section.key}`, (problemList.developmental.verticalProblems as any)[section.key] === v.id ? null : v.id)}
                              className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${
                                (problemList.developmental.verticalProblems as any)[section.key] === v.id
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                              }`}
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">8) Other Problems</label>
                  <textarea 
                    value={problemList.developmental.other}
                    onChange={(e) => handleUpdateProblem('developmental', 'other', e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all h-24 resize-none"
                    placeholder="Enter any other developmental findings..."
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar / Summary */}
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-xl">
            <h4 className="text-sm font-bold uppercase tracking-widest mb-6 text-white/60">Problem Summary</h4>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Pathological</span>
                  <p className="text-xs text-white/80 leading-relaxed">
                    {Object.values(problemList.pathological).filter(v => v).length} issues identified
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1">Developmental</span>
                  <p className="text-xs text-white/80 leading-relaxed">
                    {problemList.developmental.esthetics.frontalSmile ? 'Esthetic, ' : ''}
                    {problemList.developmental.spaceEruption.maxilla ? 'Space, ' : ''}
                    Functional analysis pending
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ready for Treatment Plan</span>
                  </div>
                  <p className="text-[10px] text-white/40">Ensure all problems are documented before creating the treatment plan.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Analysis Tips</h4>
            <div className="space-y-3">
              {[
                "Check OPG for impacted 8s",
                "Verify midline shift in frontal view",
                "Assess profile convexity",
                "Look for early signs of resorption"
              ].map((tip, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl text-[10px] font-medium text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
