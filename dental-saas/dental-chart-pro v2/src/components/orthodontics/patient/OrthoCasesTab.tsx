import React, { useState, useCallback } from 'react';
import { LayoutGrid, Plus, Smile, Calendar, Activity, ChevronRight, Eye, Edit3, XCircle, ArrowLeft, X, Save, FileText, Share2, Download, Layers, History, Printer, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Case, RecordSet } from '../../../types';
import OrthoRecordsTab from './OrthoRecordsTab';

interface OrthoCasesTabProps {
  patientId: string;
  cases: Case[];
  onOpenSnapshotEditor: (appointmentId: string) => void;
}

const OrthoCasesTab: React.FC<OrthoCasesTabProps> = ({ patientId, cases: initialCases, onOpenSnapshotEditor }) => {
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedRecordSetId, setSelectedRecordSetId] = useState<string | null>(null);

  // Modal state
  const [isAddRecordSetModalOpen, setIsAddRecordSetModalOpen] = useState(false);
  const [newRecordSetName, setNewRecordSetName] = useState('Mid-record');
  const [newRecordSetDate, setNewRecordSetDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRecordSetComplaint, setNewRecordSetComplaint] = useState('');

  const handleSelectCase = (c: Case) => {
    setSelectedCase(c);
    if (c.recordSets && c.recordSets.length > 0) {
      setSelectedRecordSetId(c.recordSets[0].id);
    } else {
      setSelectedRecordSetId(null);
    }
  };

  const handleUpdateRecordSet = useCallback((updatedData: Partial<RecordSet>) => {
    if (!selectedRecordSetId || !selectedCase) return;
    
    const updatedRecordSets = selectedCase.recordSets?.map(rs => 
      rs.id === selectedRecordSetId ? { ...rs, ...updatedData } : rs
    );
    const updatedCase = { ...selectedCase, recordSets: updatedRecordSets };
    
    setSelectedCase(updatedCase);
    setCases(prevCases => prevCases.map(c => c.id === selectedCase.id ? updatedCase : c));
  }, [selectedRecordSetId, selectedCase]);

  const handleAddCase = () => {
    const newCase: Case = {
      id: `case-${cases.length + 1}`,
      patientId,
      caseType: 'New Case',
      status: 'Planning',
      startDate: new Date().toISOString().split('T')[0],
      progress: 0,
      problemList: [],
      treatmentPlan: [],
      timeline: [],
      recordSets: [
        {
          id: `rs-${Math.random().toString(36).substr(2, 9)}`,
          name: 'Pre-record',
          date: new Date().toISOString().split('T')[0],
          records: [],
          chiefComplaint: '',
          audioUrl: null,
          stlFiles: []
        }
      ]
    };
    setCases([...cases, newCase]);
  };

  const handleOpenAddRecordSetModal = () => {
    setNewRecordSetName('Mid-record');
    setNewRecordSetDate(new Date().toISOString().split('T')[0]);
    setNewRecordSetComplaint('');
    setIsAddRecordSetModalOpen(true);
  };

  const handleConfirmAddRecordSet = () => {
    if (!selectedCase) return;
    
    const newRecordSet: RecordSet = {
      id: `rs-${Math.random().toString(36).substr(2, 9)}`,
      name: newRecordSetName,
      date: newRecordSetDate,
      records: [],
      chiefComplaint: newRecordSetComplaint,
      audioUrl: null,
      stlFiles: []
    };

    const updatedCase = {
      ...selectedCase,
      recordSets: [...(selectedCase.recordSets || []), newRecordSet]
    };

    setCases(cases.map(c => c.id === selectedCase.id ? updatedCase : c));
    setSelectedCase(updatedCase);
    setSelectedRecordSetId(newRecordSet.id);
    setIsAddRecordSetModalOpen(false);
  };

  if (selectedCase) {
    const activeRecordSet = selectedCase.recordSets?.find(rs => rs.id === selectedRecordSetId);

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedCase(null)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Case #{selectedCase.id.split('-')[1] || '1'}</h3>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{selectedCase.caseType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1 p-1 bg-blue-50/30 border border-dashed border-blue-200 rounded-2xl mr-4">
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <Edit3 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Edit Case
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <FileText className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Clinical Report
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <LayoutGrid className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Treatment Plan
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <Layers className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Compare Records
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <History className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                History
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <Share2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Share Portal
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <Download className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Export
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <Printer className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Print
              </button>
              <div className="w-px h-4 bg-blue-100" />
              <button className="flex items-center gap-2 px-3 py-2 hover:bg-white rounded-xl transition-all text-slate-600 hover:text-blue-600 text-[10px] font-bold uppercase tracking-wider group">
                <ExternalLink className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                Portal
              </button>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100 whitespace-nowrap">
              {selectedCase.status}
            </span>
          </div>
        </div>

        {/* Record Sets Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
          {selectedCase.recordSets?.map((rs) => (
            <button
              key={rs.id}
              onClick={() => setSelectedRecordSetId(rs.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedRecordSetId === rs.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 opacity-60" />
              {rs.name}
              <span className="text-[10px] opacity-60 font-medium">({rs.date})</span>
            </button>
          ))}
          <button 
            onClick={handleOpenAddRecordSetModal}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors border border-dashed border-slate-300"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Record Set
          </button>
        </div>

        {activeRecordSet ? (
          <OrthoRecordsTab 
            key={activeRecordSet.id} 
            patientId={patientId} 
            initialData={activeRecordSet} 
            onUpdate={handleUpdateRecordSet}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
              <LayoutGrid className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-800 mb-2">No Record Sets Found</h4>
            <p className="text-sm text-slate-500 mb-6">Start by adding a pre-record, mid-record, or post-record set.</p>
            <button 
              onClick={handleOpenAddRecordSetModal}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              Create First Record Set
            </button>
          </div>
        )}

        {/* Add Record Set Modal */}
        <AnimatePresence>
          {isAddRecordSetModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAddRecordSetModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Add Record Set</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Clinical Record</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsAddRecordSetModalOpen(false)}
                    className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      Record Set Name
                    </label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Pre-record', 'Mid-record', 'Post-record'].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setNewRecordSetName(preset)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                            newRecordSetName === preset
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text"
                      value={newRecordSetName}
                      onChange={(e) => setNewRecordSetName(e.target.value)}
                      placeholder="e.g. Mid-record, Post-record"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Record Date
                    </label>
                    <input 
                      type="date"
                      value={newRecordSetDate}
                      onChange={(e) => setNewRecordSetDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      Chief Complaint / Details
                    </label>
                    <textarea 
                      value={newRecordSetComplaint}
                      onChange={(e) => setNewRecordSetComplaint(e.target.value)}
                      placeholder="Enter clinical details or patient complaint..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none h-24"
                    />
                  </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                  <button 
                    onClick={() => setIsAddRecordSetModalOpen(false)}
                    className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmAddRecordSet}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Create Set
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Orthodontic Cases</h3>
        <button 
          onClick={handleAddCase}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md"
        >
          <Plus className="w-4 h-4" />
          Create New Orthodontic Case
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cases.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Smile className="w-6 h-6" />
                </div>
                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100">
                  {c.status}
                </span>
              </div>
              
              <h4 className="text-lg font-bold text-slate-800 mb-1">Case #{c.id.split('-')[1] || '1'}</h4>
              <p className="text-xs font-medium text-slate-500 mb-4">{c.caseType}</p>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">Start Date</span>
                  <span className="font-bold text-slate-700">{c.startDate}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">Record Sets</span>
                  <span className="font-bold text-slate-700">{c.recordSets?.length || 0} Sets</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress</span>
                    <span className="text-[10px] font-bold text-blue-600">{c.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.progress}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => handleSelectCase(c)}
                  className="flex items-center justify-center gap-2 py-2 bg-slate-50 text-slate-700 rounded-xl text-[10px] font-bold hover:bg-slate-100 transition-colors border border-slate-100"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open Case
                </button>
                <button 
                  onClick={() => onOpenSnapshotEditor('app-1')}
                  className="flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Snapshot Editor
                </button>
              </div>
              
              <button className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-[10px] font-bold transition-colors">
                <XCircle className="w-3.5 h-3.5" />
                Close Case
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrthoCasesTab;
