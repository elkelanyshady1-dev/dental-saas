import React from 'react';
import { Activity, Plus, FileUp, Eye, Clock, Truck, CheckCircle2 } from 'lucide-react';
import { LabOrder } from '../../../types';

interface OrthoLabTabProps {
  labOrders: LabOrder[];
}

const OrthoLabTab: React.FC<OrthoLabTabProps> = ({ labOrders }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Lab Orders</h3>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all border border-slate-200">
            <FileUp className="w-4 h-4" />
            Upload STL
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md">
            <Plus className="w-4 h-4" />
            Create Lab Order
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Order Type</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lab Name</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date Sent</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expected Delivery</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {labOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                        <Activity className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-slate-700">{order.type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-sm font-medium text-slate-600">{order.labName}</td>
                  <td className="px-6 py-5 text-sm font-medium text-slate-600">{order.dateSent}</td>
                  <td className="px-6 py-5">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1.5 w-fit ${
                      order.status === 'In Production' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      order.status === 'Received' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      {order.status === 'In Production' && <Clock className="w-3 h-3" />}
                      {order.status === 'Received' && <CheckCircle2 className="w-3 h-3" />}
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Truck className="w-4 h-4 text-slate-400" />
                      {order.expectedDelivery}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View Order Details">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supported Orders Info */}
      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 border-dashed">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Supported Lab Orders</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['Aligners', 'Retainers', 'Expanders', 'Orthodontic Appliances'].map(type => (
            <div key={type} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-xs font-bold text-slate-600">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrthoLabTab;
