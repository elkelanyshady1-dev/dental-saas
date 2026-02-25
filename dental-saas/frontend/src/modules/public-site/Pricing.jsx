import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Pricing() {
    useEffect(() => {
        document.title = "Pricing & Plans | DentalSaaS Platform";
    }, []);
    const [isAnnual, setIsAnnual] = useState(true);

    const plans = [
        {
            name: "Starter",
            description: "Perfect for new solo practices.",
            monthlyPrice: 99,
            annualPrice: 79,
            features: [
                "Up to 500 Patients",
                "Appointments & Calendar",
                "Basic Patient Records",
                "Email Notifications",
                "Single Branch",
                "Billing & Invoicing"
            ],
            cta: "Start Free Trial",
            highlight: false
        },
        {
            name: "Professional",
            description: "Advanced tools for growing clinics.",
            monthlyPrice: 199,
            annualPrice: 159,
            features: [
                "Unlimited Patients",
                "WhatsApp Reminders",
                "Insurance Module",
                "Orthodontic Module",
                "Lab Management",
                "E-Prescriptions",
                "Financial Analytics",
                "Up to 3 Branches"
            ],
            cta: "Get Started Now",
            highlight: true
        },
        {
            name: "Enterprise",
            description: "Custom solutions for large networks.",
            monthlyPrice: "Custom",
            annualPrice: "Custom",
            features: [
                "Everything in Professional",
                "Unlimited Branches",
                "Dedicated Account Manager",
                "Custom Feature Development",
                "White-label Option",
                "SLA Guarantee",
                "Data Migration Support",
                "API Access"
            ],
            cta: "Contact Sales",
            highlight: false
        }
    ];

    return (
        <div className="bg-slate-50 min-h-screen py-24 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h1 className="text-5xl font-extrabold text-slate-900 mb-6">
                        Simple Pricing for <span className="text-blue-600">Modern Clinics</span>
                    </h1>
                    <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                        Choose the plan that fits your practice's needs. All plans include a 14-day free trial.
                    </p>

                    {/* Toggle */}
                    <div className="mt-10 flex items-center justify-center gap-4">
                        <span className={`text-sm font-bold ${!isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>Monthly</span>
                        <button
                            onClick={() => setIsAnnual(!isAnnual)}
                            className="w-14 h-7 bg-slate-200 rounded-full relative p-1 transition-colors hover:bg-slate-300"
                        >
                            <div className={`w-5 h-5 bg-blue-600 rounded-full shadow-md transition-transform ${isAnnual ? 'translate-x-7' : 'translate-x-0'}`}></div>
                        </button>
                        <span className={`text-sm font-bold ${isAnnual ? 'text-slate-900' : 'text-slate-400'}`}>
                            Annually <span className="text-green-600 ml-1 text-xs bg-green-100 px-2 py-0.5 rounded-full">Save 20%</span>
                        </span>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-8 items-stretch">
                    {plans.map((plan, idx) => (
                        <div
                            key={idx}
                            className={`relative bg-white rounded-[32px] p-10 flex flex-col border transition-all duration-300 ${plan.highlight
                                ? 'border-blue-500 shadow-2xl shadow-blue-500/10 scale-105 z-10'
                                : 'border-slate-200 shadow-xl shadow-slate-200/50 hover:border-slate-300'
                                }`}
                        >
                            {plan.highlight && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-8">
                                <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                                <p className="text-slate-500 text-sm">{plan.description}</p>
                            </div>

                            <div className="mb-8">
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-extrabold text-slate-900">
                                        {typeof plan.annualPrice === 'number' ? `$${isAnnual ? plan.annualPrice : plan.monthlyPrice}` : plan.annualPrice}
                                    </span>
                                    {typeof plan.annualPrice === 'number' && (
                                        <span className="text-slate-500 font-medium">/month</span>
                                    )}
                                </div>
                                {typeof plan.annualPrice === 'number' && isAnnual && (
                                    <p className="text-green-600 text-xs font-bold mt-1">Billed annually</p>
                                )}
                            </div>

                            <ul className="space-y-4 mb-10 flex-1">
                                {plan.features.map((feature, fidx) => (
                                    <li key={fidx} className="flex items-start gap-3 text-slate-600 text-sm">
                                        <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                to={plan.name === "Enterprise" ? "/contact" : "/signup"}
                                className={`w-full py-4 rounded-2xl font-bold text-center transition-all ${plan.highlight
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700'
                                    : 'bg-slate-50 text-slate-900 hover:bg-slate-100 border border-slate-200'
                                    }`}
                            >
                                {plan.cta}
                            </Link>
                        </div>
                    ))}
                </div>

                <div className="mt-20 text-center">
                    <p className="text-slate-500 text-sm">
                        Have more than 50 clinics? <Link to="/contact" className="text-blue-600 font-bold hover:underline">Talk to our Enterprise team</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
