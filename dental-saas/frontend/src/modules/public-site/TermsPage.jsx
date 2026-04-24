import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ShieldCheck, Scale, FileText, AlertCircle, CreditCard, UserX, Lightbulb, Gavel, HelpCircle } from "lucide-react";

/**
 * TermsPage.jsx
 * Built with Stitch UI principles: Clean spacing, soft shadows, medical-grade trust.
 * Features: Scroll Spy, Sticky Sidebar, Mobile Responsive Navigation.
 */

// ─── Data Structure ───────────────────────────────────────────────────────────
const sections = [
    {
        id: "introduction",
        title: "1. Introduction",
        icon: <FileText className="w-5 h-5" />,
        content: `OrthoNoe ("we", "our", "us") provides a cloud-based orthodontic management platform. By accessing or using the platform, you agree to be bound by these Terms. Our services are designed to streamline clinical workflows, patient management, and AI-assisted diagnostics for licensed orthodontic professionals.`
    },
    {
        id: "eligibility",
        title: "2. Eligibility",
        icon: <ShieldCheck className="w-5 h-5" />,
        content: `You must be a licensed dental professional or authorized staff member to use this platform. By creating an account, you represent that you have the legal authority to bind your organization to these terms. Unauthorized use is strictly prohibited.`
    },
    {
        id: "account-responsibilities",
        title: "3. Account Responsibilities",
        icon: <UserX className="w-5 h-5" />,
        prefix: "You are responsible for:",
        list: [
            "Maintaining the security and confidentiality of your account credentials.",
            "Ensuring all clinical data entered is accurate, verified, and professional.",
            "All activity that occurs under your account or organization plane.",
            "Notifying us immediately of any unauthorized access or security breaches."
        ]
    },
    {
        id: "acceptable-use",
        title: "4. Acceptable Use",
        icon: <Scale className="w-5 h-5" />,
        prefix: "You agree NOT to:",
        list: [
            "Use the system for any illegal purposes or unauthorized activities.",
            "Upload malicious content, viruses, or harmful code to our cloud infrastructure.",
            "Attempt unauthorized access to other tenant databases (cross-tenant leakage).",
            "Interfere with system integrity or disrupt platform service availability."
        ]
    },
    {
        id: "medical-disclaimer",
        title: "5. Medical Disclaimer",
        icon: <AlertCircle className="w-5 h-5" />,
        content: `OrthoNoe is a management and decision-support tool. It does NOT replace professional clinical judgment. All clinical decisions, including those assisted by AI modules (CephAI, 3D Scan Analysis), are the sole responsibility of the licensed practitioner of record.`
    },
    {
        id: "data-privacy",
        title: "6. Data & Privacy",
        icon: <ShieldCheck className="w-5 h-5" />,
        content: `Use of the platform is also governed by our Privacy Policy. Clinics are solely responsible for: (a) obtaining patient consent for data processing, (b) ensuring legal compliance with local health data regulations (HIPAA/GDPR), and (c) maintaining the accuracy and integrity of patient records.`
    },
    {
        id: "billing",
        title: "7. Payments & Billing",
        icon: <CreditCard className="w-5 h-5" />,
        list: [
            "Subscription fees are billed in advance based on your selected plan.",
            "Payments are non-refundable unless explicitly stated otherwise in a separate contract.",
            "Pricing may change with at least 30 days prior notice to the organization owner.",
            "Usage-based fees (SMS, AI credits, custom storage) are billed monthly in arrears."
        ]
    },
    {
        id: "termination",
        title: "8. Subscription & Termination",
        icon: <UserX className="w-5 h-5" />,
        list: [
            "Users may cancel their subscription at any time via the billing dashboard.",
            "We may suspend accounts for material violations of these Terms.",
            "Data retention and deletion follow our standard Privacy Policy timeline (90-day grace)."
        ]
    },
    {
        id: "intellectual-property",
        title: "9. Intellectual Property",
        icon: <Lightbulb className="w-5 h-5" />,
        content: `All platform content, proprietary algorithms, neural network motifs, and design systems are the exclusive property of OrthoNoe. Users are granted a limited, non-exclusive license to access the service during their valid subscription period.`
    },
    {
        id: "liability",
        title: "10. Limitation of Liability",
        icon: <Scale className="w-5 h-5" />,
        prefix: "OrthoNoe shall not be liable for:",
        list: [
            "Clinical decisions made by practitioners using platform tools.",
            "Data loss due to user negligence or credential sharing.",
            "Indirect, consequential, or punitive damages arising from temporary service outages."
        ]
    },
    {
        id: "indemnification",
        title: "11. Indemnification",
        icon: <Gavel className="w-5 h-5" />,
        content: `Users agree to indemnify OrthoNoe against any claims, losses, or damages arising from misuse of the platform, violation of laws, or breach of patient medical confidentiality.`
    },
    {
        id: "changes",
        title: "12. Changes to Terms",
        icon: <FileText className="w-5 h-5" />,
        content: `We may update these Terms at any time to reflect platform improvements or regulatory changes. Material changes will be communicated via the platform dashboard or registered email.`
    },
    {
        id: "law",
        title: "13. Governing Law",
        icon: <Gavel className="w-5 h-5" />,
        content: `These Terms are governed by applicable international law and the jurisdiction of our corporate headquarters. Disputes will be settled through arbitration where permitted.`
    },
    {
        id: "contact",
        title: "14. Contact",
        icon: <HelpCircle className="w-5 h-5" />,
        content: `For legal inquiries regarding these terms, please contact our legal department at legal@orthonoe.com.`
    }
];

// ─── Scroll Spy Hook ───────────────────────────────────────────────────────────
function useScrollSpy(ids, offset = 120) {
    const [activeId, setActiveId] = useState(ids[0]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveId(entry.target.id);
                    }
                });
            },
            { rootMargin: `-${offset}px 0px -70% 0px`, threshold: 0 }
        );

        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [ids, offset]);

    return activeId;
}

// ─── Components ────────────────────────────────────────────────────────────────

function SidebarNav({ sections, activeSection, onNavItemClick }) {
    return (
        <nav className="space-y-1">
            {sections.map((section) => (
                <button
                    key={section.id}
                    onClick={() => onNavItemClick(section.id)}
                    className={`w-full text-left px-5 py-3 rounded-xl text-[14px] font-semibold transition-all duration-200 flex items-center gap-3 ${
                        activeSection === section.id
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 translate-x-1"
                            : "text-slate-500 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-100"
                    }`}
                >
                    <span className={activeSection === section.id ? "text-white" : "text-slate-400"}>
                        {section.icon}
                    </span>
                    {section.title}
                </button>
            ))}
        </nav>
    );
}

function SectionBlock({ section }) {
    return (
        <section id={section.id} className="scroll-mt-28">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 md:p-10 hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        {section.icon}
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                        {section.title}
                    </h2>
                </div>

                {section.content && (
                    <p className="text-[16px] text-slate-600 leading-relaxed mb-4">
                        {section.content}
                    </p>
                )}

                {section.prefix && (
                    <p className="text-[16px] font-bold text-slate-800 mb-4">
                        {section.prefix}
                    </p>
                )}

                {section.list && (
                    <ul className="space-y-4">
                        {section.list.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-slate-600 text-[15px] leading-relaxed">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2.5 shrink-0" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TermsPage() {
    const sectionIds = useMemo(() => sections.map((s) => s.id), []);
    const activeSection = useScrollSpy(sectionIds);
    const [isMobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        document.title = "Terms of Service | OrthoNoe";
    }, []);

    const handleScrollTo = useCallback((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setMobileNavOpen(false);
        }
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 font-sans" dir="ltr">
            {/* HERO SECTION */}
            <section className="bg-slate-900 py-20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-transparent to-emerald-500/5"></div>
                <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md text-blue-400 px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-6 border border-white/5">
                        <Scale className="w-4 h-4" />
                        Platform Agreement
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
                        Terms of Service
                    </h1>
                    <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto">
                        Please read our terms carefully. They outline our commitment to your practice and your responsibilities as a user.
                    </p>
                </div>
            </section>

            {/* MAIN LAYOUT */}
            <div className="max-w-7xl mx-auto px-6 py-10 lg:py-20 grid grid-cols-1 lg:grid-cols-4 gap-12">
                
                {/* SIDEBAR (Desktop Sticky) */}
                <aside className="lg:col-span-1">
                    <div className="hidden lg:block sticky top-28">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-5">
                            Agreement Sections
                        </h3>
                        <SidebarNav 
                            sections={sections} 
                            activeSection={activeSection} 
                            onNavItemClick={handleScrollTo} 
                        />
                    </div>

                    {/* Mobile Navigation Dropdown */}
                    <div className="lg:hidden sticky top-24 z-30 mb-8">
                        <button
                            onClick={() => setMobileNavOpen(!isMobileNavOpen)}
                            className="w-full bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-between font-bold text-slate-700"
                        >
                            <span className="flex items-center gap-2">
                                <Scale className="w-4 h-4 text-blue-600" />
                                {sections.find(s => s.id === activeSection)?.title || "Navigation"}
                            </span>
                            <ChevronDown className={`w-5 h-5 transition-transform ${isMobileNavOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isMobileNavOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-40 max-h-[60vh] overflow-y-auto">
                                {sections.map((section) => (
                                    <button
                                        key={section.id}
                                        onClick={() => handleScrollTo(section.id)}
                                        className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                        {section.title}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* CONTENT AREA */}
                <main className="lg:col-span-3 space-y-10">
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex items-start gap-4">
                        <AlertCircle className="w-6 h-6 text-blue-600 shrink-0" />
                        <div>
                            <h4 className="text-blue-900 font-bold text-sm mb-1">Important Update</h4>
                            <p className="text-blue-700 text-sm leading-relaxed">
                                Our terms have been updated to include guidelines for our new CephAI and 3D modeling tools. By continuing to use the platform, you agree to these clinical decision-support terms.
                            </p>
                        </div>
                    </div>

                    {sections.map((section) => (
                        <SectionBlock key={section.id} section={section} />
                    ))}

                    {/* Footer Nav */}
                    <div className="pt-10 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6">
                        <p className="text-sm text-slate-500 font-medium">
                            Last Revised: April 21, 2026
                        </p>
                        <div className="flex gap-6">
                            <Link to="/privacy" className="text-blue-600 font-bold hover:underline transition-colors text-[14px]">
                                Privacy Policy
                            </Link>
                            <Link to="/contact" className="text-blue-600 font-bold hover:underline transition-colors text-[14px]">
                                Contact Legal
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
