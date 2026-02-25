import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";

export default function Home() {
    const [siteContent, setSiteContent] = useState({
        heroTitle: "The Smart Dental Platform for Modern Clinics",
        heroSubtitle: "Secure, scalable, and designed for dental professionals.",
        aboutTitle: "Empowering Dental Clinics with Smart Solutions",
        aboutDescription: "DentalSaaS provides everything you need to manage your practice securely.",
        whatsappNumber: "+1234567890",
        supportEmail: "support@dentalsaas.com"
    });

    useEffect(() => {
        document.title = "DentalSaaS | The Modern Operating System for Dentistry";
        api.get("/public/site-content")
            .then(res => {
                if (res.data.success) {
                    setSiteContent(prev => ({ ...prev, ...res.data.data }));
                }
            })
            .catch(console.error);
    }, []);

    return (
        <div className="flex flex-col flex-1 bg-white">
            {/* HERO SECTION */}
            <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-slate-50 pt-24 pb-32">
                <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-blue-400/10 rounded-full blur-[120px] -z-10 translate-x-1/3 -translate-y-1/3"></div>
                <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
                    <div className="space-y-8">
                        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-bold tracking-tight">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                            </span>
                            v2.4 Just Released
                        </div>
                        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
                            The OS for <br />
                            <span className="text-blue-600">Modern Dentistry</span>
                        </h1>
                        <p className="text-xl text-slate-600 leading-relaxed max-w-lg">
                            {siteContent.heroSubtitle}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <Link to="/signup" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold transition shadow-xl shadow-blue-500/20 active:scale-95 text-center">
                                Start Your Free Trial
                            </Link>
                            <Link to="/about" className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-2xl font-bold transition shadow-sm active:scale-95 text-center">
                                See How It Works
                            </Link>
                        </div>
                    </div>
                    <div className="relative hidden lg:block">
                        <div className="bg-white p-2 rounded-[2.5rem] shadow-2xl border border-slate-100 rotate-2 hover:rotate-0 transition-transform duration-500">
                            <img
                                src="https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=1000&q=80"
                                alt="DentalSaaS Dashboard Preview showing smart scheduling and analytics"
                                className="rounded-[2rem] w-full shadow-inner"
                                fetchpriority="high"
                            />
                        </div>
                        <div className="absolute -bottom-6 -left-6 bg-blue-600 p-6 rounded-3xl shadow-xl text-white transform -rotate-3">
                            <div className="text-3xl font-black">99.9%</div>
                            <div className="text-xs font-bold uppercase tracking-wider opacity-80">Uptime Guaranteed</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FEATURES GRID */}
            <section id="features" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Everything your clinic needs</h2>
                        <p className="text-slate-500">Built for scale, security, and simplicity.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { title: "Smart Scheduling", desc: "Drag-and-drop calendar with automated WhatsApp reminders.", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                            { title: "Patient Records", desc: "Full history, prescriptions, and high-res imaging storage.", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
                            { title: "Enterprise Billing", desc: "Global tax compliance, insurance claims, and multi-currency.", icon: "M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" },
                            { title: "Lab Management", desc: "Seamless workflow between your clinic and dental labs.", icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.675.27a1 1 0 00-.573.743L10 18H2v2h8v-2h9.428l.572-2.572z" },
                            { title: "Staff Roles", desc: "Granular RBAC for dentists, receptionists, and assistant staff.", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
                            { title: "Multi-Clinic", desc: "Manage 100+ branches from a single unified platform.", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" }
                        ].map((f, i) => (
                            <div key={i} className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors group">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={f.icon} /></svg>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">{f.title}</h3>
                                <p className="text-slate-500 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* SCALE SECTION / TESTIMONIALS EQUIVALENT */}
            <section id="testimonials" className="py-24 bg-slate-900 overflow-hidden relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_rgba(37,99,235,0.05)_0,_transparent_70%)]"></div>
                <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <h2 className="text-4xl font-black text-white mb-6">Designed to scale with you.</h2>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-12">
                        Whether you're starting your first practice or managing an international dental group, DentalSaaS provides the infrastructure you need to thrive.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <div>
                            <div className="text-4xl font-black text-white mb-1">500+</div>
                            <div className="text-xs font-bold uppercase text-blue-500 tracking-widest">Clinics Online</div>
                        </div>
                        <div>
                            <div className="text-4xl font-black text-white mb-1">2M+</div>
                            <div className="text-xs font-bold uppercase text-blue-500 tracking-widest">Appointments</div>
                        </div>
                        <div>
                            <div className="text-4xl font-black text-white mb-1">15+</div>
                            <div className="text-xs font-bold uppercase text-blue-500 tracking-widest">Countries</div>
                        </div>
                        <div>
                            <div className="text-4xl font-black text-white mb-1">99%</div>
                            <div className="text-xs font-bold uppercase text-blue-500 tracking-widest">Satisfaction</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FINAL CTA */}
            <section className="py-32 bg-white text-center">
                <h2 className="text-4xl font-black text-slate-900 mb-8">Ready to transform your practice?</h2>
                <div className="flex flex-col sm:flex-row justify-center gap-4 px-6 md:px-0">
                    <Link to="/signup" className="bg-blue-600 text-white px-12 py-5 rounded-full font-bold text-lg shadow-2xl shadow-blue-500/40 hover:bg-blue-700 transition-all hover:-translate-y-1 text-center">
                        Get Started Free
                    </Link>
                </div>
                <p className="text-slate-400 mt-6 font-medium">No credit card required for 14-day trial.</p>
            </section>
        </div>
    );
}
