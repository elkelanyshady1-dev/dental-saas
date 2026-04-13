/**
 * BranchEditorModal.jsx — Create/Edit Branch (v32.3 — Map Integration)
 * High-performance UI with @react-google-maps/api integration.
 */
import { useState } from "react";
import WorkingHoursEditor from "./WorkingHoursEditor";
import BranchMapInput from "./BranchMapInput";
import AppModal from "@/components/ui/AppModal";

const DEFAULT_HOURS_OBJ = {
  sunday:    { enabled: true,  start: "09:00", end: "17:00" },
  monday:    { enabled: true,  start: "09:00", end: "17:00" },
  tuesday:   { enabled: true,  start: "09:00", end: "17:00" },
  wednesday: { enabled: true,  start: "09:00", end: "17:00" },
  thursday:  { enabled: true,  start: "09:00", end: "17:00" },
  friday:    { enabled: true,  start: "09:00", end: "14:00" },
  saturday:  { enabled: false, start: "09:00", end: "14:00" },
};

const mapObjToArr = (obj) => {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map(d => {
    const val = obj?.[d] || DEFAULT_HOURS_OBJ[d];
    return {
      day: d.charAt(0).toUpperCase() + d.slice(1),
      open: val.start,
      close: val.end,
      isOpen: val.enabled
    };
  });
};

const mapArrToObj = (arr) => {
  const obj = {};
  arr.forEach(a => {
    obj[a.day.toLowerCase()] = { enabled: a.isOpen, start: a.open, end: a.close };
  });
  return obj;
};

export default function BranchEditorModal({ branch, onSave, saving = false, saveError, onClose }) {
  const isEdit = !!branch;

  const [form, setForm] = useState({
    name:         branch?.name      || "",
    address:      branch?.address   || "",
    phone:        branch?.phone     || "",
    email:        branch?.email     || "",
    clinicType:   branch?.clinicType  || "PRIVATE",
    numberOfOperatories: branch?.numberOfOperatories || branch?.chairs?.length || 1,
    workingHours: mapObjToArr(branch?.workingHours || DEFAULT_HOURS_OBJ),
    location:     branch?.location?.lat ? branch.location : null,
  });
  
  const [localError, setLocalError] = useState(null);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    
    if (!form.name.trim()) {
      setLocalError("Branch name is required.");
      return;
    }

    try {
      const payload = {
        ...form,
        workingHours: mapArrToObj(form.workingHours)
      };

      if (isEdit) {
        await onSave(branch._id, payload);
      } else {
        await onSave(payload);
      }
    } catch (err) {
      setLocalError(err.response?.data?.message || err.message || "Failed to save branch");
    }
  };

  const errorMsg = localError || saveError;

  const handleSafeClose = () => {
    setShowConfirmClose(true);
  };

  const confirmDiscard = () => {
    setShowConfirmClose(false);
    onClose();
  };

  return (
    <div 
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" 
        onClick={handleSafeClose}
    >
      <div 
          className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto" 
          onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl ${isEdit ? "bg-amber-100/70" : "bg-blue-100/70"}`}>
              <span className="material-symbols-outlined text-[20px]">
                  {isEdit ? "edit_location" : "add_location"}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                {isEdit ? "Branch Configuration" : "New Clinic Branch"}
              </h2>
              <p className="text-xs text-slate-400 font-medium tracking-wide">
                {isEdit ? `Editing location properties for ${branch.name}` : "Establish a new point of care in your organization"}
              </p>
            </div>
          </div>
          <button 
              type="button"
              onClick={handleSafeClose} 
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-8">
          {/* Error Banner */}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-600">
                <span className="material-symbols-outlined text-[18px] text-red-400">error</span>
                <p className="font-semibold leading-tight">{errorMsg}</p>
            </div>
          )}

          {/* Section 1: Core Identity */}
          <div className="space-y-5">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-3 bg-blue-600 rounded-full"></span>
                Basic Identity
            </h3>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Practice Name *</label>
              <input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                required
                placeholder="e.g. Cairo City Dental Center"
                className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Contact Phone</label>
                <input
                  value={form.phone}
                  onChange={e => set("phone", e.target.value)}
                  type="tel"
                  placeholder="+20 1..."
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Practice Email</label>
                <input
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  type="email"
                  placeholder="contact@branch.com"
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Clinic Classification */}
          <div className="space-y-4 pt-4 border-t border-slate-50">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-3 bg-purple-600 rounded-full"></span>
                Classification
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { 
                  value: "PRIVATE", 
                  label: "Commercial Practice", 
                  desc: "Standard fee-based clinic with full billing engine active.",
                  icon: "local_hospital",
                  active: "ring-1 ring-blue-500 bg-blue-50/50 border-blue-200/50",
                  textColor: "text-blue-700" 
                },
                { 
                  value: "ACADEMIC", 
                  label: "Research & Teaching", 
                  desc: "University affiliated. Clinical records active, but all billing suppressed.",
                  icon: "school",
                  active: "ring-1 ring-purple-500 bg-purple-50/50 border-purple-200/50",
                  textColor: "text-purple-700" 
                },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set("clinicType", opt.value)}
                  className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all text-left relative group ${
                    form.clinicType === opt.value 
                      ? opt.active
                      : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className={`material-symbols-outlined mb-2 text-[26px] ${
                      form.clinicType === opt.value ? opt.textColor : "text-slate-300 group-hover:text-slate-500"
                  }`}>{opt.icon}</span>
                  <span className={`text-sm font-black mb-1 ${
                      form.clinicType === opt.value ? opt.textColor : "text-slate-800"
                  }`}>{opt.label}</span>
                  <span className="text-[11px] text-slate-400 font-semibold leading-relaxed">{opt.desc}</span>
                  {form.clinicType === opt.value && (
                      <span className="absolute top-3 right-3 text-emerald-500 material-symbols-outlined text-[18px]">verified</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Geolocation (Interactive) */}
          <div className="pt-4 border-t border-slate-50">
            <BranchMapInput 
              value={form.location} 
              onChange={loc => set("location", loc)}
            />
          </div>

          {/* Section 4: Physical Logistics */}
          <div className="pt-4 border-t border-slate-50 space-y-5">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-3 bg-emerald-600 rounded-full"></span>
                Operational Parameters
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1">Number of Operatories</label>
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">medical_services</span>
                    <input
                      type="number" min="1" max="100"
                      value={form.numberOfOperatories}
                      onChange={e => set("numberOfOperatories", parseInt(e.target.value) || 1)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition"
                    />
                </div>
              </div>
              <div className="flex flex-col justify-end">
                  <p className="text-[11px] text-slate-400 font-medium leading-relaxed pb-1">
                      Configure the total number of dental chairs / stations available for scheduling.
                  </p>
              </div>
            </div>

            <div className="space-y-4">
                <label className="block text-sm font-bold text-slate-700 mb-1.5 ml-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">schedule</span>
                    Clinical Working Hours
                </label>
                <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4">
                    <WorkingHoursEditor 
                      hours={form.workingHours} 
                      onChange={hours => set("workingHours", hours)} 
                    />
                </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
              <button 
                type="button" 
                onClick={handleSafeClose}
                className="px-6 py-3 rounded-2xl text-sm font-black text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all active:scale-95"
              >
                Discard Changes
              </button>
              
              <button 
                type="submit" 
                disabled={saving}
                className="flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-800 text-white shadow-xl shadow-slate-200 hover:shadow-slate-300 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 disabled:translate-y-0"
              >
                {saving && (
                  <div className="w-5 h-5 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
                )}
                <span className="text-sm font-black tracking-tight">
                    {saving ? "Finalizing…" : isEdit ? "Update Configuration" : "Initialize Branch"}
                </span>
                {!saving && <span className="material-symbols-outlined text-[20px]">rocket_launch</span>}
              </button>
          </div>
        </form>
      </div>

      {showConfirmClose && (
        <AppModal
          isOpen={showConfirmClose}
          onClose={() => setShowConfirmClose(false)}
          onConfirm={confirmDiscard}
          title="Discard Changes?"
          message="Any unsaved data will be lost."
          variant="warning"
          confirmText="Discard"
        />
      )}
    </div>
  );
}
