import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { patientsApi } from "../../../modules/org/patients/api/patients.api";
import { useBranch } from "../../../context/BranchContext";

export default function NewPatientPage() {
    const navigate = useNavigate();
    const { activeBranchId } = useBranch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({
        nameEnglish: "",
        nameArabic: "",
        phone: "",
        gender: "male", // Strict default to avoid 'other'
        dob: ""
    });

    const isBranchSelected = !!activeBranchId;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isBranchSelected) {
            setError("Select active branch before registering patient");
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const res = await patientsApi.create({
                ...formData,
                primaryBranchId: activeBranchId,
                allowedBranchIds: [activeBranchId] // Enforce mandatory association
            });
            const patient = res.data?.data || res.data;
            navigate(`/org/patients/${patient._id}`);
        } catch (err) {
            console.error("Failed to register patient:", err);
            setError(err.response?.data?.error?.message || "Failed to register patient record in the sovereign domain.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                onClick={() => navigate("/org/patients")}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold mb-8 transition-colors group"
            >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                Back to Directory
            </button>

            {!isBranchSelected && (
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 p-6 rounded-[24px] text-amber-800 text-sm font-bold mb-8 animate-pulse shadow-sm">
                    <AlertCircle className="w-6 h-6 flex-shrink-0" />
                    Select active branch from the header before registering patient.
                </div>
            )}

            <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden">
                <div className="bg-slate-950 p-10 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-blue-500/40">
                            <UserPlus className="w-8 h-8" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tight">Register Sovereign Patient</h1>
                        <p className="text-slate-400 font-medium mt-2">Initialize a new patient aggregate within the organization's sovereign registry.</p>
                    </div>
                    {/* Decorative radial gradient */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                </div>

                <form onSubmit={handleSubmit} className="p-10 space-y-8">
                    {error && (
                        <div className="flex items-center gap-3 bg-red-50 border border-red-100 p-4 rounded-2xl text-red-700 text-sm font-bold">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Full Name (English)</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. John Doe"
                                value={formData.nameEnglish}
                                onChange={(e) => setFormData({ ...formData, nameEnglish: e.target.value })}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-slate-900 font-bold focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Full Name (Arabic)</label>
                            <input
                                type="text"
                                dir="rtl"
                                placeholder="مثال: جون دو"
                                value={formData.nameArabic}
                                onChange={(e) => setFormData({ ...formData, nameArabic: e.target.value })}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-slate-900 font-bold font-arabic focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all outline-none text-right"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Phone Number</label>
                            <input
                                required
                                type="tel"
                                placeholder="+971 50 123 4567"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-slate-900 font-bold focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Gender</label>
                            <select
                                value={formData.gender}
                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-slate-900 font-bold focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all outline-none appearance-none"
                            >
                                <option value="male">Male / ذكر</option>
                                <option value="female">Female / أنثى</option>
                            </select>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Date of Birth</label>
                            <input
                                type="date"
                                value={formData.dob}
                                onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-slate-900 font-bold focus:outline-none focus:border-blue-500/30 focus:bg-white transition-all outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-400 max-w-[200px]">Data will be stored within the sovereign organization boundary.</p>
                        <button
                            type="submit"
                            disabled={loading || !isBranchSelected}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-10 py-4 font-black text-sm shadow-xl shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2"
                        >
                            {loading ? "INITIALIZING..." : (
                                <>
                                    <CheckCircle2 className="w-5 h-5" />
                                    REGISTER PATIENT
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
