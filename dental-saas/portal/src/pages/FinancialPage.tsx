/**
 * FinancialPage.tsx
 * Patient Portal — Invoices & Payment History with skeletons + empty states
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  FileText,
  CreditCard,
  Download,
  DollarSign,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { dashboardApi } from '@/api/dashboard.api';
import { FinancialSkeleton } from '@/components/skeletons/Skeleton';
import EmptyState from '@/components/EmptyState';

const FinancialPage: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'invoices'],
    queryFn: () => dashboardApi.getInvoices(),
    staleTime: 60_000,
  });

  if (isLoading) return <FinancialSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">
          Failed to Load
        </h3>
        <p className="text-xs font-medium text-slate-500">Could not fetch financial data.</p>
      </div>
    );
  }

  const financial = data?.data as Record<string, any> | undefined;
  const invoices = (financial?.invoices || financial?.data || []) as any[];
  const totalBalance = financial?.balance ?? financial?.totalBalance ?? 0;
  const totalPaid = financial?.totalPaid ?? 0;
  const totalInvoiced = financial?.totalInvoiced ?? 0;

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mb-1">
          Financial
        </h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Invoices and payment history
        </p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Total Paid
            </span>
          </div>
          <p className="text-lg font-black text-emerald-600">${Number(totalPaid).toFixed(2)}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 ${Number(totalBalance) > 0 ? 'bg-amber-100' : 'bg-emerald-100'} rounded-lg flex items-center justify-center ${Number(totalBalance) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              <CreditCard className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Balance
            </span>
          </div>
          <p className={`text-lg font-black ${Number(totalBalance) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            ${Number(totalBalance).toFixed(2)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hidden lg:block"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
              <Receipt className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Invoiced
            </span>
          </div>
          <p className="text-lg font-black text-slate-800">${Number(totalInvoiced).toFixed(2)}</p>
        </motion.div>
      </div>

      {/* Invoices Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Invoices ({invoices.length})
          </h3>
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No Invoices Yet"
            description="Your invoices will appear here after your first appointment."
            iconColor="text-emerald-400"
            iconBg="bg-emerald-50"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 md:px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Invoice
                  </th>
                  <th className="px-4 md:px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Amount
                  </th>
                  <th className="px-4 md:px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">
                    Due Date
                  </th>
                  <th className="px-4 md:px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Status
                  </th>
                  <th className="px-4 md:px-6 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv: any, idx: number) => (
                  <motion.tr
                    key={inv._id || idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.04 }}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 md:px-6 py-4 text-xs font-bold text-slate-700">
                      {inv.invoiceNumber || `INV-${idx + 1}`}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs font-black text-slate-900">
                      ${Number(inv.totalAmount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs font-medium text-slate-500 hidden sm:table-cell">
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <span
                        className={`text-[8px] font-black px-2 py-1 rounded-full border uppercase tracking-wider ${
                          inv.status === 'PAID'
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                            : inv.status === 'OVERDUE'
                              ? 'text-rose-600 bg-rose-50 border-rose-100'
                              : 'text-amber-600 bg-amber-50 border-amber-100'
                        }`}
                      >
                        {inv.status || 'UNPAID'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4">
                      <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                        <Download className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default FinancialPage;
