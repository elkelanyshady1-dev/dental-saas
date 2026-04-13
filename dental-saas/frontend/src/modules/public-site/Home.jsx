import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "@/services/api";

// ─── Scroll-triggered fade-in hook ────────────────────────────────────────────
function useFadeIn(threshold = 0.15) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.unobserve(el);
                }
            },
            { threshold }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold]);

    return [ref, visible];
}

// ─── Count-up animation hook ──────────────────────────────────────────────────
function useCountUp(target, duration = 1800, started = false) {
    const [count, setCount] = useState(0);
    const raf = useRef(null);

    useEffect(() => {
        if (!started) return;
        const isFloat = typeof target === "string" && target.includes(".");
        const numeric = parseFloat(String(target).replace(/[^0-9.]/g, ""));
        const suffix = String(target).replace(/[0-9.]/g, "");
        const start = performance.now();

        function step(ts) {
            const elapsed = ts - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const val = eased * numeric;
            setCount(isFloat ? parseFloat(val.toFixed(1)) + suffix : Math.round(val) + suffix);
            if (progress < 1) raf.current = requestAnimationFrame(step);
        }
        raf.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf.current);
    }, [target, duration, started]);

    return count;
}

// ─── Feature card data ─────────────────────────────────────────────────────────
const FEATURES = [
    {
        title: "Smart Scheduling",
        desc: "Drag-and-drop calendar with automated WhatsApp & SMS reminders. Zero no-shows.",
        icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
        color: "from-blue-500 to-blue-600"
    },
    {
        title: "Patient Records",
        desc: "Complete clinical history, prescriptions, and high-resolution imaging in one record.",
        icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
        color: "from-violet-500 to-violet-600"
    },
    {
        title: "Enterprise Billing",
        desc: "Multi-currency invoicing, global tax compliance, and insurance claims management.",
        icon: "M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z",
        color: "from-emerald-500 to-emerald-600"
    },
    {
        title: "Lab Management",
        desc: "Seamless digital workflow between your clinic and dental labs with real-time status.",
        icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.675.27a1 1 0 00-.573.743L10 18H2v2h8v-2h9.428l.572-2.572z",
        color: "from-amber-500 to-amber-600"
    },
    {
        title: "Staff & Roles",
        desc: "Granular RBAC for dentists, receptionists, nurses, and admin staff. Role-safe by design.",
        icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
        color: "from-rose-500 to-rose-600"
    },
    {
        title: "Multi-Clinic",
        desc: "Manage 100+ branches from one unified platform. Enterprise-grade governance built in.",
        icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
        color: "from-cyan-500 to-cyan-600"
    }
];

const STATS = [
    { value: "500+", label: "Clinics Online" },
    { value: "2M+", label: "Appointments" },
    { value: "15+", label: "Countries" },
    { value: "99%", label: "Satisfaction" }
];

const TRUST_ITEMS = [
    "SOC 2 Type II",
    "HIPAA Aligned",
    "99.9% Uptime SLA",
    "End-to-End Encrypted"
];

// ─── Statistics row component ──────────────────────────────────────────────────
function StatItem({ value, label }) {
    const [ref, inView] = useFadeIn(0.3);
    const animated = useCountUp(value, 1600, inView);
    return (
        <div ref={ref} className={`transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="text-5xl font-black text-white mb-2 tabular-nums">{inView ? animated : "0"}</div>
            <div className="text-xs font-bold uppercase text-blue-400 tracking-widest leading-relaxed">{label}</div>
        </div>
    );
}

// ─── Feature card component ────────────────────────────────────────────────────
function FeatureCard({ title, desc, icon, color, delay = 0 }) {
    const [ref, inView] = useFadeIn(0.1);
    return (
        <div
            ref={ref}
            style={{ transitionDelay: `${delay}ms` }}
            className={`group p-8 rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-blue-100 transition-all duration-300 cursor-default ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
            <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-2xl flex items-center justify-center text-white shadow-md mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={icon} />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2.5 tracking-tight">{title}</h3>
            <p className="text-slate-500 leading-relaxed text-sm">{desc}</p>
        </div>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function Home() {
    const [siteContent, setSiteContent] = useState({
        heroTitle: "The Smart Dental Platform for Modern Clinics",
        heroSubtitle: "Secure, scalable, and designed for dental professionals.",
        aboutTitle: "Empowering Dental Clinics with Smart Solutions",
        aboutDescription: "DentalSaaS provides everything you need to manage your practice securely.",
        whatsappNumber: null,
        supportEmail: null
    });

    const [featureRef, featuresVisible] = useFadeIn(0.05);
    const [ctaRef, ctaVisible] = useFadeIn(0.2);

    useEffect(() => {
        document.title = "DentalSaaS | The Modern Operating System for Dentistry";
        publicApi.get("/public/site-content")
            .then(res => {
                if (res.data.success) {
                    setSiteContent(prev => ({ ...prev, ...res.data.data }));
                }
            })
            .catch(() => {
                // Silent fallback — default content already set in state
            });
    }, []);

    return (
        <div className="flex flex-col flex-1 bg-white" style={{ scrollBehavior: "smooth" }}>

            {/* ══════════════════════════════════════════════════════════════
                SECTION 1 — HERO
            ══════════════════════════════════════════════════════════════ */}
            <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-slate-50 pt-28 pb-36">
                {/* Soft radial ambient glow — top right */}
                <div className="absolute top-0 right-0 w-[45vw] h-[45vw] bg-blue-400/8 rounded-full blur-[140px] -z-10 translate-x-1/3 -translate-y-1/4 pointer-events-none" />
                {/* Secondary glow — bottom left */}
                <div className="absolute bottom-0 left-0 w-[30vw] h-[30vw] bg-violet-300/6 rounded-full blur-[120px] -z-10 -translate-x-1/4 translate-y-1/4 pointer-events-none" />

                <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">

                    {/* ── Left: copy ── */}
                    <div className="space-y-8">
                        {/* Enterprise edition badge */}
                        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-bold tracking-tight select-none">
                            <span className="relative flex h-2 w-2" aria-hidden="true">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
                            </span>
                            Enterprise Edition
                        </div>

                        {/* H1 — one per page */}
                        <h1
                            className="text-5xl sm:text-6xl font-bold text-slate-900 tracking-[-0.02em] leading-[1.1]"
                        >
                            The OS for{" "}
                            <span
                                className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent"
                            >
                                Modern Dentistry
                            </span>
                        </h1>

                        <p className="text-xl text-slate-500 leading-[1.7] max-w-lg font-normal">
                            {siteContent.heroSubtitle}
                        </p>

                        {/* CTAs */}
                        <div className="flex flex-col sm:flex-row gap-4 pt-2">
                            <Link
                                to="/signup"
                                className="group inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold transition-all duration-200 shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:scale-[0.98] text-[15px]"
                            >
                                Start Your Free Trial
                                <svg
                                    className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </Link>
                            <Link
                                to="/about"
                                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-2xl font-bold transition-all duration-200 shadow-sm hover:shadow hover:-translate-y-0.5 active:scale-[0.98] text-[15px]"
                            >
                                See How It Works
                            </Link>
                        </div>

                        {/* Micro-credibility strip */}
                        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                            {TRUST_ITEMS.map((item) => (
                                <span key={item} className="inline-flex items-center gap-1.5 text-slate-400 text-xs font-semibold">
                                    <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* ── Right: hero image + badge ── */}
                    <div className="relative hidden lg:block">
                        {/* Soft radial behind image */}
                        <div className="absolute inset-0 rounded-[2.5rem] bg-blue-100/30 blur-2xl scale-95 -z-10" />

                        <div className="bg-white p-2 rounded-[2.5rem] shadow-2xl border border-slate-100 rotate-1 hover:rotate-0 transition-transform duration-500">
                            <img
                                src="https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=1000&q=80"
                                alt="DentalSaaS Dashboard Preview showing smart scheduling and analytics"
                                className="rounded-[2rem] w-full shadow-inner"
                                fetchPriority="high"
                                loading="eager"
                            />
                        </div>

                        {/* 99.9% uptime badge — glass effect */}
                        <div
                            className="absolute -bottom-6 -left-6 p-5 rounded-3xl shadow-2xl transform -rotate-3 hover:rotate-0 transition-transform duration-300"
                            style={{
                                background: "rgba(37,99,235,0.92)",
                                backdropFilter: "blur(12px)",
                                WebkitBackdropFilter: "blur(12px)",
                                border: "1px solid rgba(255,255,255,0.15)"
                            }}
                        >
                            <div className="text-3xl font-black text-white leading-none">99.9%</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-200 mt-1">Uptime Guaranteed</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                SECTION 2 — FEATURES GRID
            ══════════════════════════════════════════════════════════════ */}
            <section id="features" className="py-28 bg-slate-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div
                        ref={featureRef}
                        className={`text-center mb-16 transition-all duration-700 ${featuresVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                    >
                        <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-[-0.01em]">
                            Everything your clinic needs
                        </h2>
                        <p className="text-slate-500 text-lg max-w-xl mx-auto leading-relaxed">
                            Built for scale, security, and simplicity — from solo practices to global networks.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {FEATURES.map((f, i) => (
                            <FeatureCard
                                key={f.title}
                                {...f}
                                delay={i * 80}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                SECTION 3 — STATISTICS / SCALE
            ══════════════════════════════════════════════════════════════ */}
            <section id="testimonials" className="py-28 bg-slate-900 overflow-hidden relative">
                {/* Subtle radial gradient background */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at center, rgba(37,99,235,0.07) 0, transparent 70%)" }}
                />
                {/* Top divider fade */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent" />

                <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
                    <h2 className="text-4xl font-bold text-white mb-5 tracking-[-0.01em]">
                        Designed to scale with you.
                    </h2>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-16 leading-relaxed">
                        Whether you're opening your first practice or managing an international dental group,
                        DentalSaaS provides the infrastructure you need to thrive.
                    </p>

                    {/* Stats — count-up on scroll */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
                        {STATS.map(({ value, label }) => (
                            <StatItem key={label} value={value} label={label} />
                        ))}
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                SECTION 4 — FINAL CTA
            ══════════════════════════════════════════════════════════════ */}
            <section className="relative py-36 bg-white text-center overflow-hidden">
                {/* Top gradient fade from previous dark section */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-50/80 to-transparent pointer-events-none" />

                <div
                    ref={ctaRef}
                    className={`max-w-2xl mx-auto px-6 transition-all duration-700 ${ctaVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                >
                    <h2 className="text-4xl font-bold text-slate-900 mb-6 tracking-[-0.01em]">
                        Ready to transform your practice?
                    </h2>
                    <p className="text-slate-500 text-lg mb-10 leading-relaxed">
                        Join thousands of dental professionals using DentalSaaS to run smarter, faster, safer clinics.
                    </p>

                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link
                            to="/signup"
                            className="group inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-12 py-5 rounded-2xl font-bold text-lg shadow-2xl shadow-blue-500/30 hover:bg-blue-700 hover:shadow-blue-500/50 hover:-translate-y-1 transition-all duration-200 active:scale-[0.98]"
                        >
                            Get Started Free
                            <svg
                                className="w-5 h-5 group-hover:translate-x-0.5 transition-transform"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                        </Link>
                    </div>

                    {/* Reassurance lines */}
                    <p className="text-slate-400 mt-6 text-sm font-medium">
                        No credit card required · 14-day free trial
                    </p>
                    <p className="text-slate-400 mt-1 text-sm font-medium">
                        Setup in under 5 minutes.
                    </p>
                </div>
            </section>
        </div>
    );
}
