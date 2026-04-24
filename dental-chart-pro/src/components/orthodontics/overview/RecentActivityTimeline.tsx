import React from 'react';
import { Clock } from 'lucide-react';

interface TimelineItemProps {
  date: string;
  title: string;
  description: string;
  active?: boolean;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ date, title, description, active = false }) => (
  <div className="relative pl-8">
    <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 bg-white z-10 flex items-center justify-center ${active ? 'border-blue-500' : 'border-slate-200'}`}>
      {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
    </div>
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">{date}</span>
    <h4 className="text-xs font-bold text-slate-800">{title}</h4>
    <p className="text-[11px] text-slate-500 mt-1 italic font-medium">"{description}"</p>
  </div>
);

const RecentActivityTimeline: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">Recent Activity Timeline</h3>
        </div>
        <button className="text-[9px] font-bold text-blue-600 hover:underline uppercase tracking-widest">View Full History</button>
      </div>
      
      <div className="p-5">
        <div className="relative space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
          <TimelineItem 
            date="Oct 10, 2023"
            title="Archwire 16×22 NiTi placed"
            description="Patient reports mild discomfort on upper left."
            active
          />
          <TimelineItem 
            date="Sep 12, 2023"
            title="Bonding Lower Arch"
            description="Full lower bonding completed. 0.014 NiTi engaged."
          />
          <TimelineItem 
            date="Aug 15, 2023"
            title="Initial Consultation"
            description="Treatment plan approved. Records taken."
          />
        </div>
      </div>
    </div>
  );
};

export default RecentActivityTimeline;
