/**
 * PatientTabs.jsx — Navigation tabs for the patient profile workspace.
 */
const TABS = [
  { id: "timeline",      label: "Timeline",      icon: "⚡" },
  { id: "treatments",    label: "Treatments",     icon: "🦷" },
  { id: "dental-chart",  label: "Dental Chart",   icon: "📊" },
  { id: "appointments",  label: "Appointments",   icon: "📅" },
  { id: "billing",       label: "Billing",        icon: "💰" },
  { id: "lab-orders",    label: "Lab Orders",     icon: "🧪" },
  { id: "history",       label: "History",        icon: "📋" },
];

export { TABS };

export default function PatientTabs({ activeTab, onChange }) {
  return (
    <div className="bg-white border-b border-slate-100 px-6">
      <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`
                relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold
                whitespace-nowrap transition-all duration-150 outline-none
                ${isActive
                  ? "text-violet-600"
                  : "text-slate-500 hover:text-slate-800"}
              `}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
              {/* Active underline */}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
