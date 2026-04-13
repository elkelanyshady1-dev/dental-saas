/**
 * PortalDashboard.jsx — Patient Portal Dashboard (Phase 6: Real Data)
 *
 * Replaces all mock data with live API calls via portalApiService.
 * Fetches: /patient/portal/dashboard (composite projection)
 *
 * Route: /portal/dashboard
 * Guard: PortalAuthGuard
 */
import React, { useState, useEffect } from 'react';
import {
    CalendarIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
    ArrowRightIcon,
    PlusCircleIcon
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { portalApiService } from '../api/portal.api';

export default function PortalDashboard() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        portalApiService.getMe()
            .then(res => {
                const d = res?.data || res;
                setData(d);
            })
            .catch(err => {
                setError(err?.message || "Failed to load dashboard");
            })
            .finally(() => setLoading(false));
    }, []);

    // Safely extract data
    const nextAppointment = data?.nextAppointment || data?.appointments?.[0] || null;
    const financial = data?.financial || {};
    const patientName = data?.patient?.nameArabic || data?.patient?.nameEnglish || data?.name || "Patient";

    const stats = [
        {
            name: 'Upcoming Appointments',
            value: data?.upcomingAppointmentsCount ?? nextAppointment ? '1' : '0',
            icon: CalendarIcon,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        {
            name: 'Due Balance',
            value: financial?.remainingBalance != null
                ? `$${Number(financial.remainingBalance).toFixed(2)}`
                : '—',
            icon: CurrencyDollarIcon,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50'
        },
        {
            name: 'Medical Forms',
            value: data?.medicalFormsComplete ? 'Complete' : 'Pending',
            icon: DocumentTextIcon,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
                <p className="text-red-600 font-semibold">{error}</p>
                <button onClick={() => window.location.reload()} className="mt-4 text-sm text-red-500 hover:underline">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Header Section */}
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Marhaba, {patientName}! 👋</h2>
                    <p className="text-slate-500 font-medium">Welcome back to your health portal. Here's what's happening today.</p>
                </div>
                <button
                    onClick={() => navigate('/portal/booking')}
                    className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-bold shadow-xl shadow-blue-200 transition-all hover:-translate-y-1 active:scale-95 overflow-hidden relative"
                >
                    <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 skew-x-12" />
                    <PlusCircleIcon className="w-6 h-6" />
                    <span>Book an Appointment</span>
                </button>
            </section>

            {/* Quick Stats Grid */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat) => (
                    <div key={stat.name} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.name}</p>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </section>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Upcoming Appointment Card */}
                <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-slate-50">
                        <h3 className="text-xl font-bold text-slate-900">Immediate Schedule</h3>
                    </div>
                    <div className="p-8 flex-1 flex flex-col justify-center gap-6">
                        {nextAppointment ? (
                            <>
                                <div className="flex gap-6 items-center">
                                    <div className="flex flex-col items-center bg-blue-50 text-blue-600 px-5 py-4 rounded-2xl border border-blue-100 min-w-[80px]">
                                        <span className="text-sm font-black uppercase">
                                            {nextAppointment.startTime
                                                ? new Date(nextAppointment.startTime).toLocaleDateString("en", { month: "short" })
                                                : "—"}
                                        </span>
                                        <span className="text-3xl font-black">
                                            {nextAppointment.startTime
                                                ? new Date(nextAppointment.startTime).getDate()
                                                : "—"}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-black text-slate-900 text-lg">
                                            {nextAppointment.type || nextAppointment.treatmentType || "Dental Appointment"}
                                        </p>
                                        <p className="text-slate-500 font-bold">
                                            {nextAppointment.startTime
                                                ? new Date(nextAppointment.startTime).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })
                                                : ""}
                                            {nextAppointment.branchId?.name ? ` • ${nextAppointment.branchId.name}` : ""}
                                        </p>
                                        <p className="text-slate-400 text-sm font-bold">
                                            With Dr. {nextAppointment.doctorId?.name || nextAppointment.doctorId?.firstName || "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-500">Status</span>
                                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
                                            {nextAppointment.status || "Confirmed"}
                                        </span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-6">
                                <CalendarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 font-bold">No upcoming appointments</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => navigate('/portal/appointments')}
                        className="w-full py-5 bg-slate-900 text-white font-black hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 group"
                    >
                        Manage Appointment
                        <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                </section>

                {/* Financial Overview */}
                <section className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8 space-y-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Financial Overview</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest italic">Summary</p>
                        </div>
                        <CurrencyDollarIcon className="w-8 h-8 text-slate-200" />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                            <span className="text-slate-500 font-bold">Total Invoiced</span>
                            <span className="font-black text-slate-900">
                                ${Number(financial.totalInvoiced || 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <span className="text-emerald-600 font-bold">Paid to Date</span>
                            <span className="font-black text-emerald-700">
                                ${Number(financial.totalPaid || 0).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between p-5 bg-blue-600 rounded-2xl shadow-lg shadow-blue-100">
                            <span className="text-white font-bold">Remaining Balance</span>
                            <span className="font-black text-white text-xl">
                                ${Number(financial.remainingBalance || 0).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    <p className="text-xs text-slate-400 text-center font-medium">Payments are processed securely via verified healthcare gateways.</p>
                </section>

            </div>
        </div>
    );
}
