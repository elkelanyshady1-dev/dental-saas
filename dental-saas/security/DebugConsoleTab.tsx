import React, { useState } from 'react';
import { 
  Terminal, 
  Play, 
  RefreshCw, 
  ShieldCheck, 
  ShieldAlert, 
  Code, 
  ChevronRight, 
  Info,
  Database,
  User,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DebugConsoleTab: React.FC = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runSimulation = () => {
    setIsSimulating(true);
    // Simulate API delay
    setTimeout(() => {
      setResult({
        allowed: true,
        reason: "OWNER_MATCH",
        rule: "doctor_ownership_rule",
        timestamp: new Date().toISOString(),
        context: {
          user: { role: 'doctor', id: 'doc_123', branch: 'main' },
          resource: { owner: 'doc_123', branch: 'main', type: 'patient' }
        }
      });
      setIsSimulating(false);
    }, 800);
  };

  return (
    <div className="h-full flex gap-8">
      {/* Left Panel: Simulation Input */}
      <div className="w-[450px] flex flex-col gap-6 shrink-0">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Simulation Input</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configure Test Context</p>
            </div>
            <button 
              onClick={() => setResult(null)}
              className="p-2 hover:bg-slate-200 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {/* User Context */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User className="w-3.5 h-3.5" />
                User Context
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Role</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer">
                    <option>Doctor</option>
                    <option>Assistant</option>
                    <option>Receptionist</option>
                    <option>Admin</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">User ID</label>
                  <input 
                    type="text" 
                    defaultValue="doc_123"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Branch ID</label>
                <input 
                  type="text" 
                  defaultValue="branch_main"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            {/* Request Context */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-3.5 h-3.5" />
                Request Context
              </h4>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Permission Required</label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer">
                  <option>patient:read</option>
                  <option>patient:write</option>
                  <option>invoice:delete</option>
                  <option>ortho:write</option>
                </select>
              </div>
            </div>

            {/* Resource JSON */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                Resource JSON
              </h4>
              <div className="relative group">
                <div className="absolute top-3 right-3 flex gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                  <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                  <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                </div>
                <textarea 
                  className="w-full h-48 bg-slate-900 text-indigo-300 font-mono text-[11px] p-6 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none shadow-inner"
                  defaultValue={JSON.stringify({
                    id: "pat_789",
                    owner: "doc_123",
                    branch: "branch_main",
                    status: "active"
                  }, null, 2)}
                />
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50/50">
            <button 
              onClick={runSimulation}
              disabled={isSimulating}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSimulating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              Run Simulation
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Result Display */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Simulation Result</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Policy Engine Output</p>
            </div>
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">JSON Output</span>
            </div>
          </div>

          <div className="flex-1 p-8 flex flex-col">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex-1 flex flex-col gap-8"
                >
                  <div className={`p-8 rounded-[32px] border flex flex-col items-center text-center gap-4 ${
                    result.allowed ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                  }`}>
                    <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl ${
                      result.allowed ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-rose-500 text-white shadow-rose-100'
                    }`}>
                      {result.allowed ? <ShieldCheck className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
                    </div>
                    <div>
                      <h2 className={`text-2xl font-black tracking-tight ${result.allowed ? 'text-emerald-600' : 'text-rose-600'}`}>
                        Access {result.allowed ? 'Granted' : 'Denied'}
                      </h2>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                        Reason: <span className="text-slate-800">{result.reason}</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Matching Rule</h4>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 border border-slate-200 shadow-sm">
                          <Terminal className="w-5 h-5" />
                        </div>
                        <code className="text-xs font-bold text-slate-700">{result.rule}</code>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Execution Time</h4>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-600 border border-slate-200 shadow-sm">
                          <Clock className="w-5 h-5" />
                        </div>
                        <code className="text-xs font-bold text-slate-700">12ms</code>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-slate-900 rounded-[32px] p-8 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500"></div>
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Raw Response</h4>
                      <button className="text-[9px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors">Copy JSON</button>
                    </div>
                    <pre className="text-indigo-200 font-mono text-[11px] leading-relaxed overflow-y-auto custom-scrollbar h-[200px]">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 flex flex-col items-center justify-center text-center p-12"
                >
                  <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200 mb-6 border border-slate-100">
                    <Terminal className="w-12 h-12" />
                  </div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Ready for Simulation</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-xs">
                    Configure the context on the left and run the simulation to test your security policies.
                  </p>
                  <div className="mt-8 flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                    <Info className="w-4 h-4" />
                    Simulations do not affect live data
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

const Clock: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

export default DebugConsoleTab;
