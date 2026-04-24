import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

// ─── Privacy Content ───────────────────────────────────────────────────────────
const sections = [
    {
        id: "introduction",
        title: "1. Introduction",
        content: `This Privacy Policy explains how OrthoNoe ("we", "our", "us") collects, uses, stores, and protects your information when you use our orthodontic practice management platform. We are committed to maintaining the highest standards of data privacy and security for dental professionals and their patients.`
    },
    {
        id: "data-collection",
        title: "2. Data We Collect",
        list: [
            "Account information: name, email, phone number, professional credentials",
            "Organization data: clinic name, address, branch configuration",
            "Clinical records: patient information, treatment plans, imaging data (X-rays, cephalometric scans, 3D models)",
            "Usage analytics: feature usage patterns, error logs, performance metrics (anonymized)",
            "Payment information: billing details processed securely through our payment providers"
        ],
        prefix: "We collect the following categories of information:"
    },
    {
        id: "data-usage",
        title: "3. How We Use Your Data",
        list: [
            "Providing and maintaining the OrthoNoe platform services",
            "Processing payments and managing subscriptions",
            "Improving platform features, performance, and user experience",
            "Communicating service updates, security alerts, and support responses",
            "Ensuring compliance with legal obligations and regulatory requirements"
        ],
        prefix: "Your data is used exclusively for:"
    },
    {
        id: "data-storage",
        title: "4. Data Storage & Security",
        content: `All data is stored using industry-leading cloud infrastructure with AES-256 encryption at rest and TLS 1.3 in transit. We employ a database-per-tenant architecture ensuring complete data isolation between organizations. Access to production systems is restricted through zero-trust security controls with JWT-based authentication and controller-level RBAC enforcement.`
    },
    {
        id: "data-sharing",
        title: "5. Data Sharing",
        content: `We do NOT sell, trade, or rent your personal or clinical data to third parties. Data is shared only with: (a) your authorized team members within your organization, (b) essential infrastructure providers (cloud hosting, payment processing) under strict data processing agreements, and (c) law enforcement when required by valid legal process.`
    },
    {
        id: "patient-data",
        title: "6. Patient Data Responsibility",
        content: `Clinics using OrthoNoe are the data controllers for patient information. You are responsible for obtaining valid patient consent, maintaining data accuracy, and complying with applicable health data regulations (including HIPAA, GDPR, and local healthcare privacy laws). OrthoNoe acts as a data processor and handles patient data solely in accordance with your instructions and these Terms.`
    },
    {
        id: "data-retention",
        title: "7. Data Retention",
        list: [
            "Active accounts: data is retained for the duration of your subscription",
            "Cancelled accounts: data is retained for 90 days post-cancellation, then permanently deleted",
            "Audit logs: retained for 2 years for compliance and forensic purposes",
            "You may request a complete data export at any time from your account settings"
        ]
    },
    {
        id: "your-rights",
        title: "8. Your Rights",
        list: [
            "Access: request a copy of all data we hold about you",
            "Rectification: request correction of inaccurate data",
            "Erasure: request deletion of your data (subject to legal retention requirements)",
            "Portability: receive your data in a structured, machine-readable format",
            "Objection: object to specific data processing activities"
        ],
        prefix: "Under applicable data protection laws, you have the right to:"
    },
    {
        id: "cookies",
        title: "9. Cookies & Tracking",
        content: `OrthoNoe uses essential cookies required for platform functionality (authentication, session management). We do not use third-party tracking cookies or advertising pixels. Analytics data is collected in anonymized, aggregated form and cannot be used to identify individual users or patients.`
    },
    {
        id: "children",
        title: "10. Children's Privacy",
        content: `OrthoNoe is designed for use by licensed professionals and authorized staff. We do not knowingly collect personal information from individuals under the age of 18. Patient records for minors are managed under the responsibility of the treating clinic in compliance with applicable regulations.`
    },
    {
        id: "changes",
        title: "11. Changes to This Policy",
        content: `We may update this Privacy Policy from time to time. Material changes will be communicated via email or in-platform notification at least 30 days before they take effect. Continued use of the platform constitutes acceptance of the updated policy.`
    },
    {
        id: "contact",
        title: "12. Contact",
        content: `For privacy-related inquiries or to exercise your data rights, please contact us:`,
        contactInfo: {
            email: "privacy@orthonoe.com",
            subject: "Privacy Policy Inquiry"
        }
    }
];

// ─── Scroll Spy Hook ───────────────────────────────────────────────────────────
function useScrollSpy(ids, offset = 120) {
    const [activeId, setActiveId] = useState(ids[0]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length > 0) {
                    visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                    setActiveId(visible[0].target.id);
                }
            },
            { rootMargin: `-${offset}px 0px -60% 0px`, threshold: 0.1 }
        );

        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [ids, offset]);

    return activeId;
}

// ─── Sidebar Nav Item ──────────────────────────────────────────────────────────
function SidebarNavItem({ id, title, isActive, onClick }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                    ? "bg-blue-50 text-blue-700 font-semibold shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
        >
            {title}
        </button>
    );
}

// ─── Section Block ─────────────────────────────────────────────────────────────
function SectionBlock({ section }) {
    return (
        <section id={section.id} className="scroll-mt-28">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 sm:p-10 hover:shadow-md transition-shadow duration-300">
                <h2 className="text-2xl font-semibold text-slate-900 mb-6 tracking-tight">
                    {section.title}
                </h2>

                {section.prefix && (
                    <p className="text-slate-700 font-medium mb-4 leading-relaxed">
                        {section.prefix}
                    </p>
                )}

                {section.content && (
                    <p className="text-slate-600 leading-relaxed text-[15px]">
                        {section.content}
                    </p>
                )}

                {section.list && (
                    <ul className="space-y-3 mt-2">
                        {section.list.map((item, i) => (
                            <li key={i} className="flex items-start gap-3 text-slate-600 text-[15px] leading-relaxed">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                )}

                {section.contactInfo && (
                    <div className="mt-6 bg-blue-50/60 rounded-xl p-6 border border-blue-100">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-800">Privacy Team</p>
                                <a
                                    href={`mailto:${section.contactInfo.email}?subject=${encodeURIComponent(section.contactInfo.subject)}`}
                                    className="text-blue-600 font-semibold hover:underline text-sm"
                                >
                                    {section.contactInfo.email}
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PrivacyPage() {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const mobileNavRef = useRef(null);

    useEffect(() => {
        document.title = "Privacy Policy | OrthoNoe";
    }, []);

    const sectionIds = useMemo(() => sections.map((s) => s.id), []);
    const activeId = useScrollSpy(sectionIds);

    const scrollTo = useCallback((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setMobileNavOpen(false);
        }
    }, []);

    useEffect(() => {
        function handleClick(e) {
            if (mobileNavRef.current && !mobileNavRef.current.contains(e.target)) {
                setMobileNavOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <div className="min-h-screen bg-slate-50">

            {/* ── Hero Section ── */}
            <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pt-20 pb-16">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/8 rounded-full blur-[140px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/6 rounded-full blur-[120px] pointer-events-none" />

                <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-emerald-300 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase mb-6 border border-white/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Privacy
                    </div>

                    <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">
                        Privacy Policy
                    </h1>
                    <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-4">
                        How OrthoNoe protects your practice data, your patients' privacy, and your trust.
                    </p>
                    <p className="text-sm text-slate-500 font-medium">
                        Effective Date: April 21, 2026
                    </p>
                </div>
            </section>

            {/* ── Main Content Grid ── */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">

                {/* Mobile Navigation */}
                <div className="lg:hidden mb-6" ref={mobileNavRef}>
                    <button
                        onClick={() => setMobileNavOpen(!mobileNavOpen)}
                        className="w-full flex items-center justify-between bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                            Navigate Sections
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${mobileNavOpen ? "rotate-180" : ""}`} />
                    </button>

                    {mobileNavOpen && (
                        <div className="mt-2 bg-white rounded-xl shadow-lg border border-slate-200 p-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200 max-h-[60vh] overflow-y-auto">
                            {sections.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => scrollTo(s.id)}
                                    className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                        activeId === s.id
                                            ? "bg-blue-50 text-blue-700 font-semibold"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    }`}
                                >
                                    {s.title}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-10">

                    {/* ── Desktop Sidebar ── */}
                    <aside className="hidden lg:block lg:col-span-1">
                        <div className="sticky top-28">
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4 mb-3">
                                    On This Page
                                </h3>
                                <nav className="space-y-0.5">
                                    {sections.map((s) => (
                                        <SidebarNavItem
                                            key={s.id}
                                            id={s.id}
                                            title={s.title}
                                            isActive={activeId === s.id}
                                            onClick={scrollTo}
                                        />
                                    ))}
                                </nav>
                            </div>

                            <div className="mt-4 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/20">
                                <h4 className="font-bold text-sm mb-2">Your Data, Your Rights</h4>
                                <p className="text-emerald-100 text-xs leading-relaxed mb-4">
                                    Request a data export or deletion at any time from your account settings.
                                </p>
                                <Link
                                    to="/contact"
                                    className="inline-block bg-white text-emerald-700 text-xs font-bold px-4 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
                                >
                                    Contact Privacy Team
                                </Link>
                            </div>
                        </div>
                    </aside>

                    {/* ── Content Area ── */}
                    <main className="lg:col-span-3 space-y-6">
                        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-3">
                            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <p className="text-sm text-emerald-800 font-medium">
                                OrthoNoe is committed to HIPAA-aligned privacy practices and enterprise-grade data protection.
                            </p>
                        </div>

                        {sections.map((section) => (
                            <SectionBlock key={section.id} section={section} />
                        ))}

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 pb-4 border-t border-slate-200">
                            <Link
                                to="/terms"
                                className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                            >
                                ← Read our Terms of Service
                            </Link>
                            <Link
                                to="/signup"
                                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:scale-[0.98]"
                            >
                                Get Started Free
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
