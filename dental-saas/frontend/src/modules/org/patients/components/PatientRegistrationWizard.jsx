/**
 * PatientRegistrationWizard.jsx — Modern Step-Based Patient Registration
 * v2.0 — Smart Name Intelligence + Gender Auto-Detection
 *
 * Architecture:
 *   PatientRegistrationWizard (right-side slide panel)
 *     ├── StepIndicator
 *     ├── Step1BasicInfo (Smart Full Name with auto-parse + gender detect)
 *     ├── Step2ContactInfo
 *     ├── Step3AdditionalDetails
 *     └── WizardFooter (sticky)
 *
 * Keyboard: TAB → next field, ENTER → next step, CTRL+ENTER → submit
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { patientsApi } from "../api/patients.api";
import { branchesApi } from "../../branches/api/branches.api";
import { appointmentsApi } from "../../calendar/api/appointments.api";
import { useBranch } from "@/context/BranchContext";
import { useAuth } from "@/context/AuthContext";
import { showToast } from "../utils/toast";
import CountryPhoneInput from "@/design-system/CountryPhoneInput";

// ═══════════════════════════════════════════════════════════════════════════
//  NAME INTELLIGENCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/** Detect if a string contains Arabic characters */
const IS_ARABIC = /[\u0600-\u06FF]/;

// ─── Arabic Name → Gender Dictionary ──────────────────────────────────────
// Curated list of common Arabic first names (MEA region)
const ARABIC_MALE_NAMES = new Set([
    "محمد","أحمد","علي","عمر","خالد","حسن","حسين","إبراهيم","ابراهيم",
    "يوسف","مصطفى","عبدالله","عبد","سامي","كريم","طارق","ماهر","وليد",
    "جمال","أمين","سالم","هاني","رامي","باسم","ناصر","فيصل","سعد",
    "حمد","بلال","ياسر","فارس","زياد","منصور","عادل","رشيد","رشاد",
    "شريف","عصام","وائل","تامر","هشام","أسامة","اسامة","عماد","صلاح",
    "نادر","إياد","بدر","ثامر","راشد","سعيد","فهد","عبدالرحمن","نواف",
    "خليل","جابر","غالب","مراد","دانييل","الأمين","مازن","مجدي","أيمن",
]);
const ARABIC_FEMALE_NAMES = new Set([
    "فاطمة","مريم","سارة","نور","رنا","هناء","آية","لمياء","شيماء",
    "هبة","دينا","سمر","ليلى","ريم","منى","إيمان","لينا","غادة",
    "رانيا","سلمى","نادية","هيفاء","أميرة","إسراء","رشا","دعاء",
    "نوف","ولاء","رهف","ميساء","زينب","سناء","أسماء","اسماء","نهاد",
    "أريج","شروق","وفاء","نجلاء","هدى","سحر","حنان","سوسن","رواء",
    "لجين","سلوى","بشرى","أمل","أحلام","يسرى","ميادة","يمنى","إلهام",
]);

// ─── English Name → Gender Dictionary ─────────────────────────────────────
const EN_MALE_NAMES = new Set([
    "james","john","robert","michael","william","david","richard","joseph",
    "thomas","charles","christopher","daniel","paul","mark","donald",
    "george","kenneth","steven","edward","brian","ronald","anthony",
    "kevin","jason","matthew","gary","timothy","jose","larry","jeffrey",
    "frank","scott","eric","stephen","andrew","raymond","gregory","joshua",
    "jerry","dennis","walter","patrick","peter","harold","douglas","henry",
    "carl","arthur","ryan","roger","joe","juan","jack","albert","jonathan",
    "justin","terry","gerald","keith","samuel","willie","ralph","lawrence",
    "nicholas","roy","benjamin","bruce","brandon","adam","harry","fred",
    "wayne","billy","steve","louis","jeremy","aaron","randy","howard",
    "eugene","carlos","russell","bobby","victor","martin","ernest","phillip",
    "todd","jesse","craig","alan","shawn","clarence","sean","philip","chris",
    "johnny","earl","jimmy","antonio","danny","bryan","tony","luis","mike",
    "stanley","leonard","nathan","dale","manuel","rodney","curtis","norman",
    "allen","marvin","vincent","glenn","jeffery","travis","jeff","chad",
    "jake","liam","noah","ethan","mason","logan","lucas","oliver","aiden",
    "elijah","caleb","brayden","sebastian","jackson","nathaniel","gabriel",
    "omar","kareem","hassan","ali","ahmed","khaled","mohamed","ibrahim",
]);
const EN_FEMALE_NAMES = new Set([
    "mary","patricia","jennifer","linda","barbara","elizabeth","susan",
    "jessica","sarah","karen","lisa","nancy","betty","margaret","sandra",
    "ashley","dorothy","kimberly","emily","donna","michelle","carol",
    "amanda","melissa","deborah","stephanie","rebecca","sharon","laura",
    "cynthia","kathleen","amy","angela","shirley","anna","brenda","pamela",
    "emma","nicole","helen","samantha","katherine","christine","debra",
    "rachel","carolyn","janet","catherine","maria","heather","diane","julie",
    "joyce","victoria","kelly","christina","joan","evelyn","lauren","judith",
    "olivia","frances","martha","cheryl","megan","andrea","ann","alice",
    "jean","doris","jacqueline","kathryn","gloria","teresa","sara","janice",
    "marie","julia","grace","judy","theresa","beverly","peggy","rose","maria",
    "sophia","isabella","mia","charlotte","amelia","harper","everly","avery",
    "abigail","ella","scarlett","madison","luna","chloe","penelope","layla",
    "nora","ellie","zoey","natalie","leah","hannah","lily","eleanor","lillian",
    "aria","addison","aubrey","anna","stella","violet","hazel","savannah",
    "audrey","brooklyn","bella","claire","skylar","lucy","paisley","evelyn",
    "fatima","nour","rana","hana","lina","reem","mona","dina","rania",
]);

/**
 * parseFullName — splits a name string into firstName, middleName, lastName
 * Auto-detects Arabic vs English and returns language tag.
 */
function parseFullName(fullName) {
    const trimmed = (fullName || "").trim();
    if (!trimmed) return { firstName: "", middleName: "", lastName: "", language: "english" };

    const isArabic = IS_ARABIC.test(trimmed);
    const parts = trimmed.split(/\s+/).filter(Boolean);

    return {
        firstName:  parts[0]  || "",
        middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
        lastName:   parts.length > 1 ? parts[parts.length - 1] : "",
        language:   isArabic ? "arabic" : "english",
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  ARABIC COMPOUND NAME INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════

/** Arabic compound prefixes — these bind to the next token */
const ARABIC_COMPOUND_PREFIXES = new Set([
    "عبد", "ابن", "بن", "ابو", "أبو", "إبن", "ال",
]);

/**
 * tokenizeArabicName — splits Arabic name into semantic tokens,
 * merging compound prefixes (عبد, ابن, ابو, بن) with their following token.
 *
 * Example: "احمد محمد عبد الله" → ["احمد", "محمد", "عبد الله"]
 * Example: "محمد ابو بكر عبد الرحمن" → ["محمد", "ابو بكر", "عبد الرحمن"]
 */
function tokenizeArabicName(fullName) {
    const rawTokens = (fullName || "").trim().split(/\s+/).filter(Boolean);
    const semanticTokens = [];
    let i = 0;

    while (i < rawTokens.length) {
        if (ARABIC_COMPOUND_PREFIXES.has(rawTokens[i]) && i + 1 < rawTokens.length) {
            semanticTokens.push(`${rawTokens[i]} ${rawTokens[i + 1]}`);
            i += 2;
        } else {
            semanticTokens.push(rawTokens[i]);
            i += 1;
        }
    }

    return semanticTokens;
}

/**
 * tokenizeRaw — simple whitespace split into raw word tokens.
 * This is the SINGLE source of truth for Arabic name tokens.
 */
function tokenizeRaw(str) {
    return (str || "").trim().split(/\s+/).filter(Boolean);
}

/**
 * buildSemanticGroups — takes a raw word array and groups compound prefixes
 * with their following word into "semantic slots".
 *
 * Returns an array of slot objects: { words: string[], display: string }
 * Example: ["احمد","محمد","عبد","الله"]
 * → [
 *     { words:["احمد"],        display:"احمد" },
 *     { words:["محمد"],        display:"محمد" },
 *     { words:["عبد","الله"], display:"عبد الله" },
 *   ]
 */
function buildSemanticGroups(rawWords) {
    const groups = [];
    let i = 0;
    while (i < rawWords.length) {
        if (ARABIC_COMPOUND_PREFIXES.has(rawWords[i]) && i + 1 < rawWords.length) {
            groups.push({ words: [rawWords[i], rawWords[i + 1]], display: `${rawWords[i]} ${rawWords[i + 1]}` });
            i += 2;
        } else {
            groups.push({ words: [rawWords[i]], display: rawWords[i] });
            i += 1;
        }
    }
    return groups;
}

/**
 * assignSegment — token-immutable segment reassignment.
 *
 * Given the full raw token list and a chosen segment assignment
 * (e.g. last = "عبد الله"), splits all raw tokens among
 * first / mid / last without any duplication.
 *
 * Algorithm:
 *   1. Parse chosen segment's string back into raw words → claimedWords
 *   2. Find the matching contiguous run in rawTokens
 *   3. Tokens before that run → go to firstRaw (or midRaw)
 *   4. Tokens after that run → go to firstRaw / midRaw (whichever not yet assigned)
 *   5. Rebuild fullName from rawTokens order (unchanged)
 *
 * Returns { firstName, middleName, lastName, firstRaw, midRaw, lastRaw }
 */
function assignSegment(segment, chosenDisplay, rawTokens) {
    // Convert chosen display string back to raw words
    const claimed = tokenizeRaw(chosenDisplay);

    // Find the contiguous start index in rawTokens
    let startIdx = -1;
    outer: for (let i = 0; i <= rawTokens.length - claimed.length; i++) {
        for (let j = 0; j < claimed.length; j++) {
            if (rawTokens[i + j] !== claimed[j]) continue outer;
        }
        startIdx = i;
        break;
    }

    let firstRaw, midRaw, lastRaw;

    if (startIdx === -1) {
        // Fallback: can't locate tokens — safe degenerate split
        firstRaw = rawTokens.slice(0, 1);
        midRaw   = rawTokens.slice(1, -1);
        lastRaw  = rawTokens.slice(-1);
    } else {
        const endIdx = startIdx + claimed.length; // exclusive
        const before = rawTokens.slice(0, startIdx);
        const after  = rawTokens.slice(endIdx);

        if (segment === "Last") {
            lastRaw  = claimed;
            firstRaw = before.length > 0 ? [before[0]] : [];
            midRaw   = [...before.slice(1), ...after];
        } else if (segment === "First") {
            firstRaw = claimed;
            lastRaw  = after.length > 0 ? [after[after.length - 1]] : [];
            midRaw   = [...before, ...after.slice(0, -1)];
        } else { // Mid
            midRaw   = claimed;
            firstRaw = before.length > 0 ? [before[0]] : [];
            lastRaw  = after.length > 0  ? [after[after.length - 1]] : [];
            // any remaining before/after tokens that don't fit → append to mid
            const extraBefore = before.slice(1);
            const extraAfter  = after.slice(0, -1);
            midRaw = [...extraBefore, ...midRaw, ...extraAfter];
        }
    }

    // Rebuild fullName strictly from rawTokens order (no duplication)
    const fullName = rawTokens.join(" ");
    return {
        firstRaw,
        midRaw,
        lastRaw,
        firstName:  firstRaw.join(" "),
        middleName: midRaw.join(" "),
        lastName:   lastRaw.join(" "),
        fullName,
    };
}

/**
 * generateSegmentSuggestionsFromAssignment — produces suggestion lists
 * for each segment given the CURRENT per-segment raw token arrays.
 *
 * Suggestions stay within the token pool of (thisSegment ∪ available tokens
 * from adjacent flexible-boundary segments), so no foreign tokens appear.
 *
 * "Available" for expansion = tokens not locked into a non-adjacent segment.
 * For simplicity & correctness we generate suggestions from semantic groups
 * of the full raw token list, filtered to only include valid groupings
 * (i.e. contiguous runs within rawTokens).
 */
function generateSegmentSuggestions(firstRaw, midRaw, lastRaw, rawTokens) {
    const groups = buildSemanticGroups(rawTokens);
    const n = groups.length;

    if (n === 0) return { first: [], middle: [], last: [] };

    const currentFirst  = firstRaw.join(" ");
    const currentMiddle = midRaw.join(" ");
    const currentLast   = lastRaw.join(" ");

    // ── First suggestions: any contiguous prefix of groups (1 or 2 slots) ──
    const firstSuggestions = [];
    for (let len = 1; len <= Math.min(2, n - 1); len++) {
        firstSuggestions.push(groups.slice(0, len).map(g => g.display).join(" "));
    }

    // ── Last suggestions: any contiguous suffix of groups (1 or 2 slots) ──
    const lastSuggestions = [];
    for (let len = 1; len <= Math.min(2, n - 1); len++) {
        lastSuggestions.push(groups.slice(n - len).map(g => g.display).join(" "));
    }

    // ── Middle suggestions: contiguous inner groups (between first and last) ──
    const middleSuggestions = [];
    if (n > 2) {
        for (let s = 1; s < n - 1; s++) {
            for (let e = s + 1; e <= n - 1 && e - s <= 2; e++) {
                middleSuggestions.push(groups.slice(s, e).map(g => g.display).join(" "));
            }
        }
    }

    return {
        first:  [...new Set(firstSuggestions)].filter(v => v),
        middle: [...new Set(middleSuggestions)].filter(v => v),
        last:   [...new Set(lastSuggestions)].filter(v => v),
    };
}

/**
 * NameSegmentChip — A clickable name segment that opens a suggestion dropdown.
 *
 * Props:
 *   label: "First" | "Mid" | "Last"
 *   value: current segment value
 *   options: array of suggestion strings
 *   onSelect(newValue): callback when a suggestion is picked
 *   isArabic: boolean — controls text direction
 */
function NameSegmentChip({ label, value, options, onSelect, isArabic }) {
    const [isOpen, setIsOpen] = useState(false);
    const chipRef = useRef(null);

    // Close on click-outside
    useEffect(() => {
        if (!isOpen) return;
        const onClickOutside = (e) => {
            if (chipRef.current && !chipRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [isOpen]);

    const filteredOptions = options.filter(opt => opt !== value);
    const hasAlternatives = filteredOptions.length > 0;

    const labelColors = {
        First: "text-blue-500",
        Mid:   "text-violet-500",
        Last:  "text-emerald-600",
    };

    const chipColors = {
        First: isOpen ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200/50" : "bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50",
        Mid:   isOpen ? "bg-violet-50 border-violet-300 ring-2 ring-violet-200/50" : "bg-slate-50 border-slate-200 hover:border-violet-300 hover:bg-violet-50/50",
        Last:  isOpen ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200/50" : "bg-slate-50 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50",
    };

    return (
        <div className="relative" ref={chipRef}>
            <button
                type="button"
                onClick={() => hasAlternatives && setIsOpen(!isOpen)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-150 ${chipColors[label] || chipColors.First} ${hasAlternatives ? "cursor-pointer" : "cursor-default"}`}
                dir={isArabic ? "rtl" : "ltr"}
            >
                <span className={`text-[10px] font-bold uppercase ${labelColors[label] || "text-slate-400"}`}>{label}</span>
                <span className="text-slate-700">{value}</span>
                {hasAlternatives && (
                    <svg className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            {/* ── Suggestion dropdown ── */}
            {isOpen && filteredOptions.length > 0 && (
                <div
                    className="absolute z-50 top-full mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl shadow-slate-200/60 py-1.5 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150"
                    dir={isArabic ? "rtl" : "ltr"}
                    style={{ [isArabic ? "right" : "left"]: 0 }}
                >
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                        Choose {label === "Mid" ? "Middle" : label} Name
                    </div>
                    {filteredOptions.map((opt, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => { onSelect(opt); setIsOpen(false); }}
                            className="w-full text-right px-3 py-2 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
                            dir={isArabic ? "rtl" : "ltr"}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                            {opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * detectGender — returns "male" | "female" | null
 * Checks the firstName against the appropriate dictionary.
 */
function detectGender(firstName, language) {
    if (!firstName) return null;
    if (language === "arabic") {
        const f = firstName.trim();
        if (ARABIC_MALE_NAMES.has(f))   return "male";
        if (ARABIC_FEMALE_NAMES.has(f)) return "female";
    } else {
        const f = firstName.trim().toLowerCase();
        if (EN_MALE_NAMES.has(f))   return "male";
        if (EN_FEMALE_NAMES.has(f)) return "female";
    }
    return null;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const STEPS = [
    { key: "basic", label: "Basic Info", icon: "user" },
    { key: "contact", label: "Contact", icon: "phone" },
    { key: "details", label: "Additional", icon: "clipboard" },
];

// ─── Step Icons ─────────────────────────────────────────────────────────────
const StepIcon = ({ type, active, done }) => {
    const color = done ? "text-emerald-500" : active ? "text-blue-600" : "text-slate-300";
    const icons = {
        user: (
            <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ),
        phone: (
            <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
        ),
        clipboard: (
            <svg className={`w-5 h-5 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
        ),
    };
    if (done) return (
        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
        </svg>
    );
    return icons[type] || null;
};

// ─── Step Indicator ─────────────────────────────────────────────────────────
function StepIndicator({ currentStep }) {
    return (
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50/50">
            {STEPS.map((step, idx) => {
                const isActive = idx === currentStep;
                const isDone = idx < currentStep;
                return (
                    <div key={step.key} className="flex items-center flex-1">
                        <div className="flex items-center gap-2.5">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                                isDone ? "bg-emerald-50 border border-emerald-200" :
                                isActive ? "bg-blue-50 border-2 border-blue-500 shadow-lg shadow-blue-500/10" :
                                "bg-slate-100 border border-slate-200"
                            }`}>
                                <StepIcon type={step.icon} active={isActive} done={isDone} />
                            </div>
                            <div>
                                <p className={`text-xs font-bold uppercase tracking-wider ${
                                    isDone ? "text-emerald-600" : isActive ? "text-blue-600" : "text-slate-400"
                                }`}>
                                    Step {idx + 1}
                                </p>
                                <p className={`text-sm font-semibold ${
                                    isDone ? "text-emerald-700" : isActive ? "text-slate-800" : "text-slate-400"
                                }`}>
                                    {step.label}
                                </p>
                            </div>
                        </div>
                        {idx < STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-4 rounded-full transition-colors duration-300 ${
                                isDone ? "bg-emerald-300" : "bg-slate-200"
                            }`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Age Calculator ─────────────────────────────────────────────────────────
function calculateAge(dob) {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
}

// ─── DOB Dropdown Helpers ───────────────────────────────────────────────────
const MONTHS = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
];

const currentYear = new Date().getFullYear();
const DOB_YEARS = Array.from({ length: currentYear - 1920 + 1 }, (_, i) => currentYear - i);

const QUICK_AGE_PRESETS = [
    { label: "Child", age: 10 },
    { label: "Adult", age: 35 },
    { label: "Senior", age: 65 },
];

/** Rebuild `form.dob` (YYYY-MM-DD) from the 3 dropdown values */
function rebuildDob(day, month, year, set) {
    if (day && month && year) {
        set("dob", `${year}-${month}-${day}`);
    }
}

// ─── Field Component ────────────────────────────────────────────────────────
function Field({ label, required, children, hint, className = "" }) {
    return (
        <div className={`space-y-1.5 ${className}`}>
            <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
                {label}
                {required && <span className="text-red-400">*</span>}
            </label>
            {children}
            {hint && <p className="text-[11px] text-slate-400 pl-1">{hint}</p>}
        </div>
    );
}

const inputClass = "w-full bg-white border border-slate-200 rounded-xl py-3 px-4 text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-slate-300 hover:border-slate-300";
const selectClass = `${inputClass} appearance-none cursor-pointer`;

// ─── Step 1: Basic Patient Identity ─────────────────────────────────────────
function Step1BasicInfo({ form, set, setMulti, phoneWarning, phoneChecking, orgCountry }) {
    const age = calculateAge(form.dob);
    const isArabic = IS_ARABIC.test(form.fullName);

    // Parsed name preview chips
    const nameParts = parseFullName(form.fullName);
    const hasNameParts = form.fullName.trim().split(/\s+/).length > 1;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between gap-6 mb-2">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-800">Patient Identity</h3>
                        <p className="text-xs text-slate-400">Quick registration — fill in under 5 seconds</p>
                    </div>
                </div>

                {/* Patient ID field — aligned right */}
                <div className="flex-shrink-0 w-56">
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Patient ID
                    </label>
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400">
                            <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth="1.5" />
                                <circle cx="9" cy="12" r="2" strokeWidth="1.5" />
                                <path strokeLinecap="round" strokeWidth="1.5" d="M15 10h3M15 13h2" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Auto-generated"
                            value={form.patientCode || ""}
                            onChange={e => set("patientCode", e.target.value)}
                            className={`${inputClass} pl-10 text-xs`}
                        />
                    </div>
                    <p className="text-[11px] text-slate-400 pl-1 mt-1">Auto-generated — editable for custom override</p>
                </div>
            </div>

            {/* ── Full Name (smart single field) ── */}
            <Field label="Full Name" required hint={
                isArabic ? "Arabic name detected — type first and last name" :
                "Type first middle last name — auto-parsed"
            }>
                <div className="relative">
                    <input
                        type="text"
                        autoFocus
                        placeholder={isArabic ? "مثال: محمد أحمد العمر" : "e.g. John Michael Doe"}
                        value={form.fullName}
                        onChange={e => {
                            const val = e.target.value;
                            const parsed = parseFullName(val);
                            const lang = parsed.language;
                            const detectedGender = detectGender(parsed.firstName, lang);

                            // Build initial token model from fresh input
                            let tokenUpdates = {};
                            if (lang === "arabic" && val.trim()) {
                                const rawTokens = tokenizeRaw(val);
                                // Default split: first token = First, last token = Last, rest = Mid
                                const firstRaw = rawTokens.length > 0 ? [rawTokens[0]] : [];
                                const lastRaw  = rawTokens.length > 1 ? [rawTokens[rawTokens.length - 1]] : [];
                                const midRaw   = rawTokens.length > 2 ? rawTokens.slice(1, -1) : [];
                                tokenUpdates = {
                                    nameRawTokens: rawTokens,
                                    nameFirstRaw:  firstRaw,
                                    nameMidRaw:    midRaw,
                                    nameLastRaw:   lastRaw,
                                };
                            } else {
                                tokenUpdates = {
                                    nameRawTokens: [],
                                    nameFirstRaw:  [],
                                    nameMidRaw:    [],
                                    nameLastRaw:   [],
                                };
                            }

                            setMulti({
                                fullName: val,
                                firstName:  parsed.firstName,
                                middleName: parsed.middleName,
                                lastName:   parsed.lastName,
                                nameEnglish: lang === "english" ? val : "",
                                nameArabic:  lang === "arabic"  ? val : "",
                                ...tokenUpdates,
                                ...(detectedGender && !form.genderManualOverride
                                    ? { gender: detectedGender, genderAutoDetected: true }
                                    : { genderAutoDetected: false }),
                            });
                        }}
                        dir={isArabic ? "rtl" : "ltr"}
                        required
                        className={`${inputClass} ${isArabic ? "text-right font-arabic" : ""} pr-20`}
                    />
                    {/* Language badge */}
                    {form.fullName.trim() && (
                        <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            isArabic
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-blue-50 text-blue-600 border-blue-100"
                        }`}>
                            {isArabic ? "عربي" : "EN"}
                        </div>
                    )}
                </div>

                {/* Smart interactive name segment chips — token-immutable model */}
                {isArabic && form.nameRawTokens.length >= 2 && (() => {
                    const rawTokens  = form.nameRawTokens;
                    const firstRaw   = form.nameFirstRaw;
                    const midRaw     = form.nameMidRaw;
                    const lastRaw    = form.nameLastRaw;

                    const firstVal  = firstRaw.join(" ");
                    const midVal    = midRaw.join(" ");
                    const lastVal   = lastRaw.join(" ");

                    // Generate suggestions from CURRENT token assignment
                    const suggestions = generateSegmentSuggestions(firstRaw, midRaw, lastRaw, rawTokens);

                    /**
                     * handleSegmentSelect — token-safe reassignment:
                     * 1. Find chosen display string as raw tokens in rawTokens
                     * 2. Claim those tokens for the selected segment
                     * 3. Redistribute remaining tokens to other segments
                     * 4. fullName = rawTokens.join(" ") — never changes, never duplicates
                     */
                    const handleSegmentSelect = (segment, chosenDisplay) => {
                        const result = assignSegment(segment, chosenDisplay, rawTokens);
                        setMulti({
                            fullName:   result.fullName,
                            firstName:  result.firstName,
                            middleName: result.middleName,
                            lastName:   result.lastName,
                            nameEnglish: "",
                            nameArabic:  result.fullName,
                            nameFirstRaw: result.firstRaw,
                            nameMidRaw:   result.midRaw,
                            nameLastRaw:  result.lastRaw,
                        });
                    };

                    const hasAnySuggestions =
                        suggestions.first.filter(v => v !== firstVal).length > 0 ||
                        suggestions.middle.filter(v => v !== midVal).length > 0 ||
                        suggestions.last.filter(v => v !== lastVal).length > 0;

                    return (
                        <div className="pt-1.5 space-y-1.5">
                            <div className={`flex items-center gap-2 flex-wrap flex-row-reverse`}>
                                {firstVal && (
                                    <NameSegmentChip
                                        label="First"
                                        value={firstVal}
                                        options={suggestions.first}
                                        onSelect={(val) => handleSegmentSelect("First", val)}
                                        isArabic={true}
                                    />
                                )}
                                {midVal && (
                                    <NameSegmentChip
                                        label="Mid"
                                        value={midVal}
                                        options={suggestions.middle}
                                        onSelect={(val) => handleSegmentSelect("Mid", val)}
                                        isArabic={true}
                                    />
                                )}
                                {lastVal && (
                                    <NameSegmentChip
                                        label="Last"
                                        value={lastVal}
                                        options={suggestions.last}
                                        onSelect={(val) => handleSegmentSelect("Last", val)}
                                        isArabic={true}
                                    />
                                )}
                            </div>
                            {hasAnySuggestions && (
                                <p className="text-[10px] text-violet-400 flex items-center gap-1 justify-end" dir="rtl">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                                    </svg>
                                    اضغط على الأجزاء لتغيير تقسيم الاسم
                                </p>
                            )}
                        </div>
                    );
                })()}
                {!isArabic && hasNameParts && (() => {
                    // English: simple static chips (no compound prefix logic needed)
                    return (
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {nameParts.firstName && (
                                <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200">
                                    <span className="text-[10px] font-bold uppercase text-blue-500">First</span> {nameParts.firstName}
                                </span>
                            )}
                            {nameParts.middleName && (
                                <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200">
                                    <span className="text-[10px] font-bold uppercase text-violet-500">Mid</span> {nameParts.middleName}
                                </span>
                            )}
                            {nameParts.lastName && (
                                <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200">
                                    <span className="text-[10px] font-bold uppercase text-emerald-600">Last</span> {nameParts.lastName}
                                </span>
                            )}
                        </div>
                    );
                })()}
            </Field>

            {/* ── Phone + Gender row ── */}
            <div className="grid grid-cols-2 gap-5">
                <Field label="Phone Number" required>
                    <div className="relative">
                        <CountryPhoneInput
                            value={form.phone}
                            defaultCountry={orgCountry || form.country || "EG"}
                            onChange={(e164, meta) => {
                                setMulti({
                                    phone: e164,
                                    country: meta.country,
                                });
                            }}
                            error={!!phoneWarning}
                        />
                        {phoneChecking && (
                            <div className="absolute right-3 top-3">
                                <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    {phoneWarning && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1.5">
                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <p className="text-xs font-semibold text-amber-700">{phoneWarning}</p>
                        </div>
                    )}
                </Field>

                <Field label="Gender" required>
                    <div className="flex gap-2">
                        {/* Male button */}
                        <button
                            type="button"
                            onClick={() => {
                                set("gender", "male");
                                set("genderManualOverride", true);
                                set("genderAutoDetected", false);
                            }}
                            className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all duration-200 ${
                                form.gender === "male"
                                    ? "border-blue-400 bg-blue-50/80 text-blue-700 ring-2 ring-blue-500/20 shadow-sm shadow-blue-200/40"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                        >
                            {/* Male icon */}
                            <svg className={`w-5 h-5 ${form.gender === "male" ? "text-blue-500" : "text-slate-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="10" cy="14" r="5" />
                                <line x1="19" y1="5" x2="13.6" y2="10.4" />
                                <line x1="19" y1="5" x2="15" y2="5" />
                                <line x1="19" y1="5" x2="19" y2="9" />
                            </svg>
                            <span>Male / <span className="font-arabic">ذكر</span></span>
                        </button>

                        {/* Female button */}
                        <button
                            type="button"
                            onClick={() => {
                                set("gender", "female");
                                set("genderManualOverride", true);
                                set("genderAutoDetected", false);
                            }}
                            className={`flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all duration-200 ${
                                form.gender === "female"
                                    ? "border-pink-400 bg-pink-50/80 text-pink-700 ring-2 ring-pink-500/20 shadow-sm shadow-pink-200/40"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                        >
                            {/* Female icon */}
                            <svg className={`w-5 h-5 ${form.gender === "female" ? "text-pink-500" : "text-slate-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="8" r="5" />
                                <line x1="12" y1="13" x2="12" y2="21" />
                                <line x1="9" y1="18" x2="15" y2="18" />
                            </svg>
                            <span>Female / <span className="font-arabic">أنثى</span></span>
                        </button>
                    </div>
                    {/* Gender auto-detect indicator */}
                    {form.genderAutoDetected && !form.genderManualOverride && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold text-violet-500">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Gender detected automatically — you can override
                        </div>
                    )}
                </Field>
            </div>

            {/* ── Date of Birth (3 dropdowns + quick selection) ── */}
            <Field label="Date of Birth" hint={age !== null ? `Age: ${age} years old` : "Select date for historical records"}>
                {/* Day / Month / Year dropdowns */}
                <div className="grid grid-cols-3 gap-3">
                    {/* Day */}
                    <div className="relative">
                        <select
                            value={form.dobDay || ""}
                            onChange={e => {
                                set("dobDay", e.target.value);
                                rebuildDob(e.target.value, form.dobMonth, form.dobYear, set);
                            }}
                            className={selectClass}
                        >
                            <option value="">Day</option>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
                            ))}
                        </select>
                    </div>
                    {/* Month */}
                    <div className="relative">
                        <select
                            value={form.dobMonth || ""}
                            onChange={e => {
                                set("dobMonth", e.target.value);
                                rebuildDob(form.dobDay, e.target.value, form.dobYear, set);
                            }}
                            className={selectClass}
                        >
                            <option value="">Month</option>
                            {MONTHS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                    {/* Year */}
                    <div className="relative">
                        <select
                            value={form.dobYear || ""}
                            onChange={e => {
                                set("dobYear", e.target.value);
                                rebuildDob(form.dobDay, form.dobMonth, e.target.value, set);
                            }}
                            className={selectClass}
                        >
                            <option value="">Year</option>
                            {DOB_YEARS.map(y => (
                                <option key={y} value={String(y)}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ── Age Slider ─────────────────────────────────────────── */}
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl px-4 pt-3.5 pb-4 space-y-3">

                    {/* Header row: label + live age pill */}
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quick Age Selection</span>
                        {age !== null && (
                            <div className="inline-flex items-center gap-1.5 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm shadow-blue-300/40">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Age: {age} years old
                            </div>
                        )}
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex gap-2">
                        {QUICK_AGE_PRESETS.map(preset => {
                            const targetYear = String(new Date().getFullYear() - preset.age);
                            const isActive = form.dobYear === targetYear && form.dobDay === "01" && form.dobMonth === "01";
                            return (
                                <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => {
                                        setMulti({
                                            dobDay: "01",
                                            dobMonth: "01",
                                            dobYear: targetYear,
                                            dob: `${targetYear}-01-01`,
                                        });
                                    }}
                                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                                        isActive
                                            ? "border-violet-400 bg-violet-500 text-white shadow-md shadow-violet-300/40"
                                            : "border-slate-200 bg-white text-slate-500 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
                                    }`}
                                >
                                    {preset.label}
                                    <span className={`ml-1 font-black ${isActive ? "text-violet-100" : "text-slate-400"}`}>
                                        {preset.age}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Slider */}
                    <div className="space-y-2">
                        <div className="relative">
                            {/* Gradient track background */}
                            <div className="absolute inset-y-0 flex items-center w-full pointer-events-none">
                                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-400 to-blue-500 rounded-full transition-all duration-100"
                                        style={{ width: `${((age ?? 35) - 2) / (80 - 2) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <input
                                type="range"
                                min="2"
                                max="80"
                                step="1"
                                value={age ?? 35}
                                onChange={e => {
                                    const a = Number(e.target.value);
                                    const birthYear = String(new Date().getFullYear() - a);
                                    setMulti({
                                        dobDay: "01",
                                        dobMonth: "01",
                                        dobYear: birthYear,
                                        dob: `${birthYear}-01-01`,
                                    });
                                }}
                                className="relative w-full h-2 appearance-none bg-transparent cursor-pointer"
                                style={{
                                    WebkitAppearance: "none",
                                }}
                            />
                        </div>

                        {/* Slider markers */}
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 px-0.5">
                            <span>2 YRS</span>
                            <span>{Math.round((2 + 80) / 2)} YRS</span>
                            <span>80 YRS</span>
                        </div>
                    </div>
                </div>

                {/* ── Slider custom style injection ─────────────────────── */}
                <style>{`
                    input[type=range]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: white;
                        border: 2.5px solid #7c3aed;
                        box-shadow: 0 2px 8px rgba(124,58,237,0.35);
                        cursor: pointer;
                        transition: transform 0.1s, box-shadow 0.1s;
                    }
                    input[type=range]::-webkit-slider-thumb:hover,
                    input[type=range]:active::-webkit-slider-thumb {
                        transform: scale(1.25);
                        box-shadow: 0 4px 14px rgba(124,58,237,0.5);
                    }
                    input[type=range]::-moz-range-thumb {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: white;
                        border: 2.5px solid #7c3aed;
                        box-shadow: 0 2px 8px rgba(124,58,237,0.35);
                        cursor: pointer;
                    }
                `}</style>
            </Field>
        </div>
    );
}

// ─── Step 2: Contact Information ────────────────────────────────────────────
function Step2ContactInfo({ form, set }) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeWidth="2" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-base font-bold text-slate-800">Contact Information</h3>
                    <p className="text-xs text-slate-400">All fields are optional — skip if not immediately available</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
                <Field label="Email Address">
                    <input
                        type="email"
                        autoFocus
                        placeholder="patient@email.com"
                        value={form.email}
                        onChange={e => set("email", e.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Secondary Phone">
                    <input
                        type="tel"
                        placeholder="+20 xxx xxx xxxx"
                        value={form.secondaryPhone}
                        onChange={e => set("secondaryPhone", e.target.value)}
                        className={inputClass}
                    />
                </Field>
            </div>

            <div className="grid grid-cols-2 gap-5">
                <Field label="Country" className="col-span-1">
                    <select value={form.country} onChange={e => set("country", e.target.value)} className={selectClass}>
                        <option value="EG">Egypt 🇪🇬</option>
                        <option value="SA">Saudi Arabia 🇸🇦</option>
                        <option value="AE">UAE 🇦🇪</option>
                        <option value="QA">Qatar 🇶🇦</option>
                        <option value="KW">Kuwait 🇰🇼</option>
                        <option value="BH">Bahrain 🇧🇭</option>
                        <option value="OM">Oman 🇴🇲</option>
                        <option value="JO">Jordan 🇯🇴</option>
                        <option value="LB">Lebanon 🇱🇧</option>
                        <option value="US">United States 🇺🇸</option>
                        <option value="GB">United Kingdom 🇬🇧</option>
                        <option value="">Other</option>
                    </select>
                </Field>
                <Field label="Address">
                    <input
                        type="text"
                        placeholder="123 Main Street, City"
                        value={form.address}
                        onChange={e => set("address", e.target.value)}
                        className={inputClass}
                    />
                </Field>
            </div>
        </div>
    );
}

// ─── Collapsible Section ────────────────────────────────────────────────────
function CollapsibleSection({ title, icon, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`border rounded-xl transition-all duration-200 ${open ? "border-slate-200 bg-white shadow-sm" : "border-slate-100 bg-slate-50/50 hover:border-slate-200"}`}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left group"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">{icon}</span>
                    <span className={`text-sm font-bold ${open ? "text-slate-800" : "text-slate-500 group-hover:text-slate-700"}`}>
                        {title}
                    </span>
                </div>
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="px-5 pb-5 pt-1 space-y-4 animate-in fade-in duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Step 3: Additional Details ─────────────────────────────────────────────
function Step3AdditionalDetails({ form, set }) {
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-base font-bold text-slate-800">Additional Details</h3>
                    <p className="text-xs text-slate-400">Expand sections as needed — all optional</p>
                </div>
            </div>

            <CollapsibleSection title="Personal Information" icon="👤" defaultOpen>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Nationality">
                        <input type="text" placeholder="e.g. Egyptian" value={form.nationality} onChange={e => set("nationality", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="National ID">
                        <input type="text" placeholder="ID Number" value={form.nationalId} onChange={e => set("nationalId", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Marital Status">
                        <select value={form.maritalStatus} onChange={e => set("maritalStatus", e.target.value)} className={selectClass}>
                            <option value="">Select...</option>
                            <option value="single">Single</option>
                            <option value="married">Married</option>
                            <option value="divorced">Divorced</option>
                            <option value="widowed">Widowed</option>
                        </select>
                    </Field>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Professional" icon="💼">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Occupation">
                        <input type="text" placeholder="e.g. Software Engineer" value={form.job} onChange={e => set("job", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Employer">
                        <input type="text" placeholder="Company name" value={form.employer} onChange={e => set("employer", e.target.value)} className={inputClass} />
                    </Field>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Insurance" icon="🛡️">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Insurance Provider">
                        <input type="text" placeholder="Provider name" value={form.insuranceProvider} onChange={e => set("insuranceProvider", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Policy Number">
                        <input type="text" placeholder="Policy #" value={form.insurancePolicyNumber} onChange={e => set("insurancePolicyNumber", e.target.value)} className={inputClass} />
                    </Field>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Emergency Contact" icon="🚨">
                <div className="grid grid-cols-3 gap-4">
                    <Field label="Contact Name">
                        <input type="text" placeholder="Full name" value={form.emergencyName} onChange={e => set("emergencyName", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Relationship">
                        <select value={form.emergencyRelation} onChange={e => set("emergencyRelation", e.target.value)} className={selectClass}>
                            <option value="">Select...</option>
                            <option value="spouse">Spouse</option>
                            <option value="parent">Parent</option>
                            <option value="child">Child</option>
                            <option value="sibling">Sibling</option>
                            <option value="friend">Friend</option>
                            <option value="other">Other</option>
                        </select>
                    </Field>
                    <Field label="Emergency Phone">
                        <input type="tel" placeholder="Phone number" value={form.emergencyPhone} onChange={e => set("emergencyPhone", e.target.value)} className={inputClass} />
                    </Field>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Referral" icon="🔗">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Referred By">
                        <input type="text" placeholder="Doctor / Patient name" value={form.referredBy} onChange={e => set("referredBy", e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Referral Type">
                        <select value={form.referralType} onChange={e => set("referralType", e.target.value)} className={selectClass}>
                            <option value="">Select...</option>
                            <option value="doctor">Doctor</option>
                            <option value="patient">Patient</option>
                            <option value="walk-in">Walk-in</option>
                            <option value="social-media">Social Media</option>
                            <option value="insurance">Insurance</option>
                            <option value="other">Other</option>
                        </select>
                    </Field>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Notes" icon="📝">
                <Field label="General Notes">
                    <textarea
                        rows={3}
                        placeholder="Any important notes about this patient..."
                        value={form.notes}
                        onChange={e => set("notes", e.target.value)}
                        className={`${inputClass} resize-none`}
                    />
                </Field>
            </CollapsibleSection>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  INLINE UI COMPONENTS — Duplicate Banner, Family Suggestion, Quick Mode
// ═══════════════════════════════════════════════════════════════════════════

/** Formats a date string to "12 Feb 2026" style */
function formatDate(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
    });
}

/**
 * DuplicateBanner — shown when phone OR name fuzzy-matches an existing patient.
 * Displays all found duplicates and gives the option to open or ignore.
 */
function DuplicateBanner({ duplicates, onOpenPatient, onDismiss }) {
    if (!duplicates?.length) return null;
    return (
        <div className="mx-8 mt-4 border border-amber-200 bg-amber-50 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-200 bg-amber-100/60">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
                    Possible Existing Patient{duplicates.length > 1 ? "s" : ""} Found
                </p>
                <button onClick={onDismiss} className="ml-auto text-amber-500 hover:text-amber-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="divide-y divide-amber-100">
                {duplicates.map((p) => (
                    <div key={p._id} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-200/60 flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                                {(p.displayName?.[0] || "?").toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-800">
                                    {p.displayName || "Unknown"}
                                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        p._matchType === "phone"
                                            ? "bg-red-100 text-red-600"
                                            : "bg-blue-100 text-blue-600"
                                    }`}>
                                        {p._matchType === "phone" ? "📞 Phone match" : "👤 Name match"}
                                    </span>
                                </p>
                                <p className="text-xs text-slate-500">
                                    {p.phone} · {p.patientCode}
                                    {p.createdAt && ` · Registered ${formatDate(p.createdAt)}`}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenPatient(p._id)}
                            className="px-3 py-1.5 text-xs font-bold bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-all flex-shrink-0"
                        >
                            Open Patient →
                        </button>
                    </div>
                ))}
            </div>
            <div className="px-4 py-2.5 bg-amber-100/40 flex items-center justify-between">
                <p className="text-[11px] text-amber-600 font-medium">Review before creating a duplicate record</p>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-[11px] font-bold text-amber-700 hover:underline"
                >
                    Create New Anyway →
                </button>
            </div>
        </div>
    );
}

/**
 * FamilySuggestionCard — shown when a phone number matches an existing patient.
 * Suggests linking the new patient as a family member of the existing one.
 */
function FamilySuggestionCard({ existingPatient, newPatientId, onLink, onIgnore }) {
    const [relationship, setRelationship] = useState("other");
    const [linking, setLinking] = useState(false);

    const handleLink = async () => {
        setLinking(true);
        try {
            await onLink(existingPatient._id, relationship);
        } finally {
            setLinking(false);
        }
    };

    return (
        <div className="border border-violet-200 bg-violet-50 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-violet-200 bg-violet-100/60">
                <svg className="w-4 h-4 text-violet-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-xs font-bold text-violet-800 uppercase tracking-wide">Family Member Detected</p>
            </div>
            <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-200/60 flex items-center justify-center text-violet-700 font-bold flex-shrink-0">
                    {(existingPatient.displayName?.[0] || "F").toUpperCase()}
                </div>
                <div>
                    <p className="text-sm font-bold text-slate-800">{existingPatient.displayName || "Unknown"}</p>
                    <p className="text-xs text-slate-500">{existingPatient.phone} · {existingPatient.patientCode}</p>
                    <p className="text-[11px] text-violet-600 font-medium mt-0.5">This phone number belongs to an existing patient</p>
                </div>
            </div>
            <div className="px-4 pb-4 flex items-center gap-3">
                <select
                    value={relationship}
                    onChange={e => setRelationship(e.target.value)}
                    className="flex-1 text-xs font-semibold bg-white border border-violet-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                    <option value="spouse">Spouse</option>
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                    <option value="child">Child</option>
                    <option value="sibling">Sibling</option>
                    <option value="other">Other</option>
                </select>
                <button
                    type="button"
                    onClick={handleLink}
                    disabled={linking || !newPatientId}
                    className="px-4 py-2 text-xs font-bold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                >
                    {linking ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : "🔗"} Link Family
                </button>
                <button
                    type="button"
                    onClick={onIgnore}
                    className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-all flex-shrink-0"
                >
                    Ignore
                </button>
            </div>
        </div>
    );
}

/**
 * QuickModeForm — registers a patient with only name + phone.
 * Uses POST /v1/patient/domain/quick → status=incomplete.
 */
function QuickModeForm({ activeBranchId, onCreated, onClose, navigate }) {
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const isArabic = IS_ARABIC.test(fullName);

    const handleQuickCreate = async (openProfile = false) => {
        if (!fullName.trim() || !phone.trim()) return;
        if (!activeBranchId) { setError("Select a branch first."); return; }
        setSaving(true);
        setError(null);
        try {
            const res = await patientsApi.quickCreate({
                fullName: fullName.trim(),
                phone: phone.trim(),
                country: "EG",
                primaryBranchId: activeBranchId,
                allowedBranchIds: [activeBranchId],
            });
            const patient = res.data?.data || res.data;
            onCreated?.(patient);
            onClose();
            if (patient?._id) {
                showToast(`Patient "${fullName.trim()}" created successfully`, 'success');
                navigate(`/org/patients/${patient._id}`);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to create patient.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <h3 className="text-base font-bold text-slate-800">Quick Registration</h3>
                <p className="text-xs text-slate-400 mt-1">Create patient in under 3 seconds. Profile can be completed later.</p>
            </div>

            <Field label="Full Name" required hint={isArabic ? "Arabic name detected" : "First and last name"}>
                <div className="relative">
                    <input
                        type="text"
                        autoFocus
                        placeholder={isArabic ? "الاسم بالعربي" : "e.g. Ahmed Ali"}
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        dir={isArabic ? "rtl" : "ltr"}
                        className={`${inputClass} ${isArabic ? "text-right font-arabic" : ""} pr-16`}
                    />
                    {fullName && (
                        <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded-md border ${isArabic ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-blue-50 text-blue-600 border-blue-100"}`}>
                            {isArabic ? "عربي" : "EN"}
                        </div>
                    )}
                </div>
            </Field>

            <Field label="Phone Number" required>
                <input
                    type="tel"
                    placeholder="+20 100 123 4567"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className={inputClass}
                />
            </Field>

            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-semibold">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
                <button
                    type="button"
                    onClick={() => handleQuickCreate(false)}
                    disabled={saving || !fullName.trim() || !phone.trim()}
                    className="w-full py-3 rounded-xl font-bold text-white text-sm bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                    {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "⚡"}
                    Create Patient
                </button>
                <button
                    type="button"
                    onClick={() => handleQuickCreate(true)}
                    disabled={saving || !fullName.trim() || !phone.trim()}
                    className="w-full py-3 rounded-xl font-bold text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all disabled:opacity-40"
                >
                    Create &amp; Open Profile
                </button>
            </div>

            <p className="text-center text-[11px] text-slate-400">
                Profile marked as <span className="font-bold text-amber-500">incomplete</span> — receptionist can fill details later
            </p>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLINIC ASSIGNMENT SECTION (v32.0)
//  Branch selector + Academic toggle + Doctor assignment
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ClinicAssignmentSection — shown below the main registration form.
 * Lets staff:
 *   1. Assign the patient to a specific branch (overrides header branch)
 *   2. Mark patient as Academic (toggle) — auto-derives from branch clinicType
 *   3. Assign a treating doctor
 */
function ClinicAssignmentSection({ form, set, orgBranches, orgDoctors }) {
    const selectedBranch = orgBranches.find(b => b._id === form.primaryBranchId);
    const isAcademic = form.careType === "ACADEMIC";
    const branchIsAcademic = selectedBranch?.clinicType === "ACADEMIC";

    return (
        <div className="mt-6 border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-800">Clinic Assignment</h3>
                    <p className="text-xs text-slate-400">Branch, care type &amp; assigned doctor</p>
                </div>
                {/* Active badges */}
                {selectedBranch && (
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isAcademic
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-blue-50 text-blue-700 border-blue-100"
                        }`}>
                            {isAcademic ? "🎓 ACADEMIC" : "🏥 PRIVATE"}
                        </span>
                    </div>
                )}
            </div>

            <div className="px-5 py-5 space-y-5">
                {/* ── 1. Branch Selector ──────────────────────────────────────── */}
                <div className="space-y-2">
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Primary Branch <span className="text-red-400">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {orgBranches.length === 0 ? (
                            <div className="col-span-3 py-3 text-xs text-slate-400 text-center">Loading branches...</div>
                        ) : (
                            orgBranches.map(branch => {
                                const isSelected = form.primaryBranchId === branch._id;
                                const isAcademicBranch = branch.clinicType === "ACADEMIC";
                                return (
                                    <button
                                        key={branch._id}
                                        type="button"
                                        onClick={() => set("primaryBranchId", branch._id)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-150 ${
                                            isSelected
                                                ? isAcademicBranch
                                                    ? "border-purple-500 bg-purple-50/60 shadow-sm shadow-purple-500/10"
                                                    : "border-blue-500 bg-blue-50/60 shadow-sm shadow-blue-500/10"
                                                : "border-transparent bg-slate-50 hover:border-slate-300 hover:bg-white"
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                                            isSelected
                                                ? isAcademicBranch ? "bg-purple-600 text-white" : "bg-blue-600 text-white"
                                                : "bg-slate-200 text-slate-500"
                                        }`}>
                                            {(branch.name?.[0] || "B").toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-bold truncate ${isSelected ? "text-slate-800" : "text-slate-600"}`}>
                                                {branch.name}
                                            </p>
                                            <p className="text-[10px] font-semibold">
                                                {isAcademicBranch ? (
                                                    <span className="text-purple-600">🎓 Academic</span>
                                                ) : (
                                                    <span className="text-blue-500">🏥 Private</span>
                                                )}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <svg className={`w-4 h-4 flex-shrink-0 ${isAcademicBranch ? "text-purple-600" : "text-blue-600"}`} fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                            </svg>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ── 2. Academic Care Type Toggle ─────────────────────────────── */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
                    isAcademic
                        ? "border-purple-400 bg-purple-50"
                        : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
                }`}>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{isAcademic ? "🎓" : "🏥"}</span>
                        <div>
                            <p className="text-sm font-bold text-slate-800">
                                {isAcademic ? "Academic Patient" : "Private Patient"}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {branchIsAcademic
                                    ? "Auto-set from selected academic branch"
                                    : isAcademic
                                        ? "Marked as academic — billing is disabled"
                                        : "Standard private patient — billing enabled"
                                }
                            </p>
                        </div>
                    </div>
                    {/* Toggle */}
                    <button
                        type="button"
                        onClick={() => set("careType", isAcademic ? "PRIVATE" : "ACADEMIC")}
                        disabled={branchIsAcademic}  // locked to ACADEMIC when branch is academic
                        title={branchIsAcademic ? "Branch is Academic — care type is locked" : "Toggle care type"}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70 ${
                            isAcademic ? "bg-purple-600" : "bg-slate-300"
                        }`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            isAcademic ? "translate-x-6" : "translate-x-1"
                        }`} />
                    </button>
                </div>

                {/* ACADEMIC warning banner */}
                {isAcademic && (
                    <div className="flex items-start gap-2.5 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5">
                        <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
                        <p className="text-xs text-purple-700 font-medium">
                            <strong>Academic care type:</strong> Invoices, payments, and billing are disabled for this patient. Scheduling must also use an Academic branch.
                        </p>
                    </div>
                )}

                {/* ── 3. Assigned Doctor ────────────────────────────────────────── */}
                <div className="space-y-2">
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Assigned Doctor <span className="text-slate-300 font-normal normal-case">(optional)</span>
                    </label>
                    {orgDoctors.length === 0 ? (
                        <div className="py-3 text-xs text-slate-400 text-center bg-slate-50 rounded-xl border border-slate-100">
                            No practitioners found
                        </div>
                    ) : (
                        <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                </svg>
                            </div>
                            <select
                                value={form.assignedDoctorId || ""}
                                onChange={e => set("assignedDoctorId", e.target.value)}
                                className={`${inputClass} pl-10 appearance-none cursor-pointer`}
                            >
                                <option value="">-- No assigned doctor --</option>
                                {orgDoctors.map(doc => (
                                    <option key={doc._id} value={doc._id}>
                                        Dr. {doc.name || "Unknown"}
                                        {doc.specialty && doc.specialty !== "general" ? ` — ${doc.specialty}` : ""}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </div>
                        </div>
                    )}

                    {/* Selected doctor preview card */}
                    {form.assignedDoctorId && (() => {
                        const doc = orgDoctors.find(d => d._id === form.assignedDoctorId);
                        if (!doc) return null;
                        const initials = (doc.name || "D")[0]?.toUpperCase();
                        return (
                            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                                {doc.avatarUrl ? (
                                    <img src={doc.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-emerald-200" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                        {initials}
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs font-bold text-emerald-800">
                                        Dr. {doc.name || "Unknown"}
                                    </p>
                                    {doc.specialty && doc.specialty !== "general" && (
                                        <p className="text-[10px] text-emerald-600 capitalize">{doc.specialty}</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => set("assignedDoctorId", "")}
                                    className="ml-auto text-emerald-400 hover:text-emerald-600 transition-colors"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN WIZARD COMPONENT — v3.0
// ═══════════════════════════════════════════════════════════════════════════
export default function PatientRegistrationWizard({ open, onClose, onCreated, editMode = false, existingPatientId, existingData }) {
    const navigate = useNavigate();
    const { activeBranchId } = useBranch();
    const { user } = useAuth();
    const orgCountry = user?.organization?.country || "EG";
    const panelRef = useRef(null);



    // ── Wizard State ─────────────────────────────────────────────────────────
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // ── Smart Detection State ─────────────────────────────────────────────────
    const [searching, setSearching] = useState(false);
    const [duplicates, setDuplicates] = useState([]); // [{...patient, _matchType}]
    const [duplicateDismissed, setDuplicateDismissed] = useState(false);
    const [familySuggestion, setFamilySuggestion] = useState(null); // exactPhone patient
    const [familyIgnored, setFamilyIgnored] = useState(false);
    const [createdPatientId, setCreatedPatientId] = useState(null); // for post-create family link

    // ── Form ──────────────────────────────────────────────────────────────────
    // ── Branches + Doctors (for assignment) ─────────────────────────────────
    const { data: branchListRes } = useQuery({
        queryKey: ["branches", "list"],
        queryFn:  () => branchesApi.list(),
        select:   (res) => res.data?.data || res.data || [],
        staleTime: 60_000,
    });
    const orgBranches = Array.isArray(branchListRes) ? branchListRes : [];

    const { data: doctorsRes } = useQuery({
        queryKey: ["practitioners", "list"],
        queryFn:  () => appointmentsApi.getPractitioners(),
        // Response shape: { data: { practitioners: [...] } }
        select:   (res) => res.data?.data?.practitioners || res.data?.practitioners || [],
        staleTime: 60_000,
    });
    const orgDoctors = Array.isArray(doctorsRes) ? doctorsRes : [];

    const [form, setForm] = useState({
        fullName: "", firstName: "", middleName: "", lastName: "",
        nameEnglish: "", nameArabic: "", patientCode: "",
        // ── Token model for Arabic name segment assignment ────────────
        nameRawTokens: [],   // immutable raw word array
        nameFirstRaw:  [],
        nameMidRaw:    [],
        nameLastRaw:   [],
        // ────────────────────────────────────────────────────────────
        genderAutoDetected: false, genderManualOverride: false,
        phone: "", gender: "male", dob: "", dobDay: "", dobMonth: "", dobYear: "",
        email: "", secondaryPhone: "", country: "EG", address: "",
        nationality: "", nationalId: "", maritalStatus: "", job: "", employer: "",
        insuranceProvider: "", insurancePolicyNumber: "",
        emergencyName: "", emergencyPhone: "", emergencyRelation: "",
        referredBy: "", referralType: "",
        notes: "",
        // ── v32.0 Clinic Assignment ───────────────────────────────────
        primaryBranchId:  "",       // user-selected branch
        careType:         "PRIVATE", // auto-derived from branch, overridable
        assignedDoctorId: "",       // assigned treating doctor
    });

    const set = useCallback((field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
        setError(null);
    }, []);

    const setMulti = useCallback((updates) => {
        setForm(prev => ({ ...prev, ...updates }));
        setError(null);
    }, []);

    // ── Reset / Populate when opened/closed ──────────────────────────────────
    useEffect(() => {
        if (!open) {
            setStep(0); setError(null);
            setDuplicates([]); setDuplicateDismissed(false);
            setFamilySuggestion(null); setFamilyIgnored(false);
            setCreatedPatientId(null);
            setForm({
                fullName: "", firstName: "", middleName: "", lastName: "",
                nameEnglish: "", nameArabic: "", patientCode: "",
                nameRawTokens: [], nameFirstRaw: [], nameMidRaw: [], nameLastRaw: [],
                genderAutoDetected: false, genderManualOverride: false,
                phone: "", gender: "male", dob: "", dobDay: "", dobMonth: "", dobYear: "",
                email: "", secondaryPhone: "", country: "EG", address: "",
                nationality: "", nationalId: "", maritalStatus: "", job: "", employer: "",
                insuranceProvider: "", insurancePolicyNumber: "",
                emergencyName: "", emergencyPhone: "", emergencyRelation: "",
                referredBy: "", referralType: "", notes: "",
                primaryBranchId: activeBranchId || "",
                careType: "PRIVATE",
                assignedDoctorId: "",
            });
        } else if (editMode && existingData) {
            // Pre-populate form with existing patient data
            const d = existingData;
            const fullName = d.nameArabic || d.nameEnglish || d.displayName || "";
            const dobStr = d.dateOfBirth || d.dob || "";
            const dobDate = dobStr ? new Date(dobStr) : null;
            setForm({
                fullName,
                firstName: d.firstName || "",
                middleName: d.middleName || "",
                lastName: d.lastName || "",
                nameEnglish: d.nameEnglish || "",
                nameArabic: d.nameArabic || "",
                patientCode: d.patientCode || "",
                nameRawTokens: [], nameFirstRaw: [], nameMidRaw: [], nameLastRaw: [],
                genderAutoDetected: false, genderManualOverride: true,
                phone: d.phone || d.phoneE164 || d.phoneRaw || "",
                gender: d.gender || "male",
                dob: dobStr ? (dobDate ? `${dobDate.getFullYear()}-${String(dobDate.getMonth()+1).padStart(2,'0')}-${String(dobDate.getDate()).padStart(2,'0')}` : "") : "",
                dobDay: dobDate ? String(dobDate.getDate()).padStart(2, '0') : "",
                dobMonth: dobDate ? String(dobDate.getMonth() + 1).padStart(2, '0') : "",
                dobYear: dobDate ? String(dobDate.getFullYear()) : "",
                email: d.email || "",
                secondaryPhone: d.secondaryPhone || "",
                country: d.country || orgCountry || "EG",
                address: d.address || "",
                nationality: d.nationality || "",
                nationalId: d.nationalId || "",
                maritalStatus: d.maritalStatus || "",
                job: d.job || "",
                employer: d.employer || "",
                insuranceProvider: d.insurance?.provider || "",
                insurancePolicyNumber: d.insurance?.policyNumber || "",
                emergencyName: d.emergencyContact?.name || "",
                emergencyPhone: d.emergencyContact?.phone || "",
                emergencyRelation: d.emergencyContact?.relation || "",
                referredBy: d.referredBy || "",
                referralType: d.referralType || "",
                notes: d.notes || "",
                primaryBranchId: d.primaryBranchId?.toString() || "",
                careType: d.careType || "PRIVATE",
                assignedDoctorId: d.assignedDoctorId?.toString() || "",
            });
        } else if (open && !editMode) {
            // Pre-select active branch on fresh open
            setForm(prev => ({
                ...prev,
                primaryBranchId: prev.primaryBranchId || activeBranchId || "",
            }));
        }
    }, [open, editMode, existingData, orgCountry, activeBranchId]);

    // ── Auto-derive careType when branch changes ────────────────────────────
    useEffect(() => {
        if (!form.primaryBranchId || !orgBranches.length) return;
        const branch = orgBranches.find(b => b._id === form.primaryBranchId);
        if (branch?.clinicType) {
            setForm(prev => ({ ...prev, careType: branch.clinicType }));
        }
    }, [form.primaryBranchId, orgBranches]);

    // ── Auto-fetch next patient code preview when wizard opens (create only) ──
    useEffect(() => {
        const branchId = form.primaryBranchId || activeBranchId;
        if (!open || !branchId || editMode) return;

        let cancelled = false;
        const fetchNextCode = async () => {
            try {
                const res = await patientsApi.getNextCode(branchId);
                const data = res.data?.data || res.data;
                if (!cancelled && data?.nextCode) {
                    setForm(prev => ({
                        ...prev,
                        patientCode: prev.patientCode || data.nextCode,
                    }));
                }
            } catch (err) {
                console.warn("[Wizard] Could not fetch next patient code:", err);
            }
        };
        fetchNextCode();

        return () => { cancelled = true; };
    }, [open, form.primaryBranchId, activeBranchId, editMode]);

    // ── Smart Duplicate + Family Detection (debounced 300ms, create only) ─────
    useEffect(() => {
        if (editMode) return; // Skip duplicate detection in edit mode

        const phone = form.phone?.trim();
        const name  = form.fullName?.trim();

        // Reset if inputs are too short
        if (phone.length < 7 && name.length < 3) {
            setDuplicates([]); setFamilySuggestion(null);
            return;
        }
        if (duplicateDismissed) return;

        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const params = {};
                if (phone.length >= 7) params.phone = phone;
                if (name.length >= 3) params.name = name;

                const res = await patientsApi.search({ ...params, limit: 5 });
                const results = res.data?.data?.results || res.data?.results || [];

                setDuplicates(results);

                // Family suggestion: only if there's an EXACT phone match
                const exactPhoneMatch = results.find(
                    r => r._matchType === "phone" &&
                    r.phone?.replace(/\D/g,"").endsWith(phone.replace(/\D/g,"").slice(-9))
                );
                if (exactPhoneMatch && !familyIgnored) {
                    setFamilySuggestion(exactPhoneMatch);
                }
            } catch {
                // Silently ignore search errors — don't block registration
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.phone, form.fullName]);

    // ── Step Validation ──────────────────────────────────────────────────────
    const canProceed = useCallback(() => {
        if (step === 0) return form.fullName.trim() && form.phone.trim();
        return true;
    }, [step, form.fullName, form.phone]);

    // ── Full Submit ───────────────────────────────────────────────────────────
    const handleSubmit = useCallback(async (openProfile = false) => {
        const effectiveBranchId = form.primaryBranchId || activeBranchId;
        if (!editMode && !effectiveBranchId) { setError("Please select a branch to register the patient."); return; }
        setSaving(true); setError(null);
        try {
            const isArabicName = IS_ARABIC.test(form.fullName);
            const payload = {
                name:        form.fullName.trim(),
                patientCode: form.patientCode?.trim() || undefined,
                firstName:   form.firstName  || undefined,
                middleName:  form.middleName || undefined,
                lastName:    form.lastName   || undefined,
                nameEnglish: isArabicName ? "" : form.fullName.trim(),
                nameArabic:  isArabicName ? form.fullName.trim() : (form.nameArabic || undefined),
                phone:         form.phone.trim(),
                gender:        form.gender,
                dateOfBirth:   form.dob || undefined,
                email:         form.email.trim() || undefined,
                secondaryPhone: form.secondaryPhone.trim() || undefined,
                address:       form.address.trim() || undefined,
                nationality:   form.nationality.trim() || undefined,
                nationalId:    form.nationalId.trim() || undefined,
                maritalStatus: form.maritalStatus || undefined,
                job:           form.job.trim() || undefined,
                country:       form.country || undefined,
                insurance: (form.insuranceProvider || form.insurancePolicyNumber) ? {
                    provider: form.insuranceProvider, policyNumber: form.insurancePolicyNumber,
                } : undefined,
                emergencyContact: (form.emergencyName || form.emergencyPhone) ? {
                    name: form.emergencyName, phone: form.emergencyPhone, relation: form.emergencyRelation,
                } : undefined,
                notes:            form.notes.trim() || undefined,
                // ── v32.0 Clinic Assignment ──────────────────────────────
                assignedDoctorId: form.assignedDoctorId || undefined,
                careType:         form.careType || "PRIVATE",
                ...(!editMode && {
                    primaryBranchId:  effectiveBranchId,
                    allowedBranchIds: [effectiveBranchId],
                }),
                ...(editMode && form.primaryBranchId && {
                    primaryBranchId: form.primaryBranchId,
                }),
            };

            if (editMode && existingPatientId) {
                // ── EDIT MODE: Patch existing patient ─────────────────────
                await patientsApi.patch(existingPatientId, payload);
                showToast(`Patient "${form.fullName.trim()}" updated successfully`, 'success');
                onCreated?.();  // triggers refetch in PatientLayout
                onClose();
            } else {
                // ── CREATE MODE ───────────────────────────────────────────
                const res = await patientsApi.create(payload);
                const patient = res.data?.data || res.data;
                setCreatedPatientId(patient?._id);

                onCreated?.(patient);

                if (!familySuggestion || familyIgnored) {
                    onClose();
                    if (patient?._id) {
                        showToast(`Patient "${form.fullName.trim()}" created successfully`, 'success');
                        navigate(`/org/patients/${patient._id}`);
                    }
                } else {
                    setSaving(false);
                    return;
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || err.response?.data?.error?.message || (editMode ? "Failed to update patient." : "Failed to create patient."));
        } finally {
            setSaving(false);
        }
    }, [form, activeBranchId, onCreated, onClose, navigate, familySuggestion, familyIgnored, editMode, existingPatientId]);

    // ── Family Link Handler ───────────────────────────────────────────────────
    const handleLinkFamily = useCallback(async (existingPatientId, relationship) => {
        const sourceId = createdPatientId;
        if (!sourceId) return;
        try {
            await patientsApi.linkFamily(sourceId, { familyMemberId: existingPatientId, relationship });
        } catch (err) {
            console.warn("Family link failed:", err.message);
        } finally {
            setFamilySuggestion(null);
            onClose();
        }
    }, [createdPatientId, onClose]);

    // ── Keyboard Shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); if (canProceed()) handleSubmit(false); return; }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
            if (e.key === "Enter" && !e.ctrlKey && e.target.tagName !== "TEXTAREA") {
                e.preventDefault();
                if (step < 2 && canProceed()) setStep(s => s + 1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, step, canProceed, handleSubmit, onClose]);

    // ── Guard ─────────────────────────────────────────────────────────────────
    if (!open) return null;

    const showDuplicateBanner = duplicates.length > 0 && !duplicateDismissed;
    const showFamilySuggestion = !!familySuggestion && !familyIgnored && createdPatientId;

    return (
        <div className="fixed inset-0 z-[200] flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />

            {/* Panel */}
            <div
                ref={panelRef}
                className="relative w-[900px] max-w-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            >
                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg ${editMode ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/20' : 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/20'}`}>
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {editMode ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                )}
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">{editMode ? 'Edit Patient' : 'Register New Patient'}</h2>
                            <p className="text-xs text-slate-400 mt-0.5">{editMode ? 'Update patient information' : 'Quick registration — fill required fields and create'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Searching spinner */}
                        {searching && (
                            <div className="w-4 h-4 border-2 border-blue-300/40 border-t-blue-500 rounded-full animate-spin" />
                        )}
                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Duplicate Detection Banner ───────────────────────────── */}
                {showDuplicateBanner && (
                    <DuplicateBanner
                        duplicates={duplicates}
                        onOpenPatient={(id) => { onClose(); navigate(`/org/patients/${id}`); }}
                        onDismiss={() => setDuplicateDismissed(true)}
                    />
                )}

                {/* ── Branch Warning (only if no branch selected at all) ───── */}
                {!activeBranchId && !form.primaryBranchId && (
                    <div className="mx-8 mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-semibold">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        Select a branch from the header or below to register patients
                    </div>
                )}

                {/* ── Error ───────────────────────────────────────────────── */}
                {error && (
                    <div className="mx-8 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-semibold">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* ── Scrollable Content ──────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    {/* Family suggestion (post-create) */}
                    {showFamilySuggestion && (
                        <div className="mb-6">
                            <FamilySuggestionCard
                                existingPatient={familySuggestion}
                                newPatientId={createdPatientId}
                                onLink={handleLinkFamily}
                                onIgnore={() => { setFamilyIgnored(true); onClose(); }}
                            />
                        </div>
                    )}

                    {/* ── Unified registration form (Step1 always) ──────────── */}
                    <Step1BasicInfo form={form} set={set} setMulti={setMulti} phoneWarning={null} phoneChecking={searching} orgCountry={orgCountry} />

                    {/* ── v32.0 Clinic Assignment Section ──────────────────── */}
                    <ClinicAssignmentSection
                        form={form}
                        set={set}
                        orgBranches={orgBranches}
                        orgDoctors={orgDoctors}
                    />
                </div>

                {/* ── Footer — always visible create buttons ───────────────── */}
                <div className="px-8 py-4 border-t border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
                    <div className="hidden lg:flex items-center gap-2 text-[10px] text-slate-400">
                        <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200 font-mono">Ctrl+Enter</kbd>
                        <span>create</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {!editMode && (
                            <button
                                type="button"
                                onClick={() => handleSubmit(true)}
                                disabled={saving || !canProceed() || (!activeBranchId && !form.primaryBranchId)}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Create &amp; Open Profile
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => handleSubmit(false)}
                            disabled={saving || !canProceed() || (editMode ? false : (!activeBranchId && !form.primaryBranchId))}
                            className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${
                                editMode
                                    ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                                    : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                            }`}
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {editMode ? 'Saving…' : 'Creating…'}
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                    {editMode ? 'Save Changes' : 'Create Patient'}
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* ── Keyboard shortcut bar ────────────────────────────────── */}
                <div className="px-8 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-6 text-[10px] text-slate-400 flex-shrink-0">
                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Tab</kbd> next field</span>
                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Enter</kbd> next step</span>
                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Ctrl+Enter</kbd> create</span>
                    <span><kbd className="px-1 py-0.5 bg-white rounded border font-mono">Esc</kbd> close</span>
                </div>
            </div>
        </div>
    );
}

