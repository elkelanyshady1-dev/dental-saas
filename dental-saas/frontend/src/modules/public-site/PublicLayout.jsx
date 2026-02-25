import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

export default function PublicLayout() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <div className="min-h-screen font-sans text-slate-800 bg-slate-50 flex flex-col">
            {/* Sticky Navigation Bar */}
            <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">

                    {/* Brand Logo */}
                    <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                            {/* Medical Cross / Shield Icon */}
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="text-xl font-bold text-blue-600 tracking-tight">
                            DentalSaaS
                        </span>
                    </Link>

                    {/* Navigation Links */}
                    <nav className="hidden md:flex gap-8 font-semibold text-[15px] text-slate-500">
                        <Link to="/" className="hover:text-blue-600 transition-colors">Home</Link>
                        <Link to="/features" className="hover:text-blue-600 transition-colors">Features</Link>
                        <Link to="/pricing" className="hover:text-blue-600 transition-colors">Pricing</Link>
                        <Link to="/about" className="hover:text-blue-600 transition-colors">About Us</Link>
                        <Link to="/contact" className="hover:text-blue-600 transition-colors">Contact</Link>
                    </nav>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="Toggle navigation menu"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>

                    {/* CTA Buttons (Desktop) */}
                    <div className="hidden md:flex items-center gap-4">
                        <Link to="/login" className="text-[15px] font-bold text-slate-600 hover:text-blue-600 transition-colors">
                            Clinic Login
                        </Link>
                        <Link to="/platform/login" className="text-[15px] font-bold text-slate-600 hover:text-blue-600 transition-colors">
                            Platform Login
                        </Link>
                        <Link to="/signup" className="text-[15px] font-bold bg-blue-600 text-white px-6 py-2.5 rounded-full shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-95">
                            Sign Up
                        </Link>
                    </div>
                </div>

                {/* Mobile Navigation Dropdown */}
                {isMenuOpen && (
                    <div className="md:hidden bg-white border-t border-slate-100 py-6 px-4 space-y-4 shadow-xl animate-in fade-in slide-in-from-top-4">
                        <nav className="flex flex-col gap-4 text-lg font-bold text-slate-600">
                            <Link to="/" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors">Home</Link>
                            <Link to="/features" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors">Features</Link>
                            <Link to="/pricing" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors">Pricing</Link>
                            <Link to="/about" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors">About Us</Link>
                            <Link to="/contact" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-600 px-4 py-2 hover:bg-slate-50 rounded-xl transition-colors">Contact</Link>
                        </nav>
                        <hr className="border-slate-100" />
                        <div className="flex flex-col gap-3">
                            <Link to="/login" onClick={() => setIsMenuOpen(false)} className="text-center font-bold text-slate-600 py-3 hover:bg-slate-50 rounded-xl transition-colors">Clinic Login</Link>
                            <Link to="/platform/login" onClick={() => setIsMenuOpen(false)} className="text-center font-bold text-slate-600 py-3 hover:bg-slate-50 rounded-xl transition-colors">Platform Login</Link>
                            <Link to="/signup" onClick={() => setIsMenuOpen(false)} className="text-center font-black bg-blue-600 text-white py-4 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all">Sign Up</Link>
                        </div>
                    </div>
                )}
            </header>

            {/* Public Layout Outlet */}
            <main className="flex-1 flex flex-col">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="bg-slate-900 border-t border-slate-800 pt-20 pb-10 text-slate-400">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
                        <div className="col-span-2 md:col-span-1">
                            <div className="flex items-center gap-2 mb-6 text-white text-xl font-bold">
                                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </div>
                                DentalSaaS
                            </div>
                            <p className="text-sm leading-relaxed max-w-xs">
                                The ultimate operating system for modern dental practices. From solo clinics to global networks.
                            </p>
                        </div>
                        <div>
                            <h4 className="text-white font-bold mb-6">Product</h4>
                            <ul className="space-y-4 text-sm">
                                <li><Link to="/features" className="hover:text-white transition-colors">Features</Link></li>
                                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                                <li><Link to="/#testimonials" className="hover:text-white transition-colors">Testimonials</Link></li>
                                <li><Link to="/contact" className="hover:text-white transition-colors">Request Demo</Link></li>
                                <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-bold mb-6">Company</h4>
                            <ul className="space-y-4 text-sm">
                                <li><Link to="/about" className="hover:text-white transition-colors">About Us</Link></li>
                                <li><Link to="/contact" className="hover:text-white transition-colors">Contact Support</Link></li>
                                <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-bold mb-6">Access</h4>
                            <ul className="space-y-4 text-sm">
                                <li><Link to="/login" className="hover:text-white transition-colors text-blue-400 font-bold">Clinic Dashboard</Link></li>
                                <li><Link to="/platform/login" className="hover:text-white transition-colors text-slate-500 font-bold">Platform Admin</Link></li>
                                <li><Link to="/signup" className="hover:text-white transition-colors">Create Account</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="pt-10 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 text-xs tracking-wider uppercase font-medium">
                        <p>&copy; {new Date().getFullYear()} DentalSaaS Platform Inc. All rights reserved.</p>
                        <div className="flex gap-8">
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" aria-label="Twitter">Twitter</a>
                            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" aria-label="LinkedIn">LinkedIn</a>
                            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" aria-label="Facebook">Facebook</a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
