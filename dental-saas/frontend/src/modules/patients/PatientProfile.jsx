import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPatient, getPatientFamilies } from "../../services/patientService";

export default function PatientProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [patient, setPatient] = useState(null);
    const [families, setFamilies] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [pRes, fRes] = await Promise.all([
                    getPatient(id),
                    getPatientFamilies(id).catch(() => ({ data: { data: [] } })),
                ]);
                setPatient(pRes.data.data || pRes.data.patient || pRes.data);
                setFamilies(fRes.data.data || fRes.data.families || []);
            } catch {
                setPatient(null);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="text-center py-20 text-slate-500">
                <p className="text-lg mb-2">Patient not found</p>
                <button onClick={() => navigate("/patients")} className="text-sm text-blue-400 hover:underline">
                    Back to list
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl space-y-6">
            {/* Back */}
            <button
                onClick={() => navigate("/patients")}
                className="text-sm text-slate-500 hover:text-slate-300 transition"
            >
                ← Back to patients
            </button>

            {/* Profile header */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex items-center gap-5">
                {patient.profilePhoto ? (
                    <img
                        src={patient.profilePhoto}
                        alt=""
                        className="w-16 h-16 rounded-full object-cover border-2 border-slate-700"
                    />
                ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-xl font-bold text-white">
                        {(patient.firstName?.[0] || "").toUpperCase()}
                    </div>
                )}
                <div>
                    <h2 className="text-lg font-semibold text-slate-200">
                        {patient.firstName} {patient.lastName}
                    </h2>
                    <p className="text-sm text-slate-400 mt-0.5">{patient.phone || "No phone"}</p>
                    {patient.email && <p className="text-sm text-slate-500">{patient.email}</p>}
                </div>
            </div>

            {/* Details */}
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Info label="Date of Birth" value={patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : "—"} />
                    <Info label="Gender" value={patient.gender || "—"} />
                    <Info label="Address" value={patient.address || "—"} />
                    <Info label="Medical History" value={patient.medicalHistory || "—"} />
                </div>
            </div>

            {/* Families */}
            {families.length > 0 && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-slate-300 mb-4">Family Members</h3>
                    <div className="space-y-2">
                        {families.map((f) => (
                            <div
                                key={f._id}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition"
                            >
                                <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center text-xs text-purple-400 font-semibold">
                                    {(f.firstName?.[0] || "?").toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-sm text-slate-300">{f.firstName} {f.lastName}</p>
                                    <p className="text-[10px] text-slate-500">{f.relationship || ""}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function Info({ label, value }) {
    return (
        <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
            <p className="text-sm text-slate-300 mt-0.5">{value}</p>
        </div>
    );
}
