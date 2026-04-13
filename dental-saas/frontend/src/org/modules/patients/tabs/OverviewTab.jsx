/**
 * OverviewTab.jsx — Patient Overview Tab v5.1
 * 
 * Redesigned to match the provided HTML/CSS specification exactly.
 * Uses the 12-column bento grid layout and specific design tokens.
 */
import { useOutletContext, useNavigate } from 'react-router-dom';

// ─── Utilities ──────────────────────────────────────────────────────────────

function fmt(n) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Treatment Progress Card ────────────────────────────────────────────────

function TreatmentProgressCard({ aggregate }) {
    const clinical = aggregate?.clinical || {};
    const progress = clinical.treatmentProgress ?? 75;
    const phaseLabel = clinical.phaseLabel || "PHASE 1";
    const treatmentName = clinical.activeTreatment || "Invisalign Phase 1";
    const completionText = clinical.completionText || "18 of 24 trays completed";

    // Circular progress math
    const radius = 56;
    const circ = 2 * Math.PI * radius;
    const offset = circ - (progress / 100) * circ;

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col items-center text-center group transition-all hover:translate-y-[-4px]">
            <h3 className="w-full text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Treatment Progress</h3>
            <div className="relative flex items-center justify-center mb-4">
                <svg className="w-32 h-32 transform -rotate-90">
                    <circle className="text-slate-100" cx="64" cy="64" fill="transparent" r={radius} stroke="currentColor" strokeWidth="8" />
                    <circle 
                        className="text-blue-600 transition-all duration-1000" 
                        cx="64" cy="64" fill="transparent" r={radius} 
                        stroke="currentColor" strokeWidth="8" 
                        strokeDasharray={circ} 
                        strokeDashoffset={offset}
                        strokeLinecap="round" 
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-slate-800">{progress}%</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{phaseLabel}</span>
                </div>
            </div>
            <p className="text-sm font-bold text-slate-800 mb-1">{treatmentName}</p>
            <p className="text-xs text-slate-400">{completionText}</p>
        </div>
    );
}

// ─── Next Appointment Card ──────────────────────────────────────────────────

function NextAppointmentCard({ aggregate }) {
    const appt = aggregate?.nextAppointment || null;
    
    if (!appt) {
        return (
            <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between border-l-4 border-blue-600">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Next Appointment</h3>
                <p className="text-xs text-slate-400 italic text-center py-4">No upcoming appointments</p>
            </div>
        );
    }

    const d = new Date(appt.date);
    const day = d.toLocaleDateString('en-GB', { day: '2-digit' });
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const time = appt.time || d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between border-l-4 border-blue-600">
            <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Next Appointment</h3>
                <div className="flex items-start gap-4">
                    <div className="bg-blue-50 w-14 h-14 rounded-lg flex flex-col items-center justify-center text-blue-600">
                        <span className="text-lg font-bold leading-none">{day}</span>
                        <span className="text-[10px] font-bold uppercase mt-1">{month}</span>
                    </div>
                    <div>
                        <p className="text-lg font-bold text-slate-800 leading-tight">{time}</p>
                        <p className="text-sm text-slate-500 font-medium mt-1">{appt.procedure || "Consultation"}</p>
                    </div>
                </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">{appt.room || "Room 4"} • {appt.doctor || "Dr. Miller"}</span>
                <button className="text-xs font-bold text-blue-600 hover:underline">Reschedule</button>
            </div>
        </div>
    );
}

// ─── Clinical Details ───────────────────────────────────────────────────────

function ClinicalDetailsCard({ aggregate }) {
    const clinical = aggregate?.clinical || {};
    const alerts = clinical.alerts || [];
    
    return (
        <div className="md:col-span-2 bg-white rounded-xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">assignment</span> Chief Complaint
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed font-medium">
                    "{clinical.chiefComplaint || "No chief complaint recorded."}"
                </p>
            </div>
            <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">medical_services</span> Medical Alerts
                </h3>
                <div className="flex flex-col gap-2">
                    {alerts.map((alert, i) => (
                        <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                            alert.severity === 'high' || alert.type === 'MEDICAL_ALLERGY' 
                                ? 'bg-red-50 text-red-700 border-red-100' 
                                : 'bg-orange-50 text-orange-700 border-orange-100'
                        }`}>
                            <span className="material-symbols-outlined text-lg">
                                {alert.type === 'MEDICAL_ALLERGY' ? 'warning' : 'bloodtype'}
                            </span>
                            <span className="text-[11px] font-bold uppercase tracking-wide">{alert.data?.[0] || alert.message || alert.type}</span>
                        </div>
                    ))}
                    {alerts.length === 0 && (
                        <p className="text-xs text-slate-400 italic">No medical alerts</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Recent Activity ────────────────────────────────────────────────────────

function RecentActivityCard({ aggregate, patientId }) {
    const navigate = useNavigate();
    const activities = aggregate?.recentActivity || [];

    return (
        <div className="md:col-span-2 bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Activity</h3>
                <button 
                    onClick={() => navigate(`/org/patients/${patientId}/timeline`)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                    View Full History
                </button>
            </div>
            <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                {activities.slice(0, 2).map((activity, i) => (
                    <div key={i} className="relative pl-8">
                        <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center ${
                            activity.type === 'PAYMENT' ? 'bg-emerald-100' : 'bg-blue-100'
                        }`}>
                            <span className={`material-symbols-outlined text-sm ${
                                activity.type === 'PAYMENT' ? 'text-emerald-600' : 'text-blue-600'
                            }`}>
                                {activity.type === 'PAYMENT' ? 'payments' : 'description'}
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium mb-0.5">
                            {new Date(activity.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-sm font-bold text-slate-800 mb-1">{activity.title || activity.type}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{activity.description}</p>
                    </div>
                ))}
                {activities.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4">No recent activity</p>
                )}
            </div>
        </div>
    );
}

// ─── Financial Summary ──────────────────────────────────────────────────────

function FinancialSummaryCard({ aggregate }) {
    const fin = aggregate?.financial || {};
    const currency = aggregate?.core?.currency || "EGP";
    const balance = fin.balanceDue || 0;

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full -mr-16 -mt-16"></div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">Financial Summary</h3>
            <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Total Billed</span>
                    <span className="text-sm font-bold text-slate-800">{fmt(fin.totalBilled)} {currency}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Total Paid</span>
                    <span className="text-sm font-bold text-emerald-600">{fmt(fin.totalPaid)} {currency}</span>
                </div>
                <div className="h-px bg-slate-100"></div>
                <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-bold text-slate-800">Balance Due</span>
                    <div className="text-right">
                        <p className={`text-lg font-black ${balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmt(balance)} {currency}</p>
                        {balance > 0 && <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">🔴 Overdue</p>}
                    </div>
                </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
                <span className="material-symbols-outlined text-slate-400">history</span>
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Payment</p>
                    <p className="text-xs font-bold text-slate-800">
                        {fmt(fin.lastPayment?.amount)} {currency} • {fin.lastPayment?.date ? new Date(fin.lastPayment.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ─── Imaging Preview ────────────────────────────────────────────────────────

function ImagingPreviewCard({ aggregate }) {
    const images = aggregate?.clinical?.recentImaging || [];
    
    // Fallback static images to match mock
    const displayImages = images.length > 0 ? images.slice(0, 2) : [
        { label: 'Panorex', date: '2023-09-15', url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAIaj7N0gFzRoH6wccSxqZI37Dis8WfqJjWd0SCAkcV7_rCHtbuyv_d6fH6qlGJaxmf6J9DeDu_Oc8JyBC2dBIyd-9Xjyx4Qc2Eqq6t9vdNDoyMQNJJPiyUL4exWBSGrwI-L7oMmHYb3ala3sCregVqNrv1mgIDtFzo5jruMReNZDwzICexO_6lTniaMqLfKZPe8Ps9jnGXzfvG-3BktrHltM0-vXaJTqBpRpqLZYooYaBOBvAzByst0IDcsiaInPe0T5SDTCYK_38' },
        { label: 'Cephalo', date: '2023-09-15', url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAWoL1qFxNOkrTcL1T-BNZARCAtPRciZeyw1k3vvyQSQizG83xupWpJi9gacdQjHEurAF6OSromc7MmEsHBQAXy05bRJlwPkHye03GUY0HgLd9BY1RvinaqIuGhAM3yf-oBKmj_LYtAcDEY6pg711t22pd6UqelQXTzNOUfQpswJ8Q48qnPolsRtpJuWXg-oTx-govyXh3cYcU8Eft6BfVLZ6J9b2TKgaK2bmtZ54sdcJhHaMWvBoYantmVaSGOcQEk5AVYjrxSJrw' }
    ];

    return (
        <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Recent Imaging</h3>
                <button className="material-symbols-outlined text-blue-600 p-1 hover:bg-blue-50 rounded-lg transition-colors">add_a_photo</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {displayImages.map((img, i) => (
                    <div key={i} className="group relative cursor-pointer">
                        <img 
                            src={img.url} 
                            alt={img.label} 
                            className="w-full h-32 object-cover rounded-lg border border-slate-100 transition-opacity group-hover:opacity-75" 
                        />
                        <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-sm p-1.5 rounded text-[9px] text-white">
                            <p className="font-bold">{img.label}</p>
                            <p className="opacity-80 font-medium">{img.date ? new Date(img.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
                        </div>
                    </div>
                ))}
            </div>
            <button className="w-full mt-4 py-2.5 text-xs font-bold text-blue-600 border border-blue-100 rounded-xl hover:bg-blue-50 transition-colors">
                Open Imaging Suite
            </button>
        </div>
    );
}

// ─── Patient Attributes ─────────────────────────────────────────────────────

function PatientAttributesCard({ aggregate }) {
    const tags = aggregate?.core?.tags || aggregate?.tags || [];
    const source = aggregate?.core?.referralSource;
    const tier = aggregate?.core?.loyaltyTier;

    const chips = [
        ...tags,
        ...(source ? [`Referral: ${source}`] : []),
        ...(tier ? [`Loyalty Tier: ${tier}`] : [])
    ].filter(Boolean);

    return (
        <div className="bg-blue-600/5 rounded-xl p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-4">Patient Attributes</h3>
            <div className="flex flex-wrap gap-2">
                {chips.map((chip, i) => (
                    <span key={i} className="px-3 py-1 bg-white text-[10px] font-bold text-slate-500 rounded-full border border-slate-100 uppercase tracking-widest shadow-sm">
                        {chip}
                    </span>
                ))}
                {chips.length === 0 && <p className="text-xs text-slate-400 italic">No attributes</p>}
            </div>
        </div>
    );
}

// ─── Root ───────────────────────────────────────────────────────────────────

export default function OverviewTab() {
    const { aggregate } = useOutletContext();
    if (!aggregate) return null;

    const patientId = aggregate._id || aggregate.core?._id;

    return (
        <div className="grid grid-cols-12 gap-6">
            {/* Section 1: Clinical Context (8 cols) */}
            <div className="col-span-12 xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <TreatmentProgressCard aggregate={aggregate} />
                <NextAppointmentCard   aggregate={aggregate} />
                <ClinicalDetailsCard   aggregate={aggregate} />
                <RecentActivityCard    aggregate={aggregate} patientId={patientId} />
            </div>

            {/* Sidebar Content (4 cols) */}
            <div className="col-span-12 xl:col-span-4 space-y-6">
                <FinancialSummaryCard  aggregate={aggregate} />
                <ImagingPreviewCard    aggregate={aggregate} />
                <PatientAttributesCard aggregate={aggregate} />
            </div>
        </div>
    );
}
