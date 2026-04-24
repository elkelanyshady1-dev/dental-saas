import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from "@/config/brand";

export default function About() {
    useEffect(() => {
        document.title = `About Us | The ${BRAND.name} Story`;
    }, []);
    return (
        <div className="bg-white">
            {/* Hero Section */}
            <section className="py-20 bg-slate-50">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <h1 className="text-5xl font-extrabold text-slate-900 mb-6">
                        Built by Orthodontists.<br />
                        <span className="text-blue-600">Designed for Precision.</span>
                    </h1>
                    <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                        Our mission is to empower orthodontic professionals with the most advanced,
                        AI-driven tools to transform treatment outcomes and clinical efficiency.
                    </p>
                </div>
            </section>

            {/* Vision Section */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900 mb-6 font-sans">Our Vision</h2>
                        <p className="text-lg text-slate-600 leading-relaxed mb-6">
                            The future of orthodontics is paperless, AI-augmented, and patient-centric.
                            We are building the foundation for that future, where clinical precision
                            is amplified by intelligent automation — from cephalometric AI to 3D model analysis.
                        </p>
                        <p className="text-lg text-slate-600 leading-relaxed">
                            We believe that technology should never be a hurdle. That's why we focus
                            on creating a platform that feels natural to orthodontists, clinical assistants,
                            and practice managers alike.
                        </p>
                    </div>
                    <div className="rounded-3xl h-[400px] shadow-2xl overflow-hidden relative group">
                        <img
                            src="https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&q=80"
                            alt="Orthodontist during a clinical consultation"
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-700/40 to-transparent" />
                    </div>
                </div>
            </section>

            {/* Why OrthoNoe? */}
            <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]"></div>
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">Why OrthoNoe?</h2>
                        <p className="text-slate-400 text-lg">Engineered for the modern multi-branch orthodontic enterprise.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-12 text-center">
                        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                            </div>
                            <h3 className="text-xl font-bold mb-3">Multi-Organization</h3>
                            <p className="text-slate-400">Scale from a single orthodontic office to a global network with unified platform control and database-per-tenant isolation.</p>
                        </div>
                        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </div>
                            <h3 className="text-xl font-bold mb-3">AI-Powered</h3>
                            <p className="text-slate-400">CephAI tracing, PointNet++ segmentation, and automated clinical measurements — clinical-grade ML in production.</p>
                        </div>
                        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-xl font-bold mb-3">Secure & Scalable</h3>
                            <p className="text-slate-400">HIPAA compliant, JWT-driven RBAC, zero-trust architecture built on enterprise-grade infrastructure.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 text-center">
                <h2 className="text-3xl font-bold text-slate-900 mb-8">Ready to modernize your orthodontic practice?</h2>
                <Link to="/pricing" className="inline-flex items-center justify-center bg-blue-600 text-white px-10 py-4 rounded-full font-bold text-lg shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all hover:-translate-y-1">
                    Start Your Free Trial Today
                </Link>
            </section>
        </div>
    );
}
