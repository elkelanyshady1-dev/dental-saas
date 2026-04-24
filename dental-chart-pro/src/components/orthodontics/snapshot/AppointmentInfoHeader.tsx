import React, { useState } from 'react';
import { Calendar, Clock, User, ChevronLeft, ChevronDown, Timer, History } from 'lucide-react';
import { Appointment, Snapshot } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';

interface AppointmentInfoHeaderProps {
  appointment: Appointment;
  onBack: () => void;
  snapshots?: Snapshot[];
  onRestoreSnapshot?: (snapshot: Snapshot) => void;
  onEndAppointment?: () => void;
}

const AppointmentInfoHeader: React.FC<AppointmentInfoHeaderProps> = ({ 
  appointment, 
  onBack,
  snapshots = [],
  onRestoreSnapshot,
  onEndAppointment
}) => {
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [elapsedTime, setElapsedTime] = React.useState('17:56');

  // Simple timer effect
  React.useEffect(() => {
    const interval = setInterval(() => {
      const [mins, secs] = elapsedTime.split(':').map(Number);
      let newSecs = secs + 1;
      let newMins = mins;
      if (newSecs >= 60) {
        newSecs = 0;
        newMins += 1;
      }
      setElapsedTime(`${newMins.toString().padStart(2, '0')}:${newSecs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [elapsedTime]);

  return (
    <header className="h-16 bg-[#1a2332] flex items-center justify-between px-8 z-[60] shadow-lg border-b border-white/5">
      <div className="flex items-center gap-6">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="h-6 w-px bg-white/10" />
        <div className="flex flex-col">
          <h2 className="text-sm font-bold text-white tracking-tight">Snapshot Editor</h2>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{appointment.type}</span>
            <div className="w-1 h-1 rounded-full bg-slate-600" />
            <span className="text-[10px] font-medium text-slate-400">Patient ID: {appointment.patientId}</span>
          </div>
        </div>
      </div>

      {/* Active Appointment & Time Elapsed Selector */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
        <div className="relative">
          <button 
            onClick={() => setShowSnapshots(!showSnapshots)}
            className="flex items-center gap-3 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group"
          >
            <div className="flex flex-col items-start">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Active Appointment</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-200">{appointment.type}</span>
              </div>
            </div>
            <div className="w-px h-6 bg-white/10 mx-1" />
            <div className="flex flex-col items-start">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Time Elapsed</span>
              <div className="flex items-center gap-1.5">
                <Timer className="w-3 h-3 text-blue-400" />
                <span className="text-xs font-mono font-bold text-blue-400">{elapsedTime}</span>
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${showSnapshots ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showSnapshots && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[280px]"
              >
                <div className="p-3 border-b border-white/5 bg-white/5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="w-3 h-3" />
                    Appointment Snapshots
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                  {snapshots.length > 0 ? (
                    snapshots.map((snap) => (
                      <button
                        key={snap.id}
                        onClick={() => {
                          onRestoreSnapshot?.(snap);
                          setShowSnapshots(false);
                        }}
                        className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-all text-left group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden border border-white/10">
                          {snap.thumbnail ? (
                            <img src={snap.thumbnail} alt="Snapshot" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <History className="w-4 h-4 text-slate-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-200">
                            {new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {snap.actions.length} actions logged
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center">
                      <span className="text-xs text-slate-500 italic">No previous snapshots found</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button 
          onClick={onEndAppointment}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition-all shadow-lg flex items-center gap-2"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest">End Appointment</span>
        </button>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Date</span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              {appointment.date}
            </div>
          </div>
          <div className="w-px h-8 bg-white/5" />
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Time</span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              {appointment.time}
            </div>
          </div>
          <div className="w-px h-8 bg-white/5" />
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Doctor</span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <User className="w-3.5 h-3.5 text-blue-400" />
              {appointment.doctor}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppointmentInfoHeader;
