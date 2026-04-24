/**
 * CalendarNavTabs — Shared scheduling-family top-tab strip.
 *
 * Used by CalendarPage, AppointmentsPage, RecallCenterPage, DoctorsPage and
 * BranchesPage so the user has a consistent, real navigation row across
 * the whole "scheduling family" surface.
 *
 * Replaces the broken placeholder buttons that used to live inline in
 * CalendarPage.jsx (onClick={() => null}).
 *
 * Each tab is capability-gated — users without the relevant permission
 * never see that tab, matching the rest of the app's gating discipline.
 *
 * Active state is driven by react-router-dom's <NavLink>; matching is
 * prefix-aware via `end={false}` for nested routes.
 */

import { NavLink } from "react-router-dom";
import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";

const baseClass =
    "text-sm font-medium px-1 py-0.5 transition-colors border-b-2 border-transparent";
const idleClass =
    "text-[#434655] hover:text-[#004ac6]";
const activeClass =
    "text-[#004ac6] border-[#004ac6]";

function tabClassName({ isActive }) {
    return `${baseClass} ${isActive ? activeClass : idleClass}`;
}

export default function CalendarNavTabs({ className = "" }) {
    const canSeeAppointments = useCapability(P.APPOINTMENTS_READ);
    const canSeeRecalls = useCapability(P.RECALLS_READ);
    const canSeeBranches = useCapability(P.BRANCHES_READ);
    // No P.DOCTORS_READ exists — practitioner directory is gated under
    // users.read in the existing settings hub.
    const canSeeDoctors = useCapability(P.USERS_READ);

    return (
        <nav
            aria-label="Scheduling sections"
            className={`hidden md:flex items-center gap-6 ${className}`}
        >
            {canSeeAppointments && (
                <NavLink to="/org/calendar" end className={tabClassName}>
                    Calendar
                </NavLink>
            )}
            {canSeeAppointments && (
                <NavLink to="/org/appointments" end className={tabClassName}>
                    Appointments
                </NavLink>
            )}
            {canSeeRecalls && (
                <NavLink to="/org/recalls" className={tabClassName}>
                    Recalls
                </NavLink>
            )}
            {canSeeDoctors && (
                <NavLink to="/org/doctors" className={tabClassName}>
                    Doctors
                </NavLink>
            )}
            {canSeeBranches && (
                <NavLink to="/org/settings/branches" className={tabClassName}>
                    Branches
                </NavLink>
            )}
        </nav>
    );
}
