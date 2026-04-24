/**
 * DoctorsPage — Stub.
 *
 * Wired so the "Doctors" tab in CalendarNavTabs has a real destination and
 * doesn't dead-end to a 404. The actual practitioner directory (search,
 * filters, dossier drawer) is tracked separately; this page exists so the
 * scheduling navigation feels complete on day one.
 */

import CalendarNavTabs from "@/components/nav/CalendarNavTabs";
import ComingSoon from "@/components/feedback/ComingSoon";

export default function DoctorsPage() {
    return (
        <div className="min-h-screen bg-[#f6f7fb]">
            <header className="px-8 h-16 flex items-center gap-8 border-b border-[#c3c6d7]/30 bg-white">
                <h1 className="text-lg font-semibold text-[#0f172a]">Calendar</h1>
                <CalendarNavTabs />
            </header>
            <ComingSoon
                title="Doctor Directory — Coming Soon"
                description="Practitioner profiles, schedules, and availability filters will live here. For now, manage doctors via Staff settings."
            />
        </div>
    );
}
