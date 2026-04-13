/**
 * MedicalHistoryPage.tsx
 * Patient Portal — Medical History with skeletons + empty states
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Stethoscope,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Pill,
  Heart,
  Shield,
} from 'lucide-react';
import { dashboardApi } from '@/api/dashboard.api';
import { MedicalSkeleton } from '@/components/skeletons/Skeleton';

const MedicalHistoryPage: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'medical-history'],
    queryFn: () => dashboardApi.getMedicalHistory(),
    staleTime: 120_000,
  });

  if (isLoading) return <MedicalSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Failed to Load</h3>
        <p className="text-xs font-medium text-slate-500">Could not fetch medical history.</p>
      </div>
    );
  }

  const clinical = data?.data as Record<string, any> | undefined;
  const allergies = (clinical?.allergies || []) as string[];
  const medications = (clinical?.medications || []) as string[];
  const conditions = (clinical?.conditions || []) as string[];

  const sections = [
    {
      key: 'allergies',
      title: 'Allergies',
      icon: AlertCircle,
      items: allergies,
      headerBg: 'bg-rose-50/30',
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      itemBg: 'bg-rose-50',
      itemBorder: 'border-rose-100',
      itemText: 'text-rose-700',
      itemIcon: 'text-rose-500',
      emptyMsg: 'No known allergies',
    },
    {
      key: 'medications',
      title: 'Medications',
      icon: Pill,
      items: medications,
      headerBg: 'bg-blue-50/30',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      itemBg: 'bg-blue-50',
      itemBorder: 'border-blue-100',
      itemText: 'text-blue-700',
      itemIcon: 'text-blue-500',
      emptyMsg: 'No current medications',
    },
    {
      key: 'conditions',
      title: 'Conditions',
      icon: Heart,
      items: conditions,
      headerBg: 'bg-violet-50/30',
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      itemBg: 'bg-violet-50',
      itemBorder: 'border-violet-100',
      itemText: 'text-violet-700',
      itemIcon: 'text-violet-500',
      emptyMsg: 'No known conditions',
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mb-1">Medical History</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Your health records and medical information
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {sections.map((section, si) => {
          const SectionIcon = section.icon;
          return (
            <motion.div
              key={section.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: si * 0.05 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className={`p-4 md:p-5 border-b border-slate-100 ${section.headerBg} flex items-center gap-3`}>
                <div className={`w-9 h-9 ${section.iconBg} rounded-xl flex items-center justify-center ${section.iconColor}`}>
                  <SectionIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{section.title}</h3>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                    {section.items.length} recorded
                  </span>
                </div>
              </div>
              <div className="p-4 md:p-5">
                {section.items.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <p className="text-xs font-medium text-slate-500">{section.emptyMsg}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {section.items.map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: si * 0.05 + i * 0.03 }}
                        className={`flex items-center gap-2 px-3 py-2.5 ${section.itemBg} rounded-xl border ${section.itemBorder}`}
                      >
                        <SectionIcon className={`w-3 h-3 ${section.itemIcon} shrink-0`} />
                        <span className={`text-xs font-semibold ${section.itemText}`}>{item}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Security Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-900 rounded-2xl p-6 md:p-8 text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl -mr-24 -mt-24" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-blue-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest">Secure Medical Record</h3>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                HIPAA Compliant
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium max-w-md leading-relaxed">
            Your complete medical history is encrypted and securely stored. Only your authorized healthcare providers can access it. Contact the clinic for a printed copy.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default MedicalHistoryPage;
