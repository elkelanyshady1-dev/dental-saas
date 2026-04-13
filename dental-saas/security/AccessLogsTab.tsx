import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Info,
  Clock,
  User,
  Shield,
  Database
} from 'lucide-react';

interface AccessLog {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  permission: string;
  resource: string;
  result: 'allowed' | 'denied';
  reason: string;
}

const mockLogs: AccessLog[] = [
  { id: '1', timestamp: '2026-03-22 01:45:12', user: 'Dr. Sarah Smith', role: 'Doctor', permission: 'patient:read', resource: 'Patient:123', result: 'allowed', reason: 'OWNER_MATCH' },
  { id: '2', timestamp: '2026-03-22 01:44:05', user: 'John Doe', role: 'Assistant', permission: 'invoice:delete', resource: 'Invoice:456', result: 'denied', reason: 'INSUFFICIENT_ROLE' },
  { id: '3', timestamp: '2026-03-22 01:42:30', user: 'Emily Brown', role: 'Receptionist', permission: 'patient:read', resource: 'Patient:789', result: 'allowed', reason: 'BRANCH_MATCH' },
  { id: '4', timestamp: '2026-03-22 01:40:15', user: 'Dr. Sarah Smith', role: 'Doctor', permission: 'ortho:write', resource: 'OrthoCase:101', result: 'allowed', reason: 'ROLE_MATCH' },
  { id: '5', timestamp: '2026-03-22 01:38:55', user: 'John Doe', role: 'Assistant', permission: 'patient:read', resource: 'Patient:202', result: 'denied', reason: 'BRANCH_MISMATCH' },
  { id: '6', timestamp: '2026-03-22 01:35:20', user: 'Emily Brown', role: 'Receptionist', permission: 'invoice:read', resource: 'Invoice:303', result: 'allowed', reason: 'ROLE_MATCH' },
  { id: '7', timestamp: '2026-03-22 01:32:10', user: 'Dr. Sarah Smith', role: 'Doctor', permission: 'admin:write', resource: 'Settings:Global', result: 'denied', reason: 'INSUFFICIENT_ROLE' },
  { id: '8', timestamp: '2026-03-22 01:30:05', user: 'System Admin', role: 'Admin', permission: 'security:read', resource: 'AuditLogs', result: 'allowed', reason: 'SUPER_ADMIN' },
];

const AccessLogsTab: React.FC = () => {
  const [filterResult, setFilterResult] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = mockLogs.filter(log => {
    const matchesResult = filterResult === 'All' || log.result === filterResult.toLowerCase();
    const matchesSearch = log.user.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.permission.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.resource.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesResult && matchesSearch;
  });

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Filters & Actions */}
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Result:</span>
            <select 
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
            >
              <option>All</option>
              <option>Allowed</option>
              <option>Denied</option>
            </select>
          </div>
          <button className="flex items-center gap-2 bg-slate-50 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-200">
            <Calendar className="w-4 h-4" />
            Last 24 Hours
          </button>
        </div>
        <button className="flex items-center gap-2 bg-white text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all border border-slate-200 shadow-sm">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Logs Table */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Permission</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Resource</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Result</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      {log.timestamp.split(' ')[1]}
                      <span className="text-[10px] text-slate-300 font-bold ml-1">{log.timestamp.split(' ')[0]}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{log.user}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{log.role}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-indigo-400" />
                      <code className="text-[10px] font-bold text-slate-600 tracking-wider">{log.permission}</code>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-bold text-slate-600">{log.resource}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      log.result === 'allowed' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {log.result === 'allowed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {log.result}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        {log.reason}
                      </code>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Showing 1-8 of 1,240 logs</span>
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {[1, 2, 3, '...', 155].map((page, i) => (
                <button 
                  key={i}
                  className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all ${
                    page === 1 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600 hover:bg-white'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessLogsTab;
