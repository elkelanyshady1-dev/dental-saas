import React, { useState } from 'react';
import { BRAND } from "@/config/brand";

export default function Contact() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        clinicName: '',
        message: ''
    });
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setSubmitted(true);
            setFormData({ name: '', email: '', clinicName: '', message: '' });
        }, 1500);
    };

    return (
        <div className="bg-slate-50 min-h-screen py-20 px-6">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Contact Our Team</h1>
                    <p className="text-lg text-slate-600">Have questions? We're here to help you get started.</p>
                </div>

                <div className="grid md:grid-cols-5 gap-12 items-start">
                    {/* Contact Info */}
                    <div className="md:col-span-2 space-y-8">
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                            <h3 className="text-xl font-bold text-slate-900 mb-6">Support Channels</h3>
                            <div className="space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">Email Support</p>
                                        <p className="text-blue-600 font-medium">
                                            <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">Sales Inquiry</p>
                                        <p className="text-slate-600 font-medium">+201507239258</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-600 p-8 rounded-3xl text-white shadow-xl shadow-blue-500/20">
                            <h3 className="text-xl font-bold mb-4">Enterprise?</h3>
                            <p className="text-blue-100 mb-6">Looking for multi-continent deployment and dedicated SLA? Let's talk about custom solutions.</p>
                            <button className="bg-white text-blue-600 px-6 py-2.5 rounded-full font-bold hover:bg-blue-50 transition-colors">
                                Contact Sales
                            </button>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="md:col-span-3 bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200">
                        {submitted ? (
                            <div className="text-center py-12">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-900 mb-2">Message Received!</h2>
                                <p className="text-slate-500 mb-8">Our team will get back to you within 24 hours.</p>
                                <button
                                    onClick={() => setSubmitted(false)}
                                    className="text-blue-600 font-bold hover:underline"
                                >
                                    Send another message
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700 ml-1">Full Name</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="John Doe"
                                            className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none border"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700 ml-1">Email Address</label>
                                        <input
                                            type="email"
                                            required
                                            placeholder="john@example.com"
                                            className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none border"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 ml-1">Clinic Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="OrthoNoe Orthodontics"
                                        className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none border"
                                        value={formData.clinicName}
                                        onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 ml-1">Your Message</label>
                                    <textarea
                                        required
                                        rows="4"
                                        placeholder="How can we help your orthodontic practice grow?"
                                        className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none border resize-none"
                                        value={formData.message}
                                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-70"
                                >
                                    {loading ? "Sending..." : "Send Message"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
