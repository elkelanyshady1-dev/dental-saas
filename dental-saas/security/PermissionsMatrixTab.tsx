import React, { useState } from 'react';
import { 
  Filter, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ArrowRight,
  Info,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PermissionRow {
  id: string;
  route: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  expected: string;
  actual: string;
  status: 'correct' | 'mismatch' | 'missing';
  module: string;
}

const mockData: PermissionRow[] = [
  { id: '1', route: '/api/patients', method: 'GET', expected: 'patient:read', actual: 'patient:read', status: 'correct', module: 'Patients' },
  { id: '2', route: '/api/patients', method: 'POST', expected: 'patient:write', actual: 'patient:write', status: 'correct', module: 'Patients' },
  { id: '3', route: '/api/invoices', method: 'DELETE', expected: 'invoice:delete', actual: 'invoice:read', status: 'mismatch', module: 'Finance' },
  { id: '4', route: '/api/ortho/scans', method: 'GET', expected: 'ortho:read', actual: 'None', status: 'missing', module: 'Orthodontics' },
  { id: '5', route: '/api/appointments', method: 'PUT', expected: 'appt:write', actual: 'appt:write', status: 'correct', module: 'Appointments' },
  { id: '6', route: '/api/settings', method: 'PATCH', expected: 'admin:write', actual: 'admin:write', status: 'correct', module: 'Settings' },
  { id: '7', route: '/api/finance/reports', method: 'GET', expected: 'finance:read', actual: 'finance:read', status: 'correct', module: 'Finance' },
  { id: '8', route: '/api/users/roles', method: 'POST', expected: 'role:write', actual: 'None', status: 'missing', module: 'Security' },
];

const PermissionsMatrixTab: React.FC = () => {
  const [selectedRow, setSelectedRow] = useState<PermissionRow | null>(null);
  const [filter, setFilter] = useState('All');

  const filteredData = filter === 'All' ? mockData : mockData.filter(item => item.module === filter);

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Filters & Actions */}
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search routes..." 
              className="bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Module:</span>
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
            >
              <option>All</option>
              <option>Patients</option>
              <option>Finance</option>
              <option>Orthodontics</option>
              <option>Appointments</option>
              <option>Security</option>
            </select>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
          <Filter className="w-4 h-4" />
          Advanced Filters
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Route</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Method</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Expected Permission</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actual Permission</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((row) => (
                <tr 
                  key={row.id} 
                  onClick={() => setSelectedRow(row)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700">{row.route}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{row.module}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <MethodBadge method={row.method} />
                  </td>
                  <td className="px-6 py-4">
                    <code className="bg-slate-100 px-2 py-1 rounded text-[10px] font-bold text-slate-600 tracking-wider">{row.expected}</code>
                  </td>
                  <td className="px-6 py-4">
                    <code className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${
                      row.status === 'correct' ? 'bg-emerald-50 text-emerald-600' : 
                      row.status === 'mismatch' ? 'bg-rose-50 text-rose-600' : 
                      'bg-amber-50 text-amber-600'
                    }`}>{row.actual}</code>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-all group-hover:translate-x-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Drawer */}
      <AnimatePresence>
        {selectedRow && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRow(null)}
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-[400px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Permission Details</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Route Audit & Debug</p>
                </div>
                <button 
                  onClick={() => setSelectedRow(null)}
                  className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoint Info</h4>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Route</span>
                      <span className="text-xs font-bold text-slate-800">{selectedRow.route}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Method</span>
                      <MethodBadge method={selectedRow.method} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Module</span>
                      <span className="text-xs font-bold text-indigo-600">{selectedRow.module}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Permission Sync</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Expected</span>
                      <code className="text-xs font-bold text-slate-700">{selectedRow.expected}</code>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                    <div className={`flex-1 rounded-2xl p-4 border text-center ${
                      selectedRow.status === 'correct' ? 'bg-emerald-50 border-emerald-100' : 
                      selectedRow.status === 'mismatch' ? 'bg-rose-50 border-rose-100' : 
                      'bg-amber-50 border-amber-100'
                    }`}>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Actual</span>
                      <code className={`text-xs font-bold ${
                        selectedRow.status === 'correct' ? 'text-emerald-600' : 
                        selectedRow.status === 'mismatch' ? 'text-rose-600' : 
                        'text-amber-600'
                      }`}>{selectedRow.actual}</code>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diagnostic Info</h4>
                  <div className={`p-4 rounded-2xl border flex gap-3 ${
                    selectedRow.status === 'correct' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 
                    selectedRow.status === 'mismatch' ? 'bg-rose-50 border-rose-100 text-rose-700' : 
                    'bg-amber-50 border-amber-100 text-amber-700'
                  }`}>
                    <Info className="w-5 h-5 shrink-0" />
                    <p className="text-[11px] font-bold leading-relaxed">
                      {selectedRow.status === 'correct' && "This route is correctly configured. The expected permission matches the actual permission found in the middleware."}
                      {selectedRow.status === 'mismatch' && "CRITICAL: The actual permission found does not match the expected security policy. This may lead to unauthorized access or broken functionality."}
                      {selectedRow.status === 'missing' && "WARNING: No permission was found for this route. It may be currently unprotected or using a default policy that needs verification."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                  Update Policy
                </button>
                <button className="flex-1 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
                  Run Debug
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const MethodBadge: React.FC<{ method: string }> = ({ method }) => {
  const styles: Record<string, string> = {
    GET: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    POST: 'bg-blue-50 text-blue-600 border-blue-100',
    PUT: 'bg-amber-50 text-amber-600 border-amber-100',
    DELETE: 'bg-rose-50 text-rose-600 border-rose-100',
    PATCH: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  };

  return (
    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${styles[method]}`}>
      {method}
    </span>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    correct: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Correct' },
    mismatch: { bg: 'bg-rose-50', text: 'text-rose-600', icon: <XCircle className="w-3 h-3" />, label: 'Mismatch' },
    missing: { bg: 'bg-amber-50', text: 'text-amber-600', icon: <AlertTriangle className="w-3 h-3" />, label: 'Missing' },
  };

  const style = styles[status as keyof typeof styles];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${style.bg} ${style.text}`}>
      {style.icon}
      {style.label}
    </div>
  );
};

export default PermissionsMatrixTab;
