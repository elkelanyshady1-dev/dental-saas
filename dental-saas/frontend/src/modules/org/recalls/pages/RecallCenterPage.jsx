/**
 * RecallCenterPage — Org-plane recall management hub.
 *
 * Shares CalendarPage's visual shell (top bar with CalendarNavTabs +
 * filter/control bar + main content) so the user feels they're inside
 * the same scheduling family.
 *
 * Views: Day | Week | Month | List
 *   - Each view receives the same fetched slice; pure render functions.
 *   - Day/Week/Month range is derived from the date cursor via dateRange utils.
 *   - List view has no date constraint — uses a wide default window so users
 *     can search across the recent + upcoming pipeline.
 *
 * Mutations (per audit fixes #2, #3):
 *   - useUpdateRecallStatus is OPTIMISTIC (snapshot/apply/rollback/revalidate).
 *   - Convert flow uses the AWAITABLE async variant so we can show a partial-
 *     failure toast if the appointment is created but the recall flip fails.
 *   - Buttons are disabled during mutation to prevent double-clicks.
 */

import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useBranch } from "@/context/BranchContext";
import { usePractitioners } from "@/modules/org/staff/hooks/usePractitioners";
import { branchesApi } from "@/modules/org/branches/api/branches.api";
import { useQuery } from "@tanstack/react-query";
import { QK } from "@/lib/query";

import CalendarNavTabs from "@/components/nav/CalendarNavTabs";
import { useRecallsList, useUpdateRecallStatus, useUpdateRecallStatusAsync } from "../hooks/useRecalls";
import {
    dayRange,
    weekRange,
    monthRange,
    startOfLocalDayISO,
    endOfLocalDayISO,
} from "../utils/dateRange";

import RecallToolbar from "../components/RecallToolbar";
import RecallDayView from "../components/RecallDayView";
import RecallWeekView from "../components/RecallWeekView";
import RecallMonthView from "../components/RecallMonthView";
import RecallListView from "../components/RecallListView";
import CreateRecallDrawer from "../components/CreateRecallDrawer";
import CreateAppointmentDrawer from "@/modules/org/calendar/components/CreateAppointmentDrawer";

// List view default window — last 30 days through next 90 days.
function listDefaultRange() {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const end = new Date();
    end.setDate(end.getDate() + 90);
    return {
        startDate: startOfLocalDayISO(start),
        endDate: endOfLocalDayISO(end),
    };
}

function shiftDate(date, view, delta) {
    const d = new Date(date);
    if (view === "Day") d.setDate(d.getDate() + delta);
    else if (view === "Week") d.setDate(d.getDate() + 7 * delta);
    else if (view === "Month") d.setMonth(d.getMonth() + delta);
    return d.toISOString();
}

export default function RecallCenterPage() {
    const navigate = useNavigate();
    const { selectedBranches } = useBranch() || {};

    // ── Local state ───────────────────────────────────────────────────────────
    const [activeView, setActiveView] = useState("Day");
    const [date, setDate] = useState(() => new Date().toISOString());
    const [statusFilter, setStatusFilter] = useState(null);

    // Drawers
    const [showCreate, setShowCreate] = useState(false);
    const [convertSource, setConvertSource] = useState(null); // recall being converted
    const [appointmentInitial, setAppointmentInitial] = useState(null);

    // ── Date range per view ───────────────────────────────────────────────────
    const range = useMemo(() => {
        if (activeView === "Day") return dayRange(date);
        if (activeView === "Week") return weekRange(date);
        if (activeView === "Month") return monthRange(date);
        return listDefaultRange();
    }, [activeView, date]);

    // ── Branches + practitioners (for the chained CreateAppointmentDrawer) ───
    const { data: branchesRes } = useQuery({
        queryKey: QK.branches.lists(),
        queryFn: () => branchesApi.list(),
        staleTime: 60_000,
    });
    const branches = branchesRes?.data?.data?.branches || branchesRes?.data?.branches || [];
    const practitioners = usePractitioners();

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const { data: recalls, isLoading, isError, error } = useRecallsList({
        startDate: range.startDate,
        endDate: range.endDate,
        status: statusFilter || undefined,
        branchIds: selectedBranches,
    });

    // ── Mutations ─────────────────────────────────────────────────────────────
    const updateStatus = useUpdateRecallStatus();
    const updateStatusAsync = useUpdateRecallStatusAsync();
    const mutatingId = updateStatus.isPending ? updateStatus.variables?.id : null;

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleShiftDate = (delta) => setDate((d) => shiftDate(d, activeView, delta));

    const handleViewChange = (v) => setActiveView(v);

    const handleDrillToDay = (d) => {
        setDate(new Date(d).toISOString());
        setActiveView("Day");
    };

    const handleCancel = (recall) => {
        updateStatus.mutate(
            { id: recall._id, status: "cancelled" },
            {
                onSuccess: () => toast.success("Recall cancelled"),
                onError: () => toast.error("Failed to cancel recall"),
            }
        );
    };

    const handleConvert = (recall) => {
        // Pre-fill the existing CreateAppointmentDrawer with this recall's
        // patient + suggested date. PatientSearch expects { displayName, ... }
        // so we map name → displayName here (recall DTO uses { name }).
        setConvertSource(recall);
        setAppointmentInitial({
            initialSelection: {
                branchId: recall.branch?._id || null,
                startTime: recall.dueDate || new Date().toISOString(),
                endTime: null,
            },
            initialPatient: recall.patient
                ? {
                      _id: recall.patient._id,
                      displayName: recall.patient.name || "Patient",
                      phone: recall.patient.phone || null,
                      email: recall.patient.email || null,
                  }
                : null,
        });
    };

    const handleAppointmentCreated = async (appt) => {
        if (!convertSource) return;
        const id = convertSource._id;
        try {
            await updateStatusAsync.mutateAsync({ id, status: "booked" });
            toast.success("Recall booked");
        } catch (err) {
            // Appointment exists, recall flip failed — surface clearly so an
            // operator can finish the transition manually.
            toast.error(
                "Appointment created, but recall status not updated. Please mark the recall as booked manually."
            );
        } finally {
            setConvertSource(null);
            setAppointmentInitial(null);
        }
    };

    const handleAppointmentDrawerClose = () => {
        setConvertSource(null);
        setAppointmentInitial(null);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    const isFiltered = !!statusFilter;
    const showAppointmentDrawer = !!appointmentInitial;

    return (
        <div className="flex flex-col min-h-screen bg-[#f6f7fb]">
            {/* Top bar — matches CalendarPage shell */}
            <header className="h-16 flex justify-between items-center w-full px-8 bg-white/90 backdrop-blur-xl sticky top-0 z-40 border-b border-[#c3c6d7]/20">
                <div className="flex items-center gap-8">
                    <h1 className="text-xl font-headline font-extrabold tracking-tight text-[#004ac6]">
                        Calendar
                    </h1>
                    <CalendarNavTabs />
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate("/org/calendar/settings")}
                        title="Calendar Settings"
                        className="material-symbols-outlined text-[#434655] p-2 hover:bg-[#eceef0] rounded-full transition-colors"
                    >
                        settings
                    </button>
                </div>
            </header>

            <RecallToolbar
                activeView={activeView}
                onViewChange={handleViewChange}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                date={date}
                onShiftDate={handleShiftDate}
                onCreate={() => setShowCreate(true)}
            />

            <main className="flex-1">
                {isError && (
                    <div className="px-8 py-6">
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                            Failed to load recalls{error?.message ? `: ${error.message}` : ""}.
                        </div>
                    </div>
                )}
                {isLoading && !recalls && (
                    <div className="px-8 py-12 text-center text-sm text-[#737686]">
                        Loading recalls…
                    </div>
                )}
                {!isLoading && !isError && (
                    <>
                        {activeView === "Day" && (
                            <RecallDayView
                                recalls={recalls || []}
                                isFiltered={isFiltered}
                                onConvert={handleConvert}
                                onCancel={handleCancel}
                                onCreate={() => setShowCreate(true)}
                                mutatingId={mutatingId}
                            />
                        )}
                        {activeView === "Week" && (
                            <RecallWeekView
                                recalls={recalls || []}
                                weekStart={range.startDate}
                                isFiltered={isFiltered}
                                onDrillToDay={handleDrillToDay}
                                onConvert={handleConvert}
                                onCreate={() => setShowCreate(true)}
                            />
                        )}
                        {activeView === "Month" && (
                            <RecallMonthView
                                recalls={recalls || []}
                                cursor={date}
                                isFiltered={isFiltered}
                                onDrillToDay={handleDrillToDay}
                                onCreate={() => setShowCreate(true)}
                            />
                        )}
                        {activeView === "List" && (
                            <RecallListView
                                recalls={recalls || []}
                                isFiltered={isFiltered}
                                onConvert={handleConvert}
                                onCancel={handleCancel}
                                onCreate={() => setShowCreate(true)}
                                mutatingId={mutatingId}
                            />
                        )}
                    </>
                )}
            </main>

            {showCreate && (
                <CreateRecallDrawer
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        toast.success("Recall created");
                        setShowCreate(false);
                    }}
                />
            )}

            {showAppointmentDrawer && (
                <CreateAppointmentDrawer
                    branches={branches}
                    practitioners={practitioners.data || []}
                    initialSelection={appointmentInitial.initialSelection}
                    initialPatient={appointmentInitial.initialPatient}
                    onClose={handleAppointmentDrawerClose}
                    onCreated={handleAppointmentCreated}
                />
            )}
        </div>
    );
}
