import React, { useState } from 'react';
import { 
  Database, 
  ChevronRight, 
  Check, 
  X, 
  Info, 
  ShieldCheck, 
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { motion } from 'motion/react';

interface FieldAccess {
  id: string;
  field: string;
  description: string;
  doctor: boolean;
  assistant: boolean;
  receptionist: boolean;
}

const mockFields: Record<string, FieldAccess[]> = {
  'Patient': [
    { id: '1', field: 'id', description: 'Unique identifier for the patient.', doctor: true, assistant: true, receptionist: true },
    { id: '2', field: 'firstName', description: 'Patient first name.', doctor: true, assistant: true, receptionist: true },
    { id: '3', field: 'lastName', description: 'Patient last name.', doctor: true, assistant: true, receptionist: true },
    { id: '4', field: 'email', description: 'Patient email address.', doctor: true, assistant: true, receptionist: true },
    { id: '5', field: 'phone', description: 'Patient phone number.', doctor: true, assistant: true, receptionist: true },
    { id: '6', field: 'medicalHistory', description: 'Sensitive medical history and notes.', doctor: true, assistant: false, receptionist: false },
    { id: '7', field: 'insuranceId', description: 'Insurance policy number.', doctor: true, assistant: true, receptionist: true },
    { id: '8', field: 'ssn', description: 'Social Security Number (Highly Sensitive).', doctor: false, assistant: false, receptionist: false },
    { id: '9', field: 'address', description: 'Patient home address.', doctor: true, assistant: true, receptionist: true },
    { id: '10', field: 'dateOfBirth', description: 'Patient date of birth.', doctor: true, assistant: true, receptionist: true },
  ],
  'Invoice': [
    { id: 'i1', field: 'amount', description: 'Total invoice amount.', doctor: true, assistant: false, receptionist: true },
    { id: 'i2', field: 'status', description: 'Payment status.', doctor: true, assistant: false, receptionist: true },
    { id: 'i3', field: 'items', description: 'List of billed items.', doctor: true, assistant: false, receptionist: true },
  ],
  'Orthodontic Case': [
    { id: 'o1', field: 'scans', description: '3D scans and images.', doctor: true, assistant: true, receptionist: false },
    { id: 'o2', field: 'treatmentPlan', description: 'Detailed treatment steps.', doctor: true, assistant: true, receptionist: false },
  ]
};

const FieldAccessTab: React.FC = () => {
  const [selectedResource, setSelectedResource] = useState('Patient');
  const [searchQuery, setSearchQuery] = useState('');

  const fields = mockFields[selectedResource].filter(f => 
    f.field.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Resource Selector & Actions */}
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Resource</span>
              <select 
                value={selectedResource}
                onChange={(e) => setSelectedResource(e.target.value)}
                className="text-sm font-black text-slate-800 focus:outline-none bg-transparent cursor-pointer hover:text-indigo-600 transition-colors"
              >
                <option>Patient</option>
                <option>Invoice</option>
                <option>Orthodontic Case</option>
              </select>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search fields..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100">
            <CheckCircle2 className="w-4 h-4" />
            Allow All
          </button>
          <button className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100">
            <XCircle className="w-4 h-4" />
            Deny All
          </button>
        </div>
      </div>

      {/* Access Matrix */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest w-1/3">Field Definition</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Doctor</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Assistant</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Receptionist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        <code className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded tracking-wider">{f.field}</code>
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-500 leading-relaxed group-hover:text-slate-700 transition-colors">
                          {f.description}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <AccessToggle active={f.doctor} />
                  </td>
                  <td className="px-8 py-5 text-center">
                    <AccessToggle active={f.assistant} />
                  </td>
                  <td className="px-8 py-5 text-center">
                    <AccessToggle active={f.receptionist} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend & Info */}
      <div className="bg-indigo-900 rounded-3xl p-6 text-white flex items-center justify-between shadow-xl shadow-indigo-100">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest">Field-Level RBAC</h4>
              <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-0.5">Granular Data Visibility Control</p>
            </div>
          </div>
          <div className="h-10 w-px bg-white/10"></div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Visible</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-400"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Hidden</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-200 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
          <Info className="w-4 h-4" />
          Changes are applied instantly to all API responses
        </div>
      </div>
    </div>
  );
};

const AccessToggle: React.FC<{ active: boolean }> = ({ active }) => {
  const [isOn, setIsOn] = useState(active);

  return (
    <button 
      onClick={() => setIsOn(!isOn)}
      className={`relative w-12 h-6 rounded-full transition-all duration-300 focus:outline-none ${
        isOn ? 'bg-emerald-500 shadow-lg shadow-emerald-100' : 'bg-slate-200'
      }`}
    >
      <motion.div 
        animate={{ x: isOn ? 24 : 4 }}
        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm flex items-center justify-center overflow-hidden"
      >
        {isOn ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <X className="w-2.5 h-2.5 text-slate-400" />}
      </motion.div>
    </button>
  );
};

export default FieldAccessTab;
