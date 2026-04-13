import React, { useState } from 'react';
import { Smile, Activity, Calendar, FileText, LayoutGrid, Users } from 'lucide-react';
import OrthoOverviewTab from './OrthoOverviewTab';
import OrthoTimelineTab from './OrthoTimelineTab';
import OrthoCasesTab from './OrthoCasesTab';
import OrthoLabTab from './OrthoLabTab';
import SnapshotEditor from '../snapshot/SnapshotEditor';
import { Case, Appointment, Snapshot, LabOrder } from '../../../types';

interface PatientOrthodonticModuleProps {
  patientId: string;
}

const PatientOrthodonticModule: React.FC<PatientOrthodonticModuleProps> = ({ patientId }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'cases' | 'lab'>('overview');
  const [isSnapshotEditorOpen, setIsSnapshotEditorOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Mock data - in a real app, this would be fetched from an API
  const [cases] = useState<Case[]>([
    {
      id: 'case-1',
      patientId,
      caseType: 'Fixed Appliance',
      status: 'Alignment Phase',
      startDate: '2024-01-15',
      expectedEndDate: '2025-07-15',
      progress: 62,
      problemList: ['Crowding', 'Class II Div 1', 'Deep Bite'],
      treatmentPlan: ['4s Extraction', 'Expansion', 'IPR', 'Class II Correction'],
      timeline: [
        { id: 't1', date: '2024-04-12', actions: ['Upper bonded U5-U5', 'Archwire 0.014 NiTi placed'], notes: 'Patient compliant.', snapshotId: 'snap-1' }
      ],
      recordSets: [
        { 
          id: 'rs-1', 
          name: 'Pre-record', 
          date: '2024-01-15', 
          records: [], 
          chiefComplaint: 'Patient complains of upper crowding and deep bite. Skeletal Class I, Dental Class II Div 1.',
          audioUrl: null,
          stlFiles: [] 
        },
        { 
          id: 'rs-2', 
          name: 'Mid-record', 
          date: '2024-03-10', 
          records: [], 
          chiefComplaint: 'Alignment phase progressing. Crowding reduced. Leveling of the curve of Spee in progress.',
          audioUrl: null,
          stlFiles: [] 
        }
      ]
    }
  ]);

  const [appointments] = useState<Appointment[]>([
    { id: 'app-1', patientId, caseId: 'case-1', date: '2024-04-10', time: '10:30 AM', type: 'Adjustment', doctor: 'Dr. Shady', status: 'completed', snapshotId: 'snap-1' },
    { id: 'app-2', patientId, caseId: 'case-1', date: '2024-04-24', time: '11:00 AM', type: 'Wire Change', doctor: 'Dr. Shady', status: 'scheduled' }
  ]);

  const [labOrders] = useState<LabOrder[]>([
    { id: 'lab-1', caseId: 'case-1', type: 'Aligners', labName: 'OrthoLab Cairo', dateSent: '2024-04-01', expectedDelivery: '2024-04-15', status: 'In Production' }
  ]);

  const handleOpenSnapshotEditor = (appointmentId: string) => {
    const appt = appointments.find(a => a.id === appointmentId);
    if (appt) {
      setSelectedAppointment(appt);
      setIsSnapshotEditorOpen(true);
    }
  };

  const handleSaveSnapshot = (snapshot: Snapshot) => {
    console.log('Snapshot saved:', snapshot);
    // In a real app, we would update the state/backend here
  };

  if (isSnapshotEditorOpen && selectedAppointment) {
    return (
      <SnapshotEditor 
        appointment={selectedAppointment} 
        onBack={() => setIsSnapshotEditorOpen(false)}
        onSave={handleSaveSnapshot}
      />
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OrthoOverviewTab caseData={cases[0]} onOpenSnapshotEditor={() => handleOpenSnapshotEditor('app-1')} />;
      case 'timeline':
        return <OrthoTimelineTab appointments={appointments} onOpenSnapshotEditor={handleOpenSnapshotEditor} />;
      case 'cases':
        return <OrthoCasesTab patientId={patientId} cases={cases} onOpenSnapshotEditor={handleOpenSnapshotEditor} />;
      case 'lab':
        return <OrthoLabTab labOrders={labOrders} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Orthodontic Sub Navigation */}
      <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 w-fit shadow-sm">
        <button 
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Smile className="w-4 h-4" />
          Overview
        </button>
        <button 
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'timeline' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Calendar className="w-4 h-4" />
          Timeline & Appointments
        </button>
        <button 
          onClick={() => setActiveTab('cases')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'cases' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <LayoutGrid className="w-4 h-4" />
          Cases
        </button>
        <button 
          onClick={() => setActiveTab('lab')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'lab' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Activity className="w-4 h-4" />
          Lab
        </button>
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PatientOrthodonticModule;
