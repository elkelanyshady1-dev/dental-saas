import { createContext, useContext, useState, useCallback } from "react";
import api from "../services/api";
import i18n from "../i18n";

const OrgBrandingContext = createContext(null);

export const useOrgBranding = () => useContext(OrgBrandingContext);

/** Apply language to i18n runtime and document dir/lang attributes */
function applyLanguage(lang) {
    if (!lang) return;
    i18n.changeLanguage(lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
}

/**
 * OrgBrandingProvider
 * Fetches and caches organization profile (name + logoUrl + defaultLanguage + timezone).
 * Wrap around OrgLayout so all org pages can read branding.
 */
export function OrgBrandingProvider({ children }) {
    const [orgName,         setOrgName]         = useState("");
    const [logoUrl,         setLogoUrl]         = useState(null);
    const [defaultLanguage, setDefaultLanguage] = useState("en");
    const [timezone,        setTimezone]        = useState("Africa/Cairo");
    const [autoDetectTz,    setAutoDetectTz]    = useState(true);
    const [loaded,          setLoaded]          = useState(false);

    const fetchProfile = useCallback(async () => {
        try {
            const res = await api.get("/org/settings/profile");
            const data = res?.data?.data ?? res?.data ?? res;
            setOrgName(data?.name || "");
            setLogoUrl(data?.logoUrl || null);
            const lang = data?.defaultLanguage || "en";
            setDefaultLanguage(lang);
            applyLanguage(lang);
            // Timezone
            const tz = data?.timezone || "Africa/Cairo";
            const autoDetect = data?.autoDetectTimezone ?? true;
            setTimezone(autoDetect ? (Intl.DateTimeFormat().resolvedOptions().timeZone || tz) : tz);
            setAutoDetectTz(autoDetect);
        } catch (err) {
            console.error("[OrgBranding] Failed to fetch org profile:", err);
        } finally {
            setLoaded(true);
        }
    }, []);

    /** Called after a successful logo upload to refresh state instantly */
    const refreshBranding = useCallback(() => fetchProfile(), [fetchProfile]);

    /**
     * Persist language change to backend and apply locally.
     * @param {"en"|"ar"} lang
     */
    const updateLanguage = useCallback(async (lang) => {
        try {
            await api.patch("/settings/organization/language", { language: lang });
            setDefaultLanguage(lang);
            applyLanguage(lang);
        } catch (err) {
            console.error("[OrgBranding] Failed to update language:", err);
        }
    }, []);

    /**
     * Persist timezone change to backend and apply locally.
     * @param {string} tz     — IANA timezone
     * @param {boolean} auto  — autoDetectTimezone flag
     */
    const updateTimezone = useCallback(async (tz, auto) => {
        try {
            await api.patch("/org/settings/organization/timezone", {
                timezone: tz,
                autoDetectTimezone: auto,
            });
            setTimezone(auto ? (Intl.DateTimeFormat().resolvedOptions().timeZone || tz) : tz);
            setAutoDetectTz(auto);
        } catch (err) {
            console.error("[OrgBranding] Failed to update timezone:", err);
            throw err; // re-throw so UI can show error
        }
    }, []);

    return (
        <OrgBrandingContext.Provider value={{
            orgName, logoUrl, defaultLanguage, loaded,
            timezone, autoDetectTimezone: autoDetectTz,
            fetchProfile, refreshBranding, updateLanguage, updateTimezone,
        }}>
            {children}
        </OrgBrandingContext.Provider>
    );
}
