import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query/queryClient";
import OrthoNoeLogo from "@/components/brand/OrthoNoeLogo";
import { BRAND } from "@/config/brand";


const NAV_LINKS = [
    { to: "/", label: "Home", exact: true },
    { to: "/features", label: "Features" },
    { to: "/pricing", label: "Pricing" },
    { to: "/about", label: "About Us" },
    { to: "/contact", label: "Contact" }
];

function NavLink({ to, label, exact, onClick }) {
    const { pathname } = useLocation();
    const isActive = exact ? pathname === to : pathname.startsWith(to) && to !== "/";
    const active = exact ? pathname === to : isActive;

    return (
        <Link
            to={to}
            onClick={onClick}
            className={`relative font-semibold text-[15px] transition-colors hover:text-blue-600 ${active ? "text-blue-600" : "text-slate-500"
                }`}
        >
            {label}
            {/* Active underline indicator */}
            {active && (
                <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-blue-600" />
            )}
        </Link>
    );
}

export default function PublicLayout() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <div
            className="min-h-screen font-sans text-slate-800 bg-slate-50 flex flex-col"
            style={{ scrollBehavior: "smooth" }}
        >
            {/* ── Sticky Navigation ── */}
            <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200/80">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">

                    {/* Brand Logo */}
                    <Link to="/" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity">
                        <OrthoNoeLogo className="w-9 h-9" />
                        <span className="text-lg font-bold text-blue-600 tracking-tight">{BRAND.name}</span>
                    </Link>

                    {/* Desktop Navigation — increased gap */}
                    <nav className="hidden md:flex gap-9 font-semibold text-[15px]" aria-label="Main navigation">
                        {NAV_LINKS.map((link) => (
                            <NavLink key={link.to} {...link} />
                        ))}
                    </nav>

                    {/* Mobile Menu Toggle */}
                    <div className="md:hidden flex items-center">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            aria-label="Toggle navigation menu"
                            aria-expanded={isMenuOpen}
                        >
                            {isMenuOpen
                                ? <X className="w-5 h-5" />
                                : <Menu className="w-5 h-5" />
                            }
                        </button>
                    </div>

                    {/* Desktop CTA Buttons */}
                    <div className="hidden md:flex items-center gap-4">
                        <Link
                            to="/login"
                            className="text-[14px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
                        >
                            Clinic Login
                        </Link>
                        <Link
                            to="/signup"
                            className="text-[14px] font-bold bg-blue-600 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all active:scale-95"
                        >
                            Sign Up Free
                        </Link>
                    </div>
                </div>

                {/* Mobile Navigation Dropdown */}
                {isMenuOpen && (
                    <div className="md:hidden bg-white border-t border-slate-100 py-6 px-4 space-y-4 shadow-xl">
                        <nav className="flex flex-col gap-1 text-base font-bold text-slate-600" aria-label="Mobile navigation">
                            {NAV_LINKS.map((link) => (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    className="hover:text-blue-600 px-4 py-3 hover:bg-slate-50 rounded-xl transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                        <hr className="border-slate-100" />
                        <div className="flex flex-col gap-3">
                            <Link
                                to="/login"
                                onClick={() => setIsMenuOpen(false)}
                                className="text-center font-bold text-slate-600 py-3 hover:bg-slate-50 rounded-xl transition-colors"
                            >
                                Clinic Login
                            </Link>
                            <Link
                                to="/signup"
                                onClick={() => setIsMenuOpen(false)}
                                className="text-center font-black bg-blue-600 text-white py-4 rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all"
                            >
                                Sign Up Free
                            </Link>
                        </div>
                    </div>
                )}
            </header>

            {/* Page Content */}
            <main className="flex-1 flex flex-col">
                <QueryClientProvider client={queryClient}>
                    <Outlet />
                </QueryClientProvider>
            </main>

            {/* ── Footer ── */}
            <footer className="bg-slate-900 border-t border-slate-800 pt-20 pb-12 text-slate-500">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">

                        {/* Brand column */}
                        <div className="col-span-2 md:col-span-1">
                            <div className="flex items-center gap-2.5 mb-5 text-white text-lg font-bold">
                                <OrthoNoeLogo className="w-8 h-8" variant="mono-light" />
                                {BRAND.name}
                            </div>
                            <p className="text-sm leading-relaxed text-slate-500 max-w-xs">
                                The operating system for modern orthodontics — from solo practices to global orthodontic networks.
                            </p>
                        </div>

                        {/* Product column */}
                        <div>
                            <h4 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Product</h4>
                            <ul className="space-y-4 text-sm">
                                {[
                                    { to: "/features", label: "Features" },
                                    { to: "/pricing", label: "Pricing" },
                                    { to: "/contact", label: "Request Demo" },
                                    { to: "/terms", label: "Terms of Service" }
                                ].map(({ to, label }) => (
                                    <li key={to}>
                                        <Link to={to} className="text-slate-500 hover:text-slate-200 transition-colors duration-200">
                                            {label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Company column */}
                        <div>
                            <h4 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Company</h4>
                            <ul className="space-y-4 text-sm">
                                {[
                                    { to: "/about", label: "About Us" },
                                    { to: "/contact", label: "Contact Support" },
                                    { to: "/privacy", label: "Privacy Policy" }
                                ].map(({ to, label }) => (
                                    <li key={to}>
                                        <Link to={to} className="text-slate-500 hover:text-slate-200 transition-colors duration-200">
                                            {label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Access column */}
                        <div>
                            <h4 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Access</h4>
                            <ul className="space-y-4 text-sm">
                                <li>
                                    <Link to="/login" className="text-blue-400 hover:text-blue-300 font-bold transition-colors duration-200">
                                        Clinic Dashboard
                                    </Link>
                                </li>
                                <li>
                                    <Link to="/signup" className="text-slate-500 hover:text-slate-200 transition-colors duration-200">
                                        Create Account
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom bar */}
                    <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                        <p className="text-xs text-slate-600 tracking-wider font-medium uppercase">
                            {BRAND.copyright}
                        </p>

                        {/* Social links — circular hover */}
                        <div className="flex items-center gap-3" aria-label="Social media">
                            {[
                                { href: "https://twitter.com", label: "Twitter", initial: "𝕏" },
                                { href: "https://linkedin.com", label: "LinkedIn", initial: "in" },
                                { href: "https://facebook.com", label: "Facebook", initial: "f" }
                            ].map(({ href, label, initial }) => (
                                <a
                                    key={label}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={label}
                                    className="w-8 h-8 rounded-full bg-slate-800 hover:bg-blue-600 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 text-xs font-bold hover:scale-110"
                                >
                                    {initial}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
