import React from 'react';
import { AlertTriangle, Calendar, CreditCard, ShieldAlert, ArrowUpRight } from 'lucide-react';

interface Alert {
  type: string;
  message: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

const PatientAlertsCard: React.FC = () => {
  const alerts: Alert[] = [
    { 
      type: 'Allergy', 
      message: 'Latex Allergy', 
      color: 'text-rose-600', 
      bgColor: 'bg-rose-50',
      icon: <ShieldAlert className="w-3.5 h-3.5" />
    },
    { 
      type: 'Attendance', 
      message: 'Missed Last Appointment', 
      color: 'text-amber-600', 
      bgColor: 'bg-amber-50',
      icon: <Calendar className="w-3.5 h-3.5" />
    },
    { 
      type: 'Medical', 
      message: 'Medical Condition', 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-50',
      icon: <AlertTriangle className="w-3.5 h-3.5" />
    },
    { 
      type: 'Financial', 
      message: 'Overdue Payment', 
      color: 'text-purple-600', 
      bgColor: 'bg-purple-50',
      icon: <CreditCard className="w-3.5 h-3.5" />
    }
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patient Alerts</h3>
        <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
      </div>
      
      <div className="flex flex-col gap-2">
        {alerts.map((alert, index) => (
          <div 
            key={index}
            className={`flex items-center gap-2.5 p-2.5 rounded-lg ${alert.bgColor} border border-transparent hover:border-slate-200 transition-all cursor-pointer group`}
          >
            <div className={`${alert.color}`}>
              {alert.icon}
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-[10px] font-bold ${alert.color} block truncate`}>{alert.message}</span>
            </div>
            <ArrowUpRight className={`w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity ${alert.color}`} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PatientAlertsCard;
