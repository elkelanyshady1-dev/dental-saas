/**
 * TabPlaceholder.jsx — Placeholder for tabs not yet implemented.
 * Provides a consistent "coming soon" UI for future tab modules.
 */
export default function TabPlaceholder({ tab, icon = "🔧" }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-black text-slate-800 mb-1">{tab}</h3>
      <p className="text-sm text-slate-400 max-w-xs">
        This module is part of the upcoming clinical workspace. Integration in progress.
      </p>
    </div>
  );
}
