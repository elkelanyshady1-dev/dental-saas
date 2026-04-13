import React from 'react';
import { History, Calendar, ChevronRight, Eye } from 'lucide-react';
import { Snapshot } from '../../../types';

interface SnapshotHistorySidebarProps {
  snapshots: Snapshot[];
  onRestoreSnapshot: (snapshot: Snapshot) => void;
}

const SnapshotHistorySidebar: React.FC<SnapshotHistorySidebarProps> = ({ snapshots, onRestoreSnapshot }) => {
  return (
    <div className="w-72 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          Snapshot History
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {snapshots.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
              <History className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-slate-400">No snapshots saved for this case yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snap) => (
              <div 
                key={snap.id} 
                onClick={() => onRestoreSnapshot(snap)}
                className="group bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="h-24 bg-slate-100 relative overflow-hidden">
                  <img src={snap.thumbnail || "https://picsum.photos/seed/ortho-thumb/200/100"} alt="Thumbnail" className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-white/90 p-2 rounded-full text-blue-600 shadow-lg">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                        {new Date(snap.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="text-xs font-bold text-slate-700 mt-0.5">Adjustment Visit</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SnapshotHistorySidebar;
