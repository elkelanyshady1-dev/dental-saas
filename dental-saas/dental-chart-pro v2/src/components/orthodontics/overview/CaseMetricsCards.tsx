import React from 'react';
import { Activity, Calendar, CreditCard, TrendingUp } from 'lucide-react';

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, subValue, color }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
      {icon}
    </div>
    <div className="min-w-0">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">{label}</span>
      <span className="text-[13px] font-bold text-slate-800 truncate block leading-tight">{value}</span>
      {subValue && <span className="text-[10px] font-medium text-slate-500 block leading-tight">{subValue}</span>}
    </div>
  </div>
);

const CaseMetricsCards: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard 
        icon={<Activity className="w-5 h-5 text-blue-600" />} 
        label="Active Case" 
        value="Fixed Appliance" 
        subValue="Upper + Lower"
        color="bg-blue-50"
      />
      <MetricCard 
        icon={<Calendar className="w-5 h-5 text-emerald-600" />} 
        label="Next Appointment" 
        value="Oct 24" 
        subValue="10:15 AM"
        color="bg-emerald-50"
      />
      <MetricCard 
        icon={<CreditCard className="w-5 h-5 text-amber-600" />} 
        label="Financial Balance" 
        value="$350 remaining" 
        color="bg-amber-50"
      />
      <MetricCard 
        icon={<TrendingUp className="w-5 h-5 text-purple-600" />} 
        label="Progress" 
        value="Stage: Alignment" 
        color="bg-purple-50"
      />
    </div>
  );
};

export default CaseMetricsCards;
