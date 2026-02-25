import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Features() {
    useEffect(() => {
        document.title = "Features | DentalSaaS Clinical Hub";
    }, []);
    const categories = [
        {
            title: "Clinical Excellence",
            icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.675.27a1 1 0 00-.573.743L10 18H2v2h8v-2h9.428l.572-2.572z",
            items: [
                { label: "Dental Charting", desc: "Interactive 3D charting for pediatric and adult patients." },
                { label: "Imaging Hub", desc: "DICOM support with high-res storage for X-rays and scans." },
                { label: "E-Prescriptions", desc: "Send prescriptions directly to patient pharmacies." },
                { label: "Treatment Plans", desc: "Create and track complex orthodontic and surgical plans." }
            ]
        },
        {
            title: "Smart Practice Management",
            icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
            items: [
                { label: "Dynamic Calendar", desc: "Multi-doctor views with drag-and-drop scheduling." },
                { label: "WhatsApp Automations", desc: "Automated reminders, follow-ups, and review requests." },
                { label: "Patient Portal", desc: "Secure access for patients to view history and pay bills." },
                { label: "Insurance Gateway", desc: "Direct electronic claims processing with major providers." }
            ]
        },
        {
            title: "Enterprise Operations",
            icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
            items: [
                { label: "Multi-Clinic Sync", desc: "Unified patient records across all your locations." },
                { label: "Financial Analytics", desc: "Deep insights into production, collection, and overhead." },
                { label: "Staff RBAC", desc: "Customized access levels for every role in your practice." },
                { label: "Platform API", desc: "Connect DentalSaaS to your existing medical hardware." }
            ]
        }
    ];

    return (
        <div className="bg-white min-h-screen">
            {/* Hero */}
            <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px]"></div>
                <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <h1 className="text-5xl font-black mb-6">Built for the future of <span className="text-blue-500 underline decoration-4 underline-offset-8">Dentistry</span></h1>
                    <p className="text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
                        A comprehensive suite of clinical and administrative tools designed to eliminate
                        inefficiencies and focus on what matters most: patient health.
                    </p>
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
                    <h2 className="text-3xl font-bold text-slate-900 mb-8">Experience the power of DentalSaaS</h2>
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
