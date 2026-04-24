import React from 'react';
import { Calendar, Clock, User, CheckCircle2, Eye, Edit3, UserCheck, MessageSquare } from 'lucide-react';
import { Appointment } from '../../../types';

interface OrthoTimelineTabProps {
  appointments: Appointment[];
  onOpenSnapshotEditor: (appointmentId: string) => void;
}

const OrthoTimelineTab: React.FC<OrthoTimelineTabProps> = ({ appointments, onOpenSnapshotEditor }) => {
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* LEFT PANEL: Timeline Feed */}
      <div className="col-span-12 lg:col-span-7 space-y-6">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-2">Timeline Feed</h3>
        <div className="relative pl-8 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {appointments.filter(a => a.status === 'completed').map((app) => (
            <div key={app.id} className="relative">
              <div className="absolute -left-[29px] top-1 w-5 h-5 rounded-full bg-blue-600 border-4 border-white shadow-sm z-10" />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{app.date}</span>
                      <h4 className="text-sm font-bold text-slate-800 mt-1">{app.type}</h4>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">{app.doctor}</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5" />
                      <p className="text-xs text-slate-600 leading-relaxed">Upper bonded U5-U5. Archwire 0.014 NiTi placed.</p>
                    </div>
                    
                    <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-lg border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3" />
                      Snapshot saved
                    </div>
                  </div>

                  {app.snapshotId && (
                    <div className="mt-4 flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100 group cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => onOpenSnapshotEditor(app.id)}>
                      <div className="w-20 h-14 bg-slate-200 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
                        <img src="https://picsum.photos/seed/ortho-snap/100/70" alt="Snapshot" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Snapshot Preview</p>
                        <div className="flex items-center gap-1 text-blue-600 text-[10px] font-bold mt-1">
                          <Eye className="w-3 h-3" />
                          View Details
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: Appointments List */}
      <div className="col-span-12 lg:col-span-5 space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Appointments List</h3>
          <button className="text-[10px] font-bold text-blue-600 hover:underline">Schedule New</button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date & Time</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {appointments.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{app.date}</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {app.time}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{app.type}</span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <User className="w-3 h-3" /> {app.doctor}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-bold border ${
                        app.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        app.status === 'scheduled' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {app.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => onOpenSnapshotEditor(app.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                          title="Open Snapshot"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Edit Appointment">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {app.status === 'scheduled' && (
                          <button className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Check In Patient">
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrthoTimelineTab;
