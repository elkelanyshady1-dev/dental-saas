import React from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Activity, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend
} from 'recharts';

const data = [
  { name: 'Mon', allowed: 400, denied: 24 },
  { name: 'Tue', allowed: 300, denied: 13 },
  { name: 'Wed', allowed: 200, denied: 98 },
  { name: 'Thu', allowed: 278, denied: 39 },
  { name: 'Fri', allowed: 189, denied: 48 },
  { name: 'Sat', allowed: 239, denied: 38 },
  { name: 'Sun', allowed: 349, denied: 43 },
];

const OverviewTab: React.FC = () => {
  return (
    <div className="space-y-8 h-full">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Policy Coverage" 
          value="94.2%" 
          change="+2.4%" 
          icon={<ShieldCheck className="w-5 h-5" />} 
          color="indigo" 
        />
        <KPICard 
          title="Matrix Coverage" 
          value="88.5%" 
          change="+5.1%" 
          icon={<Lock className="w-5 h-5" />} 
          color="emerald" 
        />
        <KPICard 
          title="Total Permissions" 
          value="156" 
          change="+12" 
          icon={<Activity className="w-5 h-5" />} 
          color="blue" 
        />
        <KPICard 
          title="Active Policies" 
          value="42" 
          change="0" 
          icon={<ShieldAlert className="w-5 h-5" />} 
          color="amber" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Access Requests</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Allowed vs Denied (Last 7 Days)</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-lg text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div>
                Allowed
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 rounded-lg text-rose-600 text-[10px] font-black uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-600"></div>
                Denied
              </div>
            </div>
          </div>
          <div className="flex-1 p-6 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94A3B8' }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94A3B8' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: '1px solid #E2E8F0', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                />
                <Bar dataKey="allowed" fill="#4F46E5" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="denied" fill="#E11D48" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Security Alerts</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pending Actions Required</p>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            <AlertItem 
              type="danger" 
              title="Missing Policy" 
              description="Route /api/ortho/scans has no defined access policy."
              time="12m ago"
            />
            <AlertItem 
              type="warning" 
              title="Permission Mismatch" 
              description="Doctor role has 'delete' access on Patient records in Matrix but denied in Policy."
              time="45m ago"
            />
            <AlertItem 
              type="info" 
              title="Policy Update" 
              description="Global 'Branch_Match' policy was updated by Admin."
              time="2h ago"
            />
            <AlertItem 
              type="success" 
              title="Audit Complete" 
              description="Quarterly security audit finished with 0 critical vulnerabilities."
              time="1d ago"
            />
          </div>
          <button className="p-4 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 transition-all border-t border-slate-100 flex items-center justify-center gap-2">
            View All Alerts
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

const KPICard: React.FC<{ title: string, value: string, change: string, icon: React.ReactNode, color: string }> = ({ title, value, change, icon, color }) => {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-transform group-hover:scale-110 duration-500 ${colors[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${change.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
          <TrendingUp className="w-3 h-3" />
          {change}
        </div>
      </div>
      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</h4>
      <span className="text-2xl font-black text-slate-800 tracking-tight">{value}</span>
    </div>
  );
};

const AlertItem: React.FC<{ type: 'danger' | 'warning' | 'info' | 'success', title: string, description: string, time: string }> = ({ type, title, description, time }) => {
  const styles = {
    danger: { bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-600', icon: <AlertCircle className="w-4 h-4" /> },
    warning: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-600', icon: <AlertCircle className="w-4 h-4" /> },
    info: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600', icon: <Activity className="w-4 h-4" /> },
    success: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600', icon: <CheckCircle2 className="w-4 h-4" /> },
  };

  const style = styles[type];

  return (
    <div className={`p-4 rounded-2xl border ${style.bg} ${style.border} flex gap-3 group cursor-pointer hover:shadow-sm transition-all`}>
      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-white border ${style.border} ${style.text}`}>
        {style.icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <h4 className={`text-[10px] font-black uppercase tracking-widest ${style.text}`}>{title}</h4>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{time}</span>
        </div>
        <p className="text-[11px] font-bold text-slate-600 leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

export default OverviewTab;
