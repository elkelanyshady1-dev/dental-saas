/**
 * RemindersPage.tsx
 * Patient Portal — Reminders with React Query + local mock API
 *
 * Uses reminders.api.ts (localStorage-backed) until backend implements reminders.
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Bell,
  Smile,
  Clock,
  Activity,
  Pill,
  Calendar,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { remindersApi } from '@/api/reminders.api';
import type { Reminder } from '@/types/portal.types';

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string }> = {
  ELASTICS: { icon: <Smile className="w-5 h-5" />, bg: 'bg-purple-50', text: 'text-purple-600' },
  HYGIENE: { icon: <Activity className="w-5 h-5" />, bg: 'bg-amber-50', text: 'text-amber-600' },
  APPOINTMENT: { icon: <Calendar className="w-5 h-5" />, bg: 'bg-blue-50', text: 'text-blue-600' },
  MEDICATION: { icon: <Pill className="w-5 h-5" />, bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

const RemindersPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['portal', 'reminders'],
    queryFn: () => remindersApi.getReminders(),
    staleTime: 0, // Always fresh for local state
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => remindersApi.toggleReminder(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['portal', 'reminders'] });
      const previous = queryClient.getQueryData(['portal', 'reminders']);
      queryClient.setQueryData(['portal', 'reminders'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((r: Reminder) =>
            r.id === id ? { ...r, isRead: !r.isRead } : r
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['portal', 'reminders'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['portal', 'reminders'] }),
  });

  const reminders = (data?.data || []) as Reminder[];
  const activeReminders = reminders.filter((r) => !r.isRead);
  const completedReminders = reminders.filter((r) => r.isRead);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mb-1">Reminders</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
            {activeReminders.length} active · {completedReminders.length} done today
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
            <Bell className="w-5 h-5" />
          </div>
        </div>
      </motion.div>

      {/* Progress Ring */}
      {reminders.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-5 md:p-6 text-white relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="relative z-10 flex items-center gap-6">
            <div className="relative w-20 h-20 shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="white"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`}
                  strokeDashoffset={`${2 * Math.PI * 34 * (1 - completedReminders.length / reminders.length)}`}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-black">
                  {completedReminders.length}/{reminders.length}
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest mb-1">Today's Progress</h3>
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">
                {activeReminders.length === 0
                  ? 'All done! Great job! 🎉'
                  : `${activeReminders.length} task${activeReminders.length > 1 ? 's' : ''} remaining`}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Reminders */}
      {activeReminders.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            To Do ({activeReminders.length})
          </h3>
          <div className="space-y-3">
            {activeReminders.map((reminder, i) => {
              const config = TYPE_CONFIG[reminder.type] || TYPE_CONFIG.HYGIENE;
              return (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.bg} ${config.text}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">
                          {reminder.title}
                        </h4>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ml-2 ${
                          reminder.priority === 'high' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          {reminder.priority}
                        </span>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 leading-relaxed mb-3">
                        {reminder.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-400">
                          <Clock className="w-3 h-3" />
                          <span className="text-[9px] font-bold uppercase tracking-widest">{reminder.time}</span>
                        </div>
                        <button
                          onClick={() => toggleMutation.mutate(reminder.id)}
                          disabled={toggleMutation.isPending}
                          className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedReminders.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Completed ({completedReminders.length})
          </h3>
          <div className="space-y-2">
            {completedReminders.map((reminder, i) => {
              const config = TYPE_CONFIG[reminder.type] || TYPE_CONFIG.HYGIENE;
              return (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white rounded-2xl p-4 border border-slate-100 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 text-slate-400`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider line-through truncate">
                        {reminder.title}
                      </h4>
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate(reminder.id)}
                      className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Undo
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notification Settings */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-900 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl -mr-24 -mt-24" />
        <div className="relative z-10">
          <h3 className="text-sm font-black uppercase tracking-widest mb-2">Notification Settings</h3>
          <p className="text-xs text-slate-400 font-medium mb-6 max-w-md">
            Choose how you want to be reminded about your treatment.
          </p>
          <div className="space-y-3 max-w-sm">
            {[
              { label: 'Push Notifications', active: true },
              { label: 'Email Reminders', active: true },
              { label: 'SMS Alerts', active: false },
            ].map((setting, idx) => (
              <div key={idx} className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-widest">{setting.label}</span>
                <div className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${setting.active ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${setting.active ? 'right-1' : 'left-1'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RemindersPage;
