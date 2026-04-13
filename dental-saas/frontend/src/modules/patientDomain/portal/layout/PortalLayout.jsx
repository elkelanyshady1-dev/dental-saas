import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
    HomeIcon,
    CalendarIcon,
    UserIcon,
    DocumentTextIcon,
    CurrencyDollarIcon,
    Bars3Icon,
    XMarkIcon,
    ArrowRightOnRectangleIcon,
    ChatBubbleLeftRightIcon,
    ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import { usePortalAuthContext } from '../context/PortalAuthContext';

const navigation = [
    { name: 'Dashboard', href: '/portal/dashboard', icon: HomeIcon },
    { name: 'My Appointments', href: '/portal/appointments', icon: CalendarIcon },
    { name: 'My Treatments', href: '/portal/treatments', icon: ClipboardDocumentListIcon },
    { name: 'Messages', href: '/portal/messages', icon: ChatBubbleLeftRightIcon },
    { name: 'Book Now', href: '/portal/booking', icon: CalendarIcon },
    { name: 'Invoices', href: '/portal/invoices', icon: CurrencyDollarIcon },
    { name: 'Medical Form', href: '/portal/medical-form', icon: DocumentTextIcon },
    { name: 'Profile', href: '/portal/profile', icon: UserIcon },
];

export default function PortalLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const navigate = useNavigate();
    const { logout } = usePortalAuthContext();

    const handleLogout = () => {
        logout();
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-xl">D</span>
                    </div>
                    <span className="font-bold text-lg text-slate-800 tracking-tight">DentalSaaS</span>
                </div>
                <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:text-blue-600 transition-colors">
                    <Bars3Icon className="w-6 h-6" />
                </button>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-50 flex md:hidden">
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
                    <div className="relative flex flex-col w-full max-w-[280px] bg-white h-full shadow-2xl animate-in slide-in-from-left duration-300">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <span className="font-bold text-slate-800">Patient Portal</span>
                            <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                            {navigation.map((item) => (
                                <NavLink
                                    key={item.name}
                                    to={item.href}
                                    onClick={() => setSidebarOpen(false)}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                                            ? 'bg-blue-50 text-blue-700 font-semibold shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`
                                    }
                                >
                                    <item.icon className="w-5 h-5" />
                                    {item.name}
                                </NavLink>
                            ))}
                        </nav>
                        <div className="p-4 border-t border-slate-100">
                            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                                <ArrowRightOnRectangleIcon className="w-5 h-5" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-white border-r border-slate-200 p-6 sticky top-0 h-screen overflow-y-auto">
                <div className="flex items-center gap-3 mb-10 px-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                        <span className="text-white font-bold text-2xl">D</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-extrabold text-xl text-slate-900 tracking-tight leading-none italic">DentalSaaS</span>
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">Patient Portal</span>
                    </div>
                </div>

                <nav className="flex-1 space-y-1.5">
                    {navigation.map((item) => (
                        <NavLink
                            key={item.name}
                            to={item.href}
                            className={({ isActive }) =>
                                `flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                    ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-100'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`
                            }
                        >
                            <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-900'}`} />
                            {item.name}
                        </NavLink>
                    ))}
                </nav>

                <div className="mt-auto pt-6 border-t border-slate-100">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3.5 px-4 py-3 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 w-full font-medium"
                    >
                        <ArrowRightOnRectangleIcon className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
                {/* Subtle background glow */}
                <div className="absolute top-0 right-0 -z-10 w-96 h-96 bg-blue-400/5 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-0 left-0 -z-10 w-96 h-96 bg-indigo-400/5 blur-[100px] rounded-full pointer-events-none" />

                <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 scroll-smooth">
                    <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}
