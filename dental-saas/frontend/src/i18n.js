/**
 * i18n.js
 * Language configuration for the Org layer.
 * Bootstrapped once at app startup; language can be updated at runtime via i18n.changeLanguage().
 *
 * Usage:
 *   import i18n from './i18n';          // initialises once
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   t('fullName') // "Full Name" | "الاسم بالكامل"
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
    en: {
        translation: {
            // Patient form
            fullName: "Full Name",
            phone: "Phone Number",
            branch: "Home Branch",
            country: "Country Code",
            email: "Email (Optional)",
            gender: "Gender",
            dateOfBirth: "Date of Birth",
            complete: "Complete Registration",
            cancel: "Cancel",
            selectBranch: "Select Branch",
            patientCodeGenerated: "Patient code (PT-YYYY-XXXX) will be generated automatically.",
            registerTitle: "Register New Patient",
            registerSubtitle: "Fill in the details to create a standard patient record.",
            successMsg: "Patient registration successful! Redirecting...",
            // Validation
            nameRequired: "Patient name is required (min 2 characters).",
            phoneRequired: "Valid phone number is required (min 6 digits).",
            branchRequired: "Branch association is required.",
            // Search / list
            searchPlaceholder: "Search patients...",
            noResults: "No patients found.",
            // Misc
            notifications: "Notifications",
            settings: "Settings",
            signOut: "Sign Out",
            language: "Language",
        },
    },
    ar: {
        translation: {
            // Patient form
            fullName: "الاسم بالكامل",
            phone: "رقم الهاتف",
            branch: "الفرع الرئيسي",
            country: "رمز الدولة",
            email: "البريد الإلكتروني (اختياري)",
            gender: "الجنس",
            dateOfBirth: "تاريخ الميلاد",
            complete: "تسجيل المريض",
            cancel: "إلغاء",
            selectBranch: "اختر الفرع",
            patientCodeGenerated: "سيتم إنشاء كود المريض (PT-YYYY-XXXX) تلقائياً.",
            registerTitle: "تسجيل مريض جديد",
            registerSubtitle: "أدخل بيانات المريض لإنشاء ملفه الطبي.",
            successMsg: "تم تسجيل المريض بنجاح! جارٍ التوجيه...",
            // Validation
            nameRequired: "اسم المريض مطلوب (٢ أحرف على الأقل).",
            phoneRequired: "رقم هاتف صحيح مطلوب (٦ أرقام على الأقل).",
            branchRequired: "تحديد الفرع مطلوب.",
            // Search / list
            searchPlaceholder: "البحث عن المرضى...",
            noResults: "لم يتم إيجاد مرضى.",
            // Misc
            notifications: "الإشعارات",
            settings: "الإعدادات",
            signOut: "تسجيل الخروج",
            language: "اللغة",
        },
    },
};

i18n
    .use(initReactI18next)
    .init({
        resources,
        lng: "en", // default; overridden by OrgBrandingContext from org.defaultLanguage
        fallbackLng: "en",
        interpolation: { escapeValue: false }, // React already escapes
    });

export default i18n;
