/**
 * PatientTimeline.jsx — Grouped vertical timeline of patient clinical activity.
 *
 * Groups events into: Today | Earlier this year | Older
 */
import { useState } from "react";
import TimelineItem from "./TimelineItem";

function groupEvents(events) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yearStart  = new Date(now.getFullYear(), 0, 1);

  const groups = { today: [], thisYear: [], older: [] };

  for (const ev of events) {
    const d = ev.date ? new Date(ev.date) : null;
    if (!d) { groups.older.push(ev); continue; }
    if (d >= todayStart)   groups.today.push(ev);
    else if (d >= yearStart) groups.thisYear.push(ev);
    else                   groups.older.push(ev);
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

const FILTER_TYPES = [
  { id: "all",         label: "All" },
  { id: "treatment",   label: "Treatments" },
  { id: "appointment", label: "Appointments" },
  { id: "note",        label: "Notes" },
  { id: "image",       label: "Images" },
  { id: "lab",         label: "Lab" },
  { id: "payment",     label: "Payments" },
];

export default function PatientTimeline({ events = [] }) {
  const [filter, setFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const groups   = groupEvents(filtered);
  const hasEvents = filtered.length > 0;

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-black text-slate-900">Treatment Timeline</h2>
        <div className="relative">
          <button
            id="btn-timeline-filter"
            onClick={() => setFilterOpen((p) => !p)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h18M6 8h12M10 12h4" />
            </svg>
            Filter
            {filter !== "all" && (
              <span className="bg-violet-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">1</span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-10 bg-white rounded-2xl border border-slate-100 shadow-xl z-50 py-2 w-44">
              {FILTER_TYPES.map((ft) => (
                <button
                  key={ft.id}
                  onClick={() => { setFilter(ft.id); setFilterOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm font-semibold transition-colors ${
                    filter === ft.id
                      ? "text-violet-700 bg-violet-50"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {ft.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!hasEvents && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl mb-3">🗓</span>
          <p className="text-slate-400 font-semibold text-sm">No events recorded yet.</p>
          <p className="text-slate-400 text-xs mt-1">Add a treatment or appointment to start the timeline.</p>
        </div>
      )}

      {/* ── Groups ── */}
      {groups.today.length > 0 && (
        <div>
          {/* TODAY badge */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white bg-violet-600 px-3 py-1 rounded-full shadow-sm shadow-violet-300">
              TODAY
            </span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          {groups.today.map((ev, i) => (
            <TimelineItem key={ev.id || i} item={ev} isFirst={i === 0} />
          ))}
        </div>
      )}

      {groups.thisYear.length > 0 && (
        <div>
          <GroupLabel label="Earlier this year" />
          {groups.thisYear.map((ev, i) => (
            <TimelineItem key={ev.id || i} item={ev} />
          ))}
        </div>
      )}

      {groups.older.length > 0 && (
        <div>
          <GroupLabel label="Older" />
          {groups.older.map((ev, i) => (
            <TimelineItem key={ev.id || i} item={ev} />
          ))}
        </div>
      )}
    </div>
  );
}
