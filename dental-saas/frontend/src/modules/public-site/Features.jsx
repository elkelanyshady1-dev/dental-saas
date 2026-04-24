import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from "@/config/brand";

export default function Features() {
    useEffect(() => {
        document.title = `Features | ${BRAND.name} Clinical Hub`;
    }, []);
    const categories = [
        {
            title: "Orthodontic Intelligence",
            icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z",
            items: [
                { label: "CephAI Tracing", desc: "AI-powered 32-point cephalometric landmark detection with automated angular and linear measurements." },
                { label: "3D Model Viewer", desc: "Interactive STL visualization with PointNet++ segmentation, Bolton analysis, and Curve of Spee measurement." },
                { label: "Treatment Planning", desc: "Multi-phase orthodontic plans with wire sequencing, appliance tracking, and visit milestone scheduling." },
                { label: "Clinical Snapshots", desc: "Event-driven photo capture system for tracking treatment progress with timestamped clinical records." }
            ]
        },
        {
            title: "Smart Practice Management",
            icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
            items: [
                { label: "Dynamic Calendar", desc: "Multi-doctor views with drag-and-drop scheduling optimized for orthodontic recall intervals." },
                { label: "WhatsApp Automations", desc: "Automated appointment reminders, follow-ups, and recall notifications via WhatsApp and SMS." },
                { label: "Patient Portal", desc: "Secure access for patients to view treatment progress, upcoming visits, and share clinical photos." },
                { label: "Recall Management", desc: "Intelligent recall system that tracks pending patient follow-ups and automates scheduling workflows." }
            ]
        },
        {
            title: "Enterprise Operations",
            icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
            items: [
                { label: "Multi-Clinic Sync", desc: "Unified patient records across all your orthodontic locations with tenant-isolated databases." },
                { label: "Financial Analytics", desc: "Deep insights into production, collection, and overhead with multi-currency support." },
                { label: "Staff RBAC", desc: "Granular role-based access for orthodontists, assistants, and admin staff — JWT-driven security." },
                { label: "Platform API", desc: "Connect OrthoNoe to your existing medical hardware and third-party systems." }
            ]
        }
    ];

    return (
        <div className="bg-white min-h-screen">
            {/* Hero */}
            <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]"></div>
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="text-center lg:text-left">
                            <h1 className="text-5xl font-black mb-6">Built for the future of <span className="text-blue-500 underline decoration-4 underline-offset-8">Orthodontics</span></h1>
                            <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">
                                A comprehensive suite of AI-powered clinical and administrative tools designed for orthodontists who demand precision, from cephalometric analysis to multi-phase treatment tracking.
                            </p>
                        </div>
                        <div className="hidden lg:block">
                            <div className="bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-6 shadow-2xl">
                                <img
                                    src="https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80"
                                    alt="Modern orthodontic treatment room with digital imaging"
                                    className="rounded-2xl w-full object-cover h-[320px]"
                                    loading="eager"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Categories Grid */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-6 space-y-24">
                    {categories.map((cat, idx) => (
                        <div key={idx}>
                            <div className="flex items-center gap-4 mb-12 pb-6 border-b border-slate-100">
                                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 text-blue-600">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={cat.icon} /></svg>
                                </div>
                                <h2 className="text-3xl font-extrabold text-slate-900">{cat.title}</h2>
                            </div>
                            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                                {cat.items.map((item, iidx) => (
                                    <div key={iidx} className="p-6 rounded-3xl bg-slate-50 border border-transparent hover:border-slate-200 transition-all hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 group">
                                        <h4 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{item.label}</h4>
                                        <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 bg-slate-50">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl font-bold text-slate-900 mb-8">Experience the power of OrthoNoe</h2>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link to="/pricing" className="bg-blue-600 text-white px-10 py-4 rounded-full font-bold shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition">
                            View Pricing & Plans
                        </Link>
                        <Link to="/contact" className="bg-white text-slate-700 border border-slate-200 px-10 py-4 rounded-full font-bold hover:bg-slate-50 transition">
                            Book a Free Demo
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
