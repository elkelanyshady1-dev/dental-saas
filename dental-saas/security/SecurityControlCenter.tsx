import React, { useState } from 'react';
import { 
  Shield, 
  LayoutDashboard, 
  Table, 
  FileCode, 
  Lock, 
  Activity, 
  Terminal,
  Search,
  Bell,
  ChevronDown,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import OverviewTab from './OverviewTab';
import PermissionsMatrixTab from './PermissionsMatrixTab';
import PolicyEngineTab from './PolicyEngineTab';
import FieldAccessTab from './FieldAccessTab';
import AccessLogsTab from './AccessLogsTab';
import DebugConsoleTab from './DebugConsoleTab';

type TabType = 'overview' | 'matrix' | 'policy' | 'field' | 'logs' | 'debug';

const SecurityControlCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'matrix', label: 'Permissions Matrix', icon: <Table className="w-4 h-4" /> },
    { id: 'policy', label: 'Policy Engine', icon: <FileCode className="w-4 h-4" /> },
    { id: 'field', label: 'Field Access', icon: <Lock className="w-4 h-4" /> },
    { id: 'logs', label: 'Access Logs', icon: <Activity className="w-4 h-4" /> },
    { id: 'debug', label: 'Debug Console', icon: <Terminal className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight">Security Control Center</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Policy & RBAC Management</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search policies, logs..." 
              className="bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="h-8 w-px bg-slate-200 mx-1"></div>
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold text-xs">
                AD
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="text-xs font-bold text-slate-700">Admin User</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Super Admin</span>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-slate-200 px-8 shrink-0">
        <div className="flex gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 py-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === tab.id 
                  ? 'text-indigo-600' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'matrix' && <PermissionsMatrixTab />}
            {activeTab === 'policy' && <PolicyEngineTab />}
            {activeTab === 'field' && <FieldAccessTab />}
            {activeTab === 'logs' && <AccessLogsTab />}
            {activeTab === 'debug' && <DebugConsoleTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Info */}
      <footer className="h-10 bg-white border-t border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Info className="w-3 h-3" />
          System Status: <span className="text-emerald-500">All Security Policies Active</span>
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Last Policy Update: 2 mins ago
        </div>
      </footer>
    </div>
  );
};

export default SecurityControlCenter;
