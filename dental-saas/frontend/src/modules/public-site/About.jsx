import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function About() {
    useEffect(() => {
        document.title = "About Us | The DentalSaaS Story";
    }, []);
    return (
        <div className="bg-white">
            {/* Hero Section */}
            <section className="py-20 bg-slate-50">
                <div className="max-w-7xl mx-auto px-6 text-center">
                    <h1 className="text-5xl font-extrabold text-slate-900 mb-6">
                        Built by Dentists.<br />
                        <span className="text-blue-600">Designed for Growth.</span>
                    </h1>
                    <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
                        Our mission is to empower dental professionals with the most advanced,
                        secure, and intuitive digital tools to transform patient care and clinic efficiency.
                    </p>
                </div>
            </section>

            {/* Vision Section */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900 mb-6 font-sans">Our Vision</h2>
                        <p className="text-lg text-slate-600 leading-relaxed mb-6">
                            The future of dentistry is paperless, automated, and patient-centric.
                            We are building the foundation for that future, where clinical excellence
                            is supported by seamless administrative automation.
                        </p>
                        <p className="text-lg text-slate-600 leading-relaxed">
                            We believe that technology should never be a hurdle. That's why we focus
                            on creating a platform that feels natural to dentists, hygienists, and
                            receptionists alike.
                        </p>
                    </div>
                    <div className="bg-blue-600 rounded-3xl h-[400px] shadow-2xl overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-700 to-transparent opacity-50"></div>
                        <div className="absolute inset-0 flex items-center justify-center p-12">
                            <svg className="w-48 h-48 text-white/20" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>
                        </div>
                    </div>
                </div>
            </section>

            {/* Why DentalSaaS? */}
            <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]"></div>
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">Why DentalSaaS?</h2>
                        <p className="text-slate-400 text-lg">Engineered for the modern multi-branch enterprise.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-12 text-center">
                        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                            </div>
                            <h3 className="text-xl font-bold mb-3">Multi-Organization</h3>
                            <p className="text-slate-400">Scale from a single clinic to a global network with unified platform control.</p>
                        </div>
                        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <h3 className="text-xl font-bold mb-3">Secure & Scalable</h3>
                            <p className="text-slate-400">HIPAA compliant architecture built on enterprise-grade cloud infrastructure.</p>
                        </div>
                        <div className="p-8 rounded-2xl bg-white/5 border border-white/10 hover:border-blue-500/50 transition-colors">
                            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            </div>
                            <h3 className="text-xl font-bold mb-3">Built for Efficiency</h3>
                            <p className="text-slate-400">Automation at every step, from appointment booking to insurance claiming.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 text-center">
                <h2 className="text-3xl font-bold text-slate-900 mb-8">Ready to modernize your clinic?</h2>
                <Link to="/pricing" className="inline-flex items-center justify-center bg-blue-600 text-white px-10 py-4 rounded-full font-bold text-lg shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all hover:-translate-y-1">
                    Start Your Free Trial Today
                </Link>
            </section>
        </div>
    );
}
