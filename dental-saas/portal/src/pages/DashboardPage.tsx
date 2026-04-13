/**
 * DashboardPage.tsx
 * Patient Portal — Dashboard with summary cards, quick actions, and messaging preview
 *
 * Uses React Query for data fetching with skeleton loading states.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  DollarSign,
  Smile,
  Bell,
  Clock,
  AlertTriangle,
  MessageSquare,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { dashboardApi } from '@/api/dashboard.api';
import { DashboardSkeleton } from '@/components/skeletons/Skeleton';

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: 'easeOut' },
  }),
};

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => dashboardApi.getDashboard(),
    staleTime: 60_000,
    retry: 2,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">
          Failed to Load Dashboard
        </h3>
        <p className="text-xs font-medium text-slate-500 mb-6">
          Please check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-blue-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const dashboard = data?.data;
  const profile = dashboard?.profile;
  const nextAppt = dashboard?.nextAppointment;
  const financial = dashboard?.financial;

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mb-1">
          Welcome back{profile ? `, ${profile.firstName}` : ''}
        </h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Here's your health summary
        </p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Next Visit */}
        <motion.div
          custom={0}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm cursor-pointer transition-shadow"
          onClick={() => navigate('/appointments')}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                Next Visit
              </h3>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </div>
          {nextAppt ? (
            <>
              <p className="text-lg font-black text-slate-900">
                {new Date(nextAppt.date).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                {nextAppt.startTime} · {nextAppt.type}
              </p>
              {nextAppt.doctor && (
                <p className="text-[9px] font-bold text-blue-500 mt-1">
                  Dr. {nextAppt.doctor.firstName} {nextAppt.doctor.lastName}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-slate-400 mt-1">No upcoming appointments</p>
          )}
        </motion.div>

        {/* Balance Due */}
        <motion.div
          custom={1}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm cursor-pointer transition-shadow"
          onClick={() => navigate('/financial')}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                Balance Due
              </h3>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </div>
          <p className={`text-lg font-black ${(financial?.balance ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            ${(financial?.balance ?? 0).toFixed(2)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Paid: ${(financial?.totalPaid ?? 0).toFixed(2)}
            </p>
          </div>
        </motion.div>

        {/* Treatment Progress */}
        <motion.div
          custom={2}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ y: -3, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
          className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200 shadow-sm cursor-pointer transition-shadow"
          onClick={() => navigate('/ortho')}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                <Smile className="w-5 h-5" />
              </div>
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">
                Treatment
              </h3>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
          </div>
          <p className="text-lg font-black text-slate-900">Active</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
            View aligner progress →
          </p>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600" />
            Quick Actions
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
          {[
            { label: 'Appointments', icon: Calendar, path: '/appointments', color: 'text-blue-600 bg-blue-50' },
            { label: 'Invoices', icon: DollarSign, path: '/financial', color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Messages', icon: MessageSquare, path: '/medical', color: 'text-violet-600 bg-violet-50' },
            { label: 'Ortho', icon: Smile, path: '/ortho', color: 'text-amber-600 bg-amber-50' },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="p-4 md:p-6 hover:bg-slate-50 transition-colors flex flex-col items-center gap-3 group"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${action.color} group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardPage;
