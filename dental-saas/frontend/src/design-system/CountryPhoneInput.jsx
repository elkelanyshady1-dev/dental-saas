/**
 * CountryPhoneInput — Smart Phone Input with Country Selector
 * v1.0 — Organization-Aware Phone Entry
 *
 * Features:
 *   - Flag + dial code dropdown for country selection
 *   - Auto-defaults to organization country
 *   - Local number entry only — no need to type country code
 *   - Outputs E.164 format for backend storage
 *   - Validates on blur via basic rules
 *
 * Props:
 *   value       – E.164 string (e.g. "+201003307352") or local digits
 *   onChange     – fn(e164Value, { country, localNumber, isValid })
 *   defaultCountry – ISO 3166-1 alpha-2 (e.g. "EG"), defaults to "EG"
 *   disabled    – boolean
 *   className   – additional CSS classes for wrapper
 *   error       – boolean, shows error ring
 *   placeholder – custom placeholder text
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── Country Database ────────────────────────────────────────────────────────
// Curated list of MEA + common international countries.
// ISO code → { name, flag, dialCode, phoneLengths (local digits without leading 0) }
const COUNTRIES = [
    { code: "EG", name: "Egypt",            nameAr: "مصر",                flag: "🇪🇬", dial: "+20",  lengths: [10, 11] },
    { code: "SA", name: "Saudi Arabia",     nameAr: "السعودية",           flag: "🇸🇦", dial: "+966", lengths: [9] },
    { code: "AE", name: "UAE",              nameAr: "الإمارات",           flag: "🇦🇪", dial: "+971", lengths: [9] },
    { code: "KW", name: "Kuwait",           nameAr: "الكويت",             flag: "🇰🇼", dial: "+965", lengths: [8] },
    { code: "QA", name: "Qatar",            nameAr: "قطر",                flag: "🇶🇦", dial: "+974", lengths: [8] },
    { code: "BH", name: "Bahrain",          nameAr: "البحرين",            flag: "🇧🇭", dial: "+973", lengths: [8] },
    { code: "OM", name: "Oman",             nameAr: "عُمان",              flag: "🇴🇲", dial: "+968", lengths: [8] },
    { code: "JO", name: "Jordan",           nameAr: "الأردن",             flag: "🇯🇴", dial: "+962", lengths: [9] },
    { code: "LB", name: "Lebanon",          nameAr: "لبنان",              flag: "🇱🇧", dial: "+961", lengths: [7, 8] },
    { code: "IQ", name: "Iraq",             nameAr: "العراق",             flag: "🇮🇶", dial: "+964", lengths: [10] },
    { code: "SY", name: "Syria",            nameAr: "سوريا",              flag: "🇸🇾", dial: "+963", lengths: [9] },
    { code: "LY", name: "Libya",            nameAr: "ليبيا",              flag: "🇱🇾", dial: "+218", lengths: [9, 10] },
    { code: "TN", name: "Tunisia",          nameAr: "تونس",               flag: "🇹🇳", dial: "+216", lengths: [8] },
    { code: "MA", name: "Morocco",          nameAr: "المغرب",             flag: "🇲🇦", dial: "+212", lengths: [9] },
    { code: "DZ", name: "Algeria",          nameAr: "الجزائر",            flag: "🇩🇿", dial: "+213", lengths: [9] },
    { code: "SD", name: "Sudan",            nameAr: "السودان",            flag: "🇸🇩", dial: "+249", lengths: [9] },
    { code: "PS", name: "Palestine",        nameAr: "فلسطين",             flag: "🇵🇸", dial: "+970", lengths: [9] },
    { code: "YE", name: "Yemen",            nameAr: "اليمن",              flag: "🇾🇪", dial: "+967", lengths: [9] },
    { code: "US", name: "United States",    nameAr: "أمريكا",             flag: "🇺🇸", dial: "+1",   lengths: [10] },
    { code: "GB", name: "United Kingdom",   nameAr: "بريطانيا",           flag: "🇬🇧", dial: "+44",  lengths: [10, 11] },
    { code: "DE", name: "Germany",          nameAr: "ألمانيا",            flag: "🇩🇪", dial: "+49",  lengths: [10, 11] },
    { code: "FR", name: "France",           nameAr: "فرنسا",              flag: "🇫🇷", dial: "+33",  lengths: [9] },
    { code: "TR", name: "Turkey",           nameAr: "تركيا",              flag: "🇹🇷", dial: "+90",  lengths: [10] },
    { code: "IN", name: "India",            nameAr: "الهند",              flag: "🇮🇳", dial: "+91",  lengths: [10] },
    { code: "PK", name: "Pakistan",         nameAr: "باكستان",            flag: "🇵🇰", dial: "+92",  lengths: [10] },
];

const COUNTRY_MAP = Object.fromEntries(COUNTRIES.map(c => [c.code, c]));

/**
 * Strip local leading zero(s) — common in MEA dialing conventions.
 * Egyptian numbers: 010xxxxx → 10xxxxx (mobile), 02xxxxx → 2xxxxx (landline)
 */
function stripLeadingZero(localDigits) {
    return localDigits.replace(/^0+/, "");
}

/**
 * Parse an E.164 string into { countryCode, localNumber }
 * Tries longest dial prefix match first.
 */
function parseE164(value) {
    if (!value || !value.startsWith("+")) return null;

    // Sort by dial length descending so +971 matches before +9
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
        if (value.startsWith(c.dial)) {
            return {
                countryCode: c.code,
                localNumber: value.slice(c.dial.length),
            };
        }
    }
    return null;
}

export default function CountryPhoneInput({
    value = "",
    onChange,
    defaultCountry = "EG",
    disabled = false,
    className = "",
    error = false,
    placeholder,
}) {
    const [selectedCountry, setSelectedCountry] = useState(
        COUNTRY_MAP[defaultCountry] || COUNTRIES[0]
    );
    const [localNumber, setLocalNumber] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);
    const searchRef = useRef(null);

    // ── Initialize from value prop (E.164) ────────────────────────────────
    useEffect(() => {
        if (value && value.startsWith("+")) {
            const parsed = parseE164(value);
            if (parsed) {
                const country = COUNTRY_MAP[parsed.countryCode];
                if (country) setSelectedCountry(country);
                setLocalNumber(parsed.localNumber);
                return;
            }
        }
        // If value is just digits (no +), treat as local
        if (value && !value.startsWith("+")) {
            setLocalNumber(value.replace(/\D/g, ""));
        }
    }, [value]); // React to value changes (edit mode pre-population)

    // ── Sync defaultCountry changes ──────────────────────────────────────
    useEffect(() => {
        if (defaultCountry && COUNTRY_MAP[defaultCountry] && !value) {
            setSelectedCountry(COUNTRY_MAP[defaultCountry]);
        }
    }, [defaultCountry]);

    // ── Close dropdown on outside click ──────────────────────────────────
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ── Focus search when dropdown opens ─────────────────────────────────
    useEffect(() => {
        if (dropdownOpen && searchRef.current) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [dropdownOpen]);

    // ── Build E.164 and emit ─────────────────────────────────────────────
    const emitChange = useCallback((country, local) => {
        const clean = stripLeadingZero(local.replace(/\D/g, ""));
        const e164 = clean ? `${country.dial}${clean}` : "";
        const isValid = clean.length > 0 && country.lengths.includes(clean.length);

        onChange?.(e164, {
            country: country.code,
            localNumber: clean,
            isValid,
            dialCode: country.dial,
        });
    }, [onChange]);

    const handleLocalChange = useCallback((e) => {
        const raw = e.target.value.replace(/[^\d\s-]/g, ""); // Allow digits, spaces, dashes
        setLocalNumber(raw);
        emitChange(selectedCountry, raw);
    }, [selectedCountry, emitChange]);

    const handleCountrySelect = useCallback((country) => {
        setSelectedCountry(country);
        setDropdownOpen(false);
        setSearch("");
        emitChange(country, localNumber);
        // Focus the number input after country selection
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [localNumber, emitChange]);

    // ── Filtered country list ────────────────────────────────────────────
    const filteredCountries = useMemo(() => {
        if (!search) return COUNTRIES;
        const s = search.toLowerCase();
        return COUNTRIES.filter(c =>
            c.name.toLowerCase().includes(s) ||
            c.nameAr.includes(s) ||
            c.code.toLowerCase().includes(s) ||
            c.dial.includes(s)
        );
    }, [search]);

    // ── Validation state ─────────────────────────────────────────────────
    const cleanLocal = stripLeadingZero(localNumber.replace(/\D/g, ""));
    const isValid = cleanLocal.length > 0 && selectedCountry.lengths.includes(cleanLocal.length);
    const showValidation = cleanLocal.length > 3; // Only show after some typing

    const dynamicPlaceholder = placeholder ||
        `${selectedCountry.code === "EG" ? "100 123 4567" : "5xx xxx xxxx"}`;

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <div
                className={`
                    flex items-stretch rounded-xl border transition-all duration-200
                    ${error ? "border-red-400 ring-2 ring-red-100" :
                      showValidation && isValid ? "border-emerald-300 ring-2 ring-emerald-50" :
                      showValidation && !isValid ? "border-amber-300 ring-2 ring-amber-50" :
                      "border-slate-200 hover:border-slate-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"}
                    ${disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "bg-white"}
                `}
            >
                {/* ── Country Selector Button ─────────────────────────────── */}
                <button
                    type="button"
                    onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
                    disabled={disabled}
                    className="
                        flex items-center gap-1.5 px-3 py-2.5
                        border-r border-slate-200
                        hover:bg-slate-50 active:bg-slate-100
                        transition-colors rounded-l-xl
                        focus:outline-none focus:bg-blue-50
                        min-w-[90px] justify-center
                        select-none cursor-pointer
                    "
                    tabIndex={-1}
                >
                    <span className="text-lg leading-none">{selectedCountry.flag}</span>
                    <span className="text-[13px] font-semibold text-slate-600 tabular-nums">
                        {selectedCountry.dial}
                    </span>
                    <svg
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* ── Local Number Input ──────────────────────────────────── */}
                <input
                    ref={inputRef}
                    type="tel"
                    inputMode="numeric"
                    placeholder={dynamicPlaceholder}
                    value={localNumber}
                    onChange={handleLocalChange}
                    disabled={disabled}
                    dir="ltr"
                    className="
                        flex-1 px-3 py-2.5
                        text-[14px] font-medium text-slate-800
                        placeholder:text-slate-300
                        focus:outline-none
                        bg-transparent
                        rounded-r-xl
                        tabular-nums tracking-wide
                    "
                />

                {/* ── Validation indicator ─────────────────────────────────── */}
                {showValidation && (
                    <div className="flex items-center pr-3">
                        {isValid ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                                <span className="text-amber-600 text-[11px] font-bold">!</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── E.164 Preview (small helper text) ──────────────────────── */}
            {cleanLocal.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1 tabular-nums tracking-wide pl-1" dir="ltr">
                    {selectedCountry.dial}{cleanLocal}
                </p>
            )}

            {/* ── Country Dropdown ────────────────────────────────────────── */}
            {dropdownOpen && (
                <div className="
                    absolute left-0 top-full mt-1 z-50
                    w-72 max-h-64 overflow-hidden
                    bg-white rounded-xl border border-slate-200
                    shadow-xl shadow-slate-200/50
                    animate-in fade-in slide-in-from-top-2 duration-200
                ">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-100">
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search country..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="
                                w-full px-3 py-2 text-[13px]
                                border border-slate-200 rounded-lg
                                focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100
                                placeholder:text-slate-300
                            "
                        />
                    </div>

                    {/* Country List */}
                    <div className="overflow-y-auto max-h-48 overscroll-contain">
                        {filteredCountries.length === 0 && (
                            <p className="text-center text-sm text-slate-400 py-4">No countries found</p>
                        )}
                        {filteredCountries.map(c => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => handleCountrySelect(c)}
                                className={`
                                    w-full flex items-center gap-3 px-3 py-2.5
                                    text-left hover:bg-blue-50 active:bg-blue-100
                                    transition-colors
                                    ${c.code === selectedCountry.code ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}
                                `}
                            >
                                <span className="text-lg">{c.flag}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-slate-700 truncate">
                                        {c.name}
                                        <span className="text-slate-400 ml-1.5 text-[11px]">{c.nameAr}</span>
                                    </p>
                                </div>
                                <span className="text-[12px] font-semibold text-slate-500 tabular-nums">
                                    {c.dial}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Exported utilities ───────────────────────────────────────────────────────
export { COUNTRIES, COUNTRY_MAP, parseE164, stripLeadingZero };
