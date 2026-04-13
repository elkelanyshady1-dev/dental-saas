/**
 * TimelineTab.jsx — Patient Timeline & Summary Tab
 *
 * Merged from the v2 PatientProfilePage into the canonical PatientLayout.
 * Displays a grouped vertical timeline (Today / Earlier / Older) with
 * filter controls, alongside summary cards (Treatment, Financial,
 * Next Appointment, Medical Flags).
 *
 * Data source: receives `aggregate` + `fetchAggregate` from PatientLayout
 * via useOutletContext().
 *
 * Architecture: org-plane only, organizationId never sent.
 */
import { useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { usePatientTimeline, TIMELINE_EVENT_TYPES } from '../../../../modules/org/patients/hooks/usePatientTimeline';

// ═══════════════════════════════════════════════════════════════════
//  TIMELINE ITEM
// ═══════════════════════════════════════════════════════════════════

const TYPE_CONFIG = {
    treatment:    { icon: '🦷', color: 'bg-violet-600', ring: 'ring-violet-200', label: 'ACTIVE TREATMENT', labelColor: 'text-violet-600' },
    appointment:  { icon: '📅', color: 'bg-blue-500',   ring: 'ring-blue-200',   label: 'APPOINTMENT',      labelColor: 'text-blue-600' },
    note:         { icon: '📝', color: 'bg-amber-500',  ring: 'ring-amber-200',  label: 'CLINICAL NOTE',    labelColor: 'text-amber-600' },
    image:        { icon: '🖼',  color: 'bg-slate-500',  ring: 'ring-slate-200',  label: 'IMAGE UPLOAD',     labelColor: 'text-slate-500' },
    lab:          { icon: '🧪', color: 'bg-teal-500',   ring: 'ring-teal-200',   label: 'LAB ORDER',        labelColor: 'text-teal-600' },
    lab_order:    { icon: '🧪', color: 'bg-teal-500',   ring: 'ring-teal-200',   label: 'LAB ORDER',        labelColor: 'text-teal-600' },
    payment:      { icon: '💳', color: 'bg-emerald-500', ring: 'ring-emerald-200', label: 'PAYMENT',         labelColor: 'text-emerald-600' },
    prescription: { icon: '💊', color: 'bg-purple-500',  ring: 'ring-purple-200',  label: 'PRESCRIPTION',    labelColor: 'text-purple-600' },
};

const STATUS_STYLES = {
    'IN PROGRESS': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'COMPLETED':   'bg-slate-100 text-slate-600 border-slate-200',
    'PENDING':     'bg-amber-50 text-amber-700 border-amber-200',
    'CANCELLED':   'bg-red-50 text-red-600 border-red-200',
};

function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function TimelineItem({ item }) {
    const { type = 'note', title, date, timestamp, description, doctor, status, images = [], attachments = [], actions = [], amount, currency = 'EGP' } = item;
    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.note;
    const eventDate = timestamp || date;  // standardized field

    // Derive images from attachments if not provided
    const displayImages = images.length > 0
        ? images
        : (attachments || []).filter(a => a.type === 'image').map(a => a.url);

    return (
        <div className="relative flex gap-4">
            {/* Vertical connector */}
            <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-9 h-9 rounded-xl ${cfg.color} ring-4 ${cfg.ring} flex items-center justify-center text-white text-base shadow-sm z-10`}>
                    {cfg.icon}
                </div>
                <div className="w-px flex-1 bg-slate-200 mt-1" />
            </div>

            {/* Content card */}
            <div className={`flex-1 mb-4 bg-white rounded-2xl border transition-shadow hover:shadow-md ${type === 'treatment' ? 'border-violet-200 shadow-sm' : 'border-slate-100'}`}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-black uppercase tracking-wider ${cfg.labelColor}`}>{cfg.label}</span>
                                {eventDate && (
                                    <>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-[10px] font-semibold text-slate-400">{fmtTime(eventDate) || fmtDate(eventDate)}</span>
                                    </>
                                )}
                                {doctor && (
                                    <>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-[10px] font-semibold text-slate-400">{doctor}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {eventDate && <span className="text-[10px] text-slate-400 font-semibold">{fmtDate(eventDate)}</span>}
                            {status && (
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES['PENDING']}`}>
                                    {status}
                                </span>
                            )}
                        </div>
                    </div>

                    {description && <p className="text-[13px] text-slate-600 leading-relaxed mt-2">{description}</p>}

                    {type === 'payment' && amount != null && (
                        <p className="text-sm font-black text-emerald-600 mt-2">+{amount.toLocaleString()} {currency}</p>
                    )}

                    {displayImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                            {displayImages.map((src, i) => (
                                <img key={i} src={src} alt={`clinical-${i}`}
                                    className="w-20 h-16 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                                />
                            ))}
                        </div>
                    )}

                    {actions.length > 0 && (
                        <div className="flex items-center gap-2 mt-3">
                            {actions.map((action, i) => (
                                <button key={i} onClick={action.onClick}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                        i === 0 ? 'bg-violet-600 text-white hover:bg-violet-700' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    {action.icon && <span>{action.icon}</span>}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  GROUPED TIMELINE
// ═══════════════════════════════════════════════════════════════════

function groupEvents(events) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const groups = { today: [], thisYear: [], older: [] };

    for (const ev of events) {
        const d = (ev.timestamp || ev.date) ? new Date(ev.timestamp || ev.date) : null;
        if (!d) { groups.older.push(ev); continue; }
        if (d >= todayStart) groups.today.push(ev);
        else if (d >= yearStart) groups.thisYear.push(ev);
        else groups.older.push(ev);
    }
    return groups;
}

function GroupLabel({ label }) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">
                {label}
            </span>
            <div className="flex-1 h-px bg-slate-100" />
        </div>
    );
}

function PatientTimeline({ events = [], isLoading = false }) {
    const [filter, setFilter] = useState('all');
    const [filterOpen, setFilterOpen] = useState(false);

    const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);
    const groups = groupEvents(filtered);

    return (
        <div>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black text-slate-900">
                    Treatment Timeline
                    {events.length > 0 && (
                        <span className="ml-2 text-xs font-bold text-slate-400">{events.length} events</span>
                    )}
                </h2>
                <div className="relative">
                    <button
                        onClick={() => setFilterOpen(p => !p)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h18M6 8h12M10 12h4" />
                        </svg>
                        Filter
                        {filter !== 'all' && (
                            <span className="bg-violet-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">1</span>
                        )}
                    </button>
                    {filterOpen && (
                        <div className="absolute right-0 top-10 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 py-2 w-44">
                            {TIMELINE_EVENT_TYPES.map(ft => (
                                <button key={ft.id}
                                    onClick={() => { setFilter(ft.id); setFilterOpen(false); }}
                                    className={`w-full text-left px-4 py-2 text-sm font-semibold transition-colors ${
                                        filter === ft.id ? 'text-violet-700 bg-violet-50' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    {ft.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Loading skeleton */}
            {isLoading && (
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex gap-4">
                            <div className="w-9 h-9 rounded-xl bg-slate-200 animate-pulse flex-shrink-0" />
                            <div className="flex-1 h-28 rounded-2xl bg-slate-100 animate-pulse" />
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <span className="text-4xl mb-3">🗓</span>
                    <p className="text-slate-400 font-semibold text-sm">No events recorded yet.</p>
                    <p className="text-slate-400 text-xs mt-1">Add a treatment or appointment to start the timeline.</p>
                </div>
            )}

            {groups.today.length > 0 && (
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white bg-violet-600 px-3 py-1 rounded-full shadow-sm shadow-violet-300">TODAY</span>
                        <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    {groups.today.map((ev, i) => <TimelineItem key={ev.id || i} item={ev} />)}
                </div>
            )}

            {groups.thisYear.length > 0 && (
                <div>
                    <GroupLabel label="Earlier this year" />
                    {groups.thisYear.map((ev, i) => <TimelineItem key={ev.id || i} item={ev} />)}
                </div>
            )}

            {groups.older.length > 0 && (
                <div>
                    <GroupLabel label="Older" />
                    {groups.older.map((ev, i) => <TimelineItem key={ev.id || i} item={ev} />)}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  SUMMARY CARDS
// ═══════════════════════════════════════════════════════════════════

function Card({ title, children, action }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
                <h3 className="text-sm font-black text-slate-900">{title}</h3>
                {action && <button className="text-[10px] font-bold text-violet-500 hover:text-violet-700 transition-colors">{action}</button>}
            </div>
            <div className="px-5 py-4">{children}</div>
        </div>
    );
}

function FinRow({ label, value, color = 'text-slate-800', bold }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">{label}</span>
            <span className={`text-sm font-${bold ? 'black' : 'bold'} ${color}`}>{value}</span>
        </div>
    );
}

function TreatmentSummaryCard({ financial }) {
    const progress = financial?.treatmentProgress ?? 0;
    return (
        <Card title="Treatment Summary" action="ℹ️">
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Treatment Status</span>
                    <span className="text-[10px] font-black text-violet-600">{progress}% Complete</span>
                </div>
                <div className="h-2 bg-violet-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
            </div>
        </Card>
    );
}

function FinancialSummaryCard({ financial }) {
    const { totalCost = 0, totalPaid = 0, balance = 0, currency = 'EGP' } = financial || {};
    return (
        <Card title="Financial Summary">
            <div className="space-y-3">
                <FinRow label="Total Treatment" value={`${totalCost.toLocaleString()} ${currency}`} />
                <FinRow label="Amount Paid" value={`${totalPaid.toLocaleString()} ${currency}`} color="text-emerald-600" />
                <div className="border-t border-slate-100 pt-3">
                    <FinRow label="Balance Due" value={`${balance.toLocaleString()} ${currency}`} color={balance > 0 ? 'text-red-500' : 'text-emerald-600'} bold />
                </div>
            </div>
        </Card>
    );
}

function NextAppointmentCard({ appointment }) {
    if (!appointment) {
        return (
            <Card title="Next Appointment">
                <p className="text-xs text-slate-400 italic text-center py-2">No upcoming appointments</p>
            </Card>
        );
    }
    const { date, time, doctor, procedure } = appointment;
    const d = date ? new Date(date) : null;
    const day = d ? d.toLocaleDateString('en-GB', { day: '2-digit' }) : '—';
    const month = d ? d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : '';

    return (
        <Card title="Next Appointment">
            <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl p-3">
                <div className="flex flex-col items-center justify-center bg-violet-600 text-white rounded-xl w-10 py-1 flex-shrink-0">
                    <span className="text-[9px] font-black uppercase tracking-wide leading-tight">{month}</span>
                    <span className="text-lg font-black leading-tight">{day}</span>
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-800">{procedure || 'Appointment'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {time && <span>{time} • </span>}
                        {doctor}
                    </p>
                </div>
            </div>
        </Card>
    );
}

const FLAG_STYLES = [
    { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '⚠️' },
    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '🔔' },
    { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '💊' },
    { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: '🩺' },
];

function MedicalFlagsCard({ flags = [] }) {
    if (!flags.length) {
        return (
            <Card title="Medical Flags">
                <p className="text-xs text-slate-400 italic text-center py-2">No medical flags recorded</p>
            </Card>
        );
    }
    return (
        <Card title="Medical Flags" action="Edit">
            <div className="space-y-2">
                {flags.map((flag, i) => {
                    const style = FLAG_STYLES[i % FLAG_STYLES.length];
                    return (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${style.bg} ${style.border}`}>
                            <span className="text-sm">{style.icon}</span>
                            <span className={`text-xs font-bold ${style.text}`}>{flag}</span>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN TAB EXPORT
// ═══════════════════════════════════════════════════════════════════

export default function TimelineTab() {
    const { id } = useParams();
    const { aggregate } = useOutletContext();
    if (!aggregate) return null;

    const { clinical, financial } = aggregate;

    // Use React Query hook for timeline events (fetches appts + treatments + docs)
    const { events: hookEvents, isLoading: timelineLoading } = usePatientTimeline(id);

    // Fallback: use aggregate.timeline if hook returns nothing (backend may embed events)
    const events = hookEvents.length > 0 ? hookEvents : (aggregate.timeline || []);

    // Derive medical flags from clinical alerts
    const medicalFlags = clinical?.alerts
        ?.filter(a => a.type === 'ALLERGY' || a.type === 'MEDICAL_CONDITION')
        ?.flatMap(a => a.data) || [];

    return (
        <div className="grid grid-cols-12 gap-6">
            {/* Left — Timeline (8 cols) */}
            <div className="col-span-12 lg:col-span-8">
                <PatientTimeline events={events} isLoading={timelineLoading && hookEvents.length === 0} />
            </div>

            {/* Right — Summary Cards (4 cols) */}
            <div className="col-span-12 lg:col-span-4 space-y-4">
                <TreatmentSummaryCard financial={financial} />
                <FinancialSummaryCard financial={financial} />
                <NextAppointmentCard appointment={aggregate.nextAppointment} />
                <MedicalFlagsCard flags={medicalFlags} />
            </div>
        </div>
    );
}

