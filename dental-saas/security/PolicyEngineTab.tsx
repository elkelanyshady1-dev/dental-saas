import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Settings2, 
  ShieldCheck, 
  ShieldAlert,
  GripVertical,
  ArrowRight,
  Info
} from 'lucide-react';
import { motion, Reorder } from 'motion/react';

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface PolicyRule {
  id: string;
  effect: 'allow' | 'deny';
  priority: number;
  conditions: Condition[];
}

interface Permission {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
}

const mockPermissions: Permission[] = [
  { 
    id: '1', 
    name: 'patient:read', 
    description: 'Allows reading of patient basic information and medical records.',
    rules: [
      { 
        id: 'r1', 
        effect: 'allow', 
        priority: 1, 
        conditions: [
          { id: 'c1', field: 'user.role', operator: '=', value: 'doctor' },
          { id: 'c2', field: 'resource.owner', operator: '=', value: 'true' }
        ] 
      },
      { 
        id: 'r2', 
        effect: 'deny', 
        priority: 2, 
        conditions: [
          { id: 'c3', field: 'user.branch', operator: '!=', value: 'resource.branch' }
        ] 
      }
    ]
  },
  { 
    id: '2', 
    name: 'invoice:delete', 
    description: 'Allows permanent deletion of financial invoices.',
    rules: [
      { 
        id: 'r3', 
        effect: 'allow', 
        priority: 1, 
        conditions: [
          { id: 'c4', field: 'user.role', operator: '=', value: 'admin' }
        ] 
      }
    ]
  },
  { 
    id: '3', 
    name: 'ortho:write', 
    description: 'Allows creating and updating orthodontic cases and scans.',
    rules: []
  }
];

const PolicyEngineTab: React.FC = () => {
  const [selectedPermission, setSelectedPermission] = useState<Permission>(mockPermissions[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPermissions = mockPermissions.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex gap-8">
      {/* Left Panel: Permissions List */}
      <div className="w-80 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Permissions</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Select to Edit Policies</p>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredPermissions.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPermission(p)}
              className={`w-full text-left p-4 rounded-2xl transition-all group flex items-center justify-between ${
                selectedPermission.id === p.id 
                  ? 'bg-indigo-50 border border-indigo-100' 
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              <div>
                <h4 className={`text-xs font-bold ${selectedPermission.id === p.id ? 'text-indigo-600' : 'text-slate-700'}`}>
                  {p.name}
                </h4>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 block">
                  {p.rules.length} Rules Defined
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 transition-all ${
                selectedPermission.id === p.id ? 'text-indigo-500 translate-x-1' : 'text-slate-300 group-hover:text-slate-400'
              }`} />
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel: Policy Editor */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <Settings2 className="w-6 h-6 text-indigo-600" />
              {selectedPermission.name}
            </h2>
            <button className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
              <Plus className="w-4 h-4" />
              Add Policy Rule
            </button>
          </div>
          <p className="text-xs font-bold text-slate-500 leading-relaxed max-w-2xl">
            {selectedPermission.description}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
          {selectedPermission.rules.length > 0 ? (
            selectedPermission.rules.map((rule, index) => (
              <PolicyCard key={rule.id} rule={rule} index={index} />
            ))
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto mb-4 border border-slate-100">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">No Rules Defined</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                This permission is currently using the default <span className="text-rose-500">Deny All</span> policy.
              </p>
              <button className="mt-6 inline-flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-widest hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all">
                <Plus className="w-4 h-4" />
                Create First Rule
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PolicyCard: React.FC<{ rule: PolicyRule, index: number }> = ({ rule, index }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group"
    >
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Effect:</span>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
              rule.effect === 'allow' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              {rule.effect === 'allow' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              {rule.effect}
            </div>
          </div>
          <div className="h-4 w-px bg-slate-200 mx-2"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority:</span>
            <input 
              type="number" 
              defaultValue={rule.priority}
              className="w-12 bg-white border border-slate-200 rounded-lg py-1 px-2 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="p-2 text-slate-300 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          Conditions
          <span className="text-[9px] font-bold text-slate-300">(Matches ALL below)</span>
        </h4>
        
        <div className="space-y-3">
          {rule.conditions.map((condition) => (
            <div key={condition.id} className="flex items-center gap-3 group/cond">
              <div className="flex-1 grid grid-cols-3 gap-3">
                <select className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer">
                  <option>{condition.field}</option>
                  <option>user.role</option>
                  <option>user.id</option>
                  <option>user.branch</option>
                  <option>resource.owner</option>
                  <option>resource.branch</option>
                </select>
                <select className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer">
                  <option>{condition.operator}</option>
                  <option>=</option>
                  <option>!=</option>
                  <option>contains</option>
                  <option>in</option>
                </select>
                <input 
                  type="text" 
                  defaultValue={condition.value}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-4 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <button className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover/cond:opacity-100 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button className="mt-2 flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all">
            <Plus className="w-3 h-3" />
            Add Condition
          </button>
        </div>
      </div>

      <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Rule Logic: <span className="text-slate-700">{rule.effect.toUpperCase()}</span> if <span className="text-indigo-600">ALL</span> conditions match.
        </p>
      </div>
    </motion.div>
  );
};

export default PolicyEngineTab;
