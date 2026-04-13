import { readFileSync, writeFileSync } from 'fs';

const FILE = new URL('../src/org/modules/patients/tabs/OrthodonticTab.jsx', import.meta.url).pathname.slice(1);

const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');

// Find the overview block boundaries
const startMarker = "                {/* ══ Tab Content ═══════════════════════════════════════ */}";
const endMarker   = "                {/* ══ Cases Tab ═════════════════════════════════════════ */}";

let startIdx = -1, endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (startIdx === -1 && lines[i].includes('Tab Content')) startIdx = i;
  if (startIdx !== -1 && endIdx === -1 && lines[i].includes('Cases Tab')) { endIdx = i; break; }
}

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find markers. startIdx:', startIdx, 'endIdx:', endIdx);
  process.exit(1);
}

console.log(`Replacing lines ${startIdx+1}–${endIdx} (${endIdx - startIdx} lines)`);

const REPLACEMENT = `                {/* ══ Tab Content ═══════════════════════════════════════ */}
                {activeTab === 'overview' && (
                <div className="grid grid-cols-12 gap-6">

                    {/* ══ LEFT (col-8): Case Status + Quick Actions + Timeline ══ */}
                    <div className="col-span-12 lg:col-span-8 space-y-6">

                        {/* Case Status Card */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-8"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                                        {orthoCase.type || 'Fixed Appliance U+L'}
                                    </h2>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Active Treatment Phase</p>
                                </div>
                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    Active
                                </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Upper Arch</p>
                                    <p className="text-sm font-semibold text-slate-800 truncate">{orthoCase.upperArch || '—'}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Phase</p>
                                    <p className="text-sm font-semibold text-slate-800">{orthoCase.phase || 'Alignment'}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Started</p>
                                    <p className="text-sm font-semibold text-slate-800">{orthoCase.startedAt || '—'}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all group"
                                    onClick={() => setShowChartEditor(true)}>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 group-hover:text-blue-500">Chart</p>
                                    <p className="text-sm font-semibold text-blue-600">Open ↗</p>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-1.5">
                                    <p className="text-xs font-medium text-slate-500">Overall Progress</p>
                                    <p className="text-xs font-bold text-blue-600">65%</p>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-blue-600 h-full rounded-full transition-all" style={{ width: '65%' }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <button
                                id="open-chart-editor-btn"
                                onClick={() => setShowChartEditor(true)}
                                className="flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-[1.5rem] shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-95 transition-all gap-3"
                            >
                                <ExternalLink className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Chart Editor</span>
                            </button>
                            <button
                                id="open-cast-analysis-btn"
                                onClick={() => setShowCastAnalysis(true)}
                                className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] shadow-sm hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 active:scale-95 transition-all gap-3"
                            >
                                <Ruler className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Cast Analysis</span>
                            </button>
                            <button className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] shadow-sm hover:bg-slate-50 active:scale-95 transition-all gap-3">
                                <Calendar className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Appointment</span>
                            </button>
                            <button className="flex flex-col items-center justify-center p-6 bg-white border border-slate-200 text-slate-600 rounded-[1.5rem] shadow-sm hover:bg-slate-50 active:scale-95 transition-all gap-3">
                                <Plus className="w-6 h-6" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Lab Order</span>
                            </button>
                        </div>

                        {/* Clinical Timeline */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-8"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Patient History</p>
                                    <h2 className="text-xl font-bold tracking-tight text-slate-900">Clinical Timeline</h2>
                                </div>
                                <button
                                    onClick={() => setActiveTab('timeline')}
                                    className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline"
                                >
                                    Full View ↗
                                </button>
                            </div>

                            <div className="relative pl-10">
                                <div className="absolute left-[3px] top-2 bottom-2 w-0.5 bg-blue-100 rounded-full"></div>

                                {recentActivity.length === 0 ? (
                                    <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center text-center">
                                        <Calendar className="w-10 h-10 text-slate-300 mb-3" />
                                        <p className="text-sm font-bold text-slate-400">No clinical visits recorded yet</p>
                                        <p className="text-xs text-slate-300 mt-1 max-w-[220px] leading-relaxed">
                                            Open the Chart Editor and save your first snapshot to begin.
                                        </p>
                                    </div>
                                ) : recentActivity.map((entry, i) => {
                                    const TYPE_BADGE = {
                                        bonding:     'bg-purple-50 text-purple-700 border-purple-100',
                                        adjustment:  'bg-blue-50 text-blue-700 border-blue-100',
                                        wire_change: 'bg-cyan-50 text-cyan-700 border-cyan-100',
                                        debonding:   'bg-orange-50 text-orange-700 border-orange-100',
                                        treatment:   'bg-emerald-50 text-emerald-700 border-emerald-100',
                                    };
                                    const TYPE_LABEL = {
                                        bonding: 'Bonding', adjustment: 'Adjustment',
                                        wire_change: 'Wire Change', debonding: 'Debonding', treatment: 'Treatment',
                                    };
                                    const badgeCls  = TYPE_BADGE[entry.type] ?? TYPE_BADGE.treatment;
                                    const typeLabel = TYPE_LABEL[entry.type] ?? 'Visit';
                                    const isLatest  = i === 0;
                                    const procs     = entry.procedures ?? [];
                                    return (
                                        <div key={entry.visitId ?? i}
                                            className={\`relative group \${i < recentActivity.length - 1 ? 'mb-10' : ''}\`}>
                                            <div className={\`absolute -left-[41px] top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-sm z-10 transition-all \${
                                                isLatest ? 'bg-blue-600 ring-4 ring-blue-100' : 'bg-slate-300'
                                            }\`} />
                                            <div className={\`rounded-2xl p-5 transition-all group-hover:-translate-y-0.5 \${
                                                isLatest
                                                    ? 'bg-blue-50/40 border border-blue-100'
                                                    : 'bg-white border border-slate-100 hover:shadow-sm'
                                            }\`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={\`px-2.5 py-0.5 rounded-full text-[10px] font-bold border \${
                                                            isLatest ? 'bg-blue-600 text-white border-blue-600'
                                                                     : 'bg-slate-50 text-slate-500 border-slate-200'
                                                        }\`}>
                                                            Visit #{entry.visitNumber ?? '?'}
                                                        </span>
                                                        {isLatest && (
                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">Latest</span>
                                                        )}
                                                        <span className={\`px-2.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider \${badgeCls}\`}>
                                                            {typeLabel}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                                                        {entry.visitDate
                                                            ? new Date(entry.visitDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })
                                                            : '—'}
                                                    </span>
                                                </div>
                                                {procs.length > 0 && (
                                                    <div className="space-y-1.5 mb-3">
                                                        {procs.slice(0, 3).map((p, pi) => (
                                                            <div key={pi} className="flex items-start gap-2">
                                                                <Activity className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                                                                <p className="text-xs text-slate-700 leading-relaxed">
                                                                    {typeof p === 'string' ? p : (p?.type ?? JSON.stringify(p))}
                                                                </p>
                                                            </div>
                                                        ))}
                                                        {procs.length > 3 && (
                                                            <p className="text-[10px] text-slate-400 pl-5">+{procs.length - 3} more</p>
                                                        )}
                                                    </div>
                                                )}
                                                {entry.notes?.clinical && (
                                                    <div className="bg-white border-l-2 border-blue-400 px-3 py-2 rounded-r-xl mb-3">
                                                        <p className="text-xs italic text-slate-500 leading-relaxed">
                                                            "{entry.notes.clinical.slice(0, 120)}{entry.notes.clinical.length > 120 ? '…' : ''}"
                                                        </p>
                                                    </div>
                                                )}
                                                {entry.snapshotId && (
                                                    <div className="flex justify-end">
                                                        <button
                                                            onClick={() => setShowChartEditor(true)}
                                                            className="text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100 flex items-center gap-1.5"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            Preview &amp; Restore
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ══ RIGHT (col-4) ══ */}
                    <div className="col-span-12 lg:col-span-4 space-y-5">

                        {/* Critical Alerts */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Critical Alerts</p>
                            <div className="space-y-3">
                                {(alerts.length > 0 ? alerts : MOCK_ALERTS).map((alert, i) => {
                                    const Icon = alert.icon || AlertTriangle;
                                    return (
                                        <div key={i} className={\`flex items-center gap-3 p-3 rounded-xl border text-sm font-bold \${alert.color || 'bg-red-50 border-red-100 text-red-700'}\`}>
                                            <Icon className="w-4 h-4 flex-shrink-0" />
                                            <span>{alert.label || alert.data?.[0] || alert.type}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Financial Summary</p>
                            <div className="mb-4">
                                <h3 className="text-3xl font-extrabold text-slate-900">
                                    \${remaining.toLocaleString()}
                                    <span className="text-sm font-medium text-slate-400 ml-1">remaining</span>
                                </h3>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
                                <div
                                    className="bg-emerald-500 h-full rounded-full transition-all"
                                    style={{ width: orthoCase.totalCost ? \`\${Math.min(100, Math.round((orthoCase.paidToDate / orthoCase.totalCost) * 100))}%\` : '0%' }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-4">
                                <span>{orthoCase.totalCost ? Math.round((orthoCase.paidToDate / orthoCase.totalCost) * 100) : 0}% Paid</span>
                                <span className="text-emerald-600">\${(orthoCase.paidToDate || 0).toLocaleString()} of \${(orthoCase.totalCost || 0).toLocaleString()}</span>
                            </div>
                            <button className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
                                <CreditCard className="w-4 h-4" /> Add Payment
                            </button>
                        </div>

                        {/* Next Step */}
                        <div className="bg-blue-50 border-2 border-blue-100 rounded-[2rem] p-6">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-4">Upcoming Target</p>
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 text-sm leading-snug">Stage: Finishing &amp; Detailing</h4>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                        Review panoramic X-ray to confirm root parallelism before debonding consultation.
                                    </p>
                                    <button className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-full hover:bg-blue-700 transition-all">
                                        Review Treatment Plan
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Analytics Snapshot */}
                        <div className="bg-white rounded-[2rem] border border-slate-100 p-6"
                            style={{ boxShadow: '0 4px 24px rgba(11,28,48,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Analytics Snapshot</p>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500">Total Visits</span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-800">{recentTimeline.length}</span>
                                </div>
                                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                                    <span className="text-sm text-slate-500">Last Visit</span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-800">
                                        {recentTimeline.length > 0
                                            ? new Date(recentTimeline[recentTimeline.length - 1]?.visitDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })
                                            : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Next Appointment</span>
                                    <span className="bg-slate-50 px-3 py-1 rounded-full text-xs font-bold text-slate-800">
                                        {aggregate.nextAppointment
                                            ? new Date(aggregate.nextAppointment).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })
                                            : 'Oct 24'}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
                )}

                {/* ══ Cases Tab ═════════════════════════════════════════ */}`;

const before = lines.slice(0, startIdx);
const after  = lines.slice(endIdx);

const result = [...before, ...REPLACEMENT.split('\n'), ...after].join('\n');
writeFileSync(FILE, result, 'utf8');
console.log(`Done. Wrote ${result.split('\n').length} lines.`);
