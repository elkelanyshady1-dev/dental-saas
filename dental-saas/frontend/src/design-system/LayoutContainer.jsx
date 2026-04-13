/**
 * LayoutContainer (Design System v2.0)
 * Wraps the Organization dashboard in a floating glass container
 * on a deep blue gradient backdrop. Applied ONLY to org routes.
 */
export default function LayoutContainer({ children }) {
    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-indigo-900 via-blue-900 to-sky-800 flex items-center justify-center relative overflow-hidden">
            {/* Ambient glow orbs (background decoration) */}
            <div className="absolute top-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-blue-500/20 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-100px] left-[200px] w-[400px] h-[400px] rounded-full bg-cyan-500/15 blur-[100px] pointer-events-none" />
            <div className="absolute top-[30%] left-[-150px] w-[300px] h-[300px] rounded-full bg-indigo-400/10 blur-[80px] pointer-events-none" />

            {/* Full-width Dashboard Container */}
            <div className="relative w-full h-screen bg-white/85 backdrop-blur-xl shadow-2xl border border-white/50 overflow-hidden flex flex-col">
                {children}
            </div>
        </div>
    );
}
