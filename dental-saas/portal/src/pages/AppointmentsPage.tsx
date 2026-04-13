/**
 * AppointmentsPage.tsx
 * Patient Portal — Appointments List (upcoming + past) with skeletons + empty states
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Calendar,
  History,
  Clock,
  AlertTriangle,
  CalendarPlus,
} from 'lucide-react';
import { dashboardApi } from '@/api/dashboard.api';
import { AppointmentsSkeleton } from '@/components/skeletons/Skeleton';
import EmptyState from '@/components/EmptyState';
import type { Appointment } from '@/types/portal.types';

const StatusBadge: React.FC<{ status: Appointment['status'] }> = ({ status }) => {
  const styles: Record<string, string> = {
    scheduled: 'text-blue-600 bg-blue-50 border-blue-100',
    confirmed: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    completed: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    cancelled: 'text-rose-600 bg-rose-50 border-rose-100',
    'no-show': 'text-slate-600 bg-slate-50 border-slate-200',
  };
  return (
    <span
      className={`text-[9px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wider whitespace-nowrap ${
        styles[status] || styles.scheduled
      }`}
    >
      {status}
    </span>
  );
};

const AppointmentCard: React.FC<{ appointment: Appointment; index: number }> = ({
  appointment,
  index,
}) => {
  const date = new Date(appointment.date);
  const isPast = appointment.status === 'completed' || appointment.status === 'cancelled';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="p-4 md:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <div
          className={`w-11 h-11 md:w-12 md:h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 ${
            isPast ? 'bg-slate-50 text-slate-400' : 'bg-blue-50 text-blue-600'
          }`}
        >
          <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none mb-0.5">
            {date.toLocaleString('en-US', { month: 'short' })}
          </span>
          <span className="text-base md:text-lg font-black leading-none">{date.getDate()}</span>
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">
            {appointment.type}
          </h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
            {appointment.startTime}
            {appointment.doctor &&
              ` · Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`}
          </p>
        </div>
      </div>
      <StatusBadge status={appointment.status} />
    </motion.div>
  );
};

const AppointmentsPage: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'appointments'],
    queryFn: () => dashboardApi.getAppointments(),
    staleTime: 60_000,
  });

  if (isLoading) return <AppointmentsSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">
          Failed to Load
        </h3>
        <p className="text-xs font-medium text-slate-500">Could not fetch appointments.</p>
      </div>
    );
  }

  const appointments = (data?.data || []) as Appointment[];
  const upcoming = appointments.filter(
    (a) => a.status === 'scheduled' || a.status === 'confirmed'
  );
  const past = appointments.filter(
    (a) => a.status === 'completed' || a.status === 'cancelled'
  );

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mb-1">
          Appointments
        </h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Your scheduled and past visits
        </p>
      </motion.div>

      {/* Upcoming */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            Upcoming ({upcoming.length})
          </h3>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title="No Upcoming Appointments"
            description="You don't have any scheduled appointments. Contact the clinic to book your next visit."
            iconColor="text-blue-400"
            iconBg="bg-blue-50"
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.map((appt, i) => (
              <AppointmentCard key={appt._id} appointment={appt} index={i} />
            ))}
          </div>
        )}
      </motion.div>

      {/* Past */}
      {past.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              Past Visits ({past.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {past.map((appt, i) => (
              <AppointmentCard key={appt._id} appointment={appt} index={i} />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default AppointmentsPage;
