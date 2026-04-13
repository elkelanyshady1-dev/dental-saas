/**
 * StaffFormModal.jsx — Create / Edit Staff Modal (v3.0 — Org Email System)
 *
 * v3.0 Changes:
 *  - Email is NOW SYSTEM-GENERATED on backend: {firstName}.{lastName}@{orgSlug}.clinic
 *  - Email input REMOVED from create mode (shown as read-only preview only)
 *  - Branch multi-select added (single / multi / full access)
 *  - Avatar / photo upload preserved
 *  - orgSlug passed as prop from StaffPage (sourced from auth context)
 *  - Success state shows generated email with copy button
 */
import { useState, useRef, useEffect } from "react";
import { formatRoleName } from "../utils/roleFormatter";
import { staffApi } from "../api/staff.api";
import { useBranches } from "../hooks/useBranches";

// ── Predefined avatar options
const AVATARS = [
    { label: "Male Doctor",    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBzj3fHh57WbgvMsXM5uD5i9OxD8FcH65IYg4lmrABqQNgckfHcpCL_pCBzwYOFbVeKj4tNf8UWDlXMqV8dzcJLj_30Ry-pra2tjEFrd-Am_OewPSALL9BYFRHMigf9L93AKRNN3qhd8YoPfZl5FFbH-KHKoTwzqUXyzA4BW-3dumLZGa2uYRLW17t-QC87UmGNcPHDhSqQFxWqZ0CdaX5BM6XKnnImnROHpdlaKAZ_wtWMVny3KIOYqFyeF75REWs4WEVCXHfrsJU" },
    { label: "Female Doctor",  src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCEhADJK7Y3Rms4lwBKChxXnEAhEa7IbKa_ZuO5nc77tYsvHSoZRifw4P1jG7n28ZY6F3ThYvdYXW-DojzU1Va5SdOp0vgdT2WUagMt6D6mP-DSkP2mQaTbVeVCkOGbdZZHOEQqNhj7u9Y6oZwF5WGYsV4gzMQ0R4IjJoGCcaJStbDXlhk8sUQbclAnOUjuHJd_Jjqxug4yBmEZolpmtP6WxrU4a7ELZdr1ewTZRTEWm7h-ll7kcQsUVMdD-3WHCfIQtFw9_fvR3xk" },
    { label: "Male Assistant", src: "https://lh3.googleusercontent.com/aida-public/AB6AXuDMe28hChj-ISmB03ttyardi_6FsQjvQKBwO2NOJUGQ0W_WGqSLqO0WbVRmB6FULTWV7SHXjzIH5aq0Jfr-ud_qef_b-K83zALIoQiBzmuCxuWmxUS1-UrT7s6XlZi8tITdj2unDXrp8p4MO-SHVSjuDM9a3coQ0ijyOk32vBqIIVZN00XRWZfBNjR0E6IQMlTmPQmBMqfs5j9wXsJCoffNNWoRTxzi5SKszLfXF6HIafFrvbdq0Xc7CgA7Yl3IkgSEEK3YuwEwONI" },
    { label: "Female Assistant", src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBtJCtRgvTUA8l1nohMfRvNBkNf6-IFcV5JXU4fagXPmq5rFLJe9xzvm7JrzAisgLRQ1Q04ELcdA1IFXdL0xkUwJibiFaGN3ajfPxDajfOUq0geZOZz2MIe4sis16pU-DpIXTwwWsOu6HKPcyB5j8C12hkDBJLmg0cj7wBg7JNbAjn4a2IXcQxFgPi8w9hksU7cyTEO8ZahLE5IF-lu1FhJYOKlxHJD5KSA0Fe3EsbTU5s1o96qt2GAdVEVAoUVSK7IvhpDZ8aU0Nc" },
    { label: "Male Staff",     src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBhNp9Ce9RIeMLzucPO56yjHzvY6m_9YaryvDvTUat6QbeUqIiRY_zN7dDl_jR7GzOHv9ltoYAMpzNMfoo6cLCk3zn910R0lHVI-p62z6dbp-_QWXA0oL9-Vxq9EGS0n5kAPMyrE-styhhcw_u7OnaVOpBJebO68ziJXsL4X7Rq3YywR7-FxaU5fSnoTMpsGcv7uKiaSyJxIO_WOV-d6WDcQJVZt8D3Y4fjOE2YKRtWZgQKCC8qZ_CNHYNjPA65iVZkzJCgfBmxUD8" },
    { label: "Female Staff",   src: "https://lh3.googleusercontent.com/aida-public/AB6AXuC4lgGEvYq-M9QIvLtt9mKNSkkGSRE_17iBa_8KHNmv7dtczhnNFw7pjWoGC7HciXYxHXSAfi6MQsWKdKg4tbIulMzhr0EBAfKpyFDCWDZ1AJV5Toui85ftc660TTDuc5_XgiMUjaUnLmwAsgL8pq-C8w6-eOS_7yi0uchaUHnrA4XQRe5s72OIW-aC_2vAOlINhH5OQcYczqRYT7eNzLzAh-lY3AjSKNnENDOrDJngBCbhqdv5VUU0hWQaUTo-Fv6yknoCDKKvG70" },
];

const SPECIALTY_OPTIONS = [
    { value: "orthodontist",    label: "Orthodontist" },
    { value: "general",         label: "General Dentist" },
    { value: "periodontist",    label: "Periodontist" },
    { value: "endodontist",     label: "Endodontist" },
    { value: "pediatric",       label: "Pediatric Dentist" },
    { value: "surgeon",         label: "Oral Surgeon" },
    { value: "prosthodontist",  label: "Prosthodontist" },
    { value: "other",           label: "Other" },
];

const inp = (err) =>
    `w-full px-4 py-3 rounded-lg bg-white border-0 ring-1 ${err ? "ring-red-400 bg-red-50" : "ring-gray-200"
    } focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all text-gray-900 text-sm placeholder:text-gray-400`;

function Field({ label, required, error, children, hint }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {children}
            {hint && !error && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
        </div>
    );
}

function SectionHeader({ icon, title, badge, color = "blue" }) {
    const cls = {
        blue: "bg-blue-50 text-blue-600",
        violet: "bg-violet-50 text-violet-600",
        orange: "bg-orange-50 text-orange-600",
        green: "bg-green-50 text-green-600",
    }[color];
    return (
        <div className="flex items-center gap-3 mb-6">
            <div className={`h-8 w-8 rounded-lg ${cls} flex items-center justify-center flex-shrink-0`}>{icon}</div>
            <h3 className="text-lg font-bold tracking-tight text-gray-900">{title}</h3>
            {badge && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    {badge}
                </span>
            )}
        </div>
    );
}

// ── Branch multi-select tag component ─────────────────────────────────────────
function BranchMultiSelect({ branches, selectedIds, onChange, disabled }) {
    const toggle = (id) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter((b) => b !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    if (!branches.length) {
        return (
            <div className="text-xs text-gray-400 py-2 px-3 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                No branches found — branches will be added soon
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {branches.map((b) => {
                const isSelected = selectedIds.includes(b._id);
                return (
                    <button
                        key={b._id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(b._id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                            isSelected
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                        {isSelected && (
                            <svg className="inline w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                        {b.name}
                    </button>
                );
            })}
        </div>
    );
}

// ── Success banner shown after creation ───────────────────────────────────────
function CreationSuccess({ email, onClose }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(email).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4"
            style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(8px)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
                {/* Check icon */}
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-1" style={{ fontFamily: "Manrope, sans-serif" }}>
                    Staff Member Created
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                    Share the clinic email with the staff member — they will use it to log in.
                </p>

                {/* Email display */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-6">
                    <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1.5">Clinic Login Email</p>
                    <p className="text-lg font-extrabold text-blue-700 break-all">{email}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={copy}
                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border ${
                            copied
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                        }`}
                    >
                        {copied ? "✓ Copied!" : "Copy Email"}
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-[2] py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/25 hover:shadow-xl transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function StaffFormModal({
    staff = null,
    roles = [],
    orgSlug = "",
    onSave,
    onClose,
    isSaving = false,
}) {
    const safeRoles = Array.isArray(roles) ? roles : [];
    const isEditing = !!staff;

    // Branches from React Query
    const { data: branches = [] } = useBranches();

    // ── Avatar
    const initAvatarIdx = AVATARS.findIndex((a) => a.src === staff?.profileImage);

    // ── Form state
    const [form, setForm] = useState({
        firstName: staff?.firstName || "",
        lastName: staff?.lastName || "",
        password: "",
        phone: staff?.phone || "",
        jobTitle: staff?.jobTitle || "",
        // v32.0 — canonical specialty from profile.specialty (fall back to root speciality)
        specialty: staff?.profile?.specialty || staff?.speciality || "general",
        isPractitioner: staff?.isPractitioner ?? false,
        roleId: staff?.roleId?._id || staff?.roleId || (safeRoles[0]?._id ?? ""),
        hasFullBranchAccess: staff?.hasFullBranchAccess ?? false,
        branchIds: (() => {
            const raw = staff?.branchAccess || [];
            return raw.map((b) => (typeof b === "object" ? b._id : b));
        })(),
        profileImage: staff?.profileImage || AVATARS[0].src,
    });

    // ── Email preview (derived, not stored in form — backend generates the real one)
    const previewEmail = (() => {
        const first = form.firstName.trim();
        const last = form.lastName.trim();
        if (!first && !last) return `name@${orgSlug || "clinic"}.clinic`;
        const safe = `${first}.${last}`.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "");
        return `${safe}@${orgSlug || "clinic"}.clinic`;
    })();

    // ── Live username availability state
    // status: 'idle' | 'checking' | 'available' | 'taken' | 'error'
    const [usernameStatus, setUsernameStatus] = useState("idle");
    const [suggestedEmail, setSuggestedEmail] = useState(null);
    const checkTimerRef = useRef(null);

    // Debounced live check — only fires in create mode when both names are filled
    useEffect(() => {
        if (isEditing) return;
        const first = form.firstName.trim();
        const last = form.lastName.trim();
        if (!first || !last || !orgSlug) {
            setUsernameStatus("idle");
            setSuggestedEmail(null);
            return;
        }

        setUsernameStatus("checking");
        clearTimeout(checkTimerRef.current);
        checkTimerRef.current = setTimeout(async () => {
            try {
                const res = await staffApi.checkUsername(first, last);
                const data = res.data;
                if (data.available) {
                    setUsernameStatus("available");
                    setSuggestedEmail(null);
                } else {
                    setUsernameStatus("taken");
                    setSuggestedEmail(data.suggestedEmail || null);
                }
            } catch {
                setUsernameStatus("error");
            }
        }, 500);

        return () => clearTimeout(checkTimerRef.current);
    }, [form.firstName, form.lastName, orgSlug, isEditing]);

    const [avatarIdx, setAvatarIdx] = useState(initAvatarIdx >= 0 ? initAvatarIdx : 0);
    const [uploadedPreview, setUploadedPreview] = useState(null);
    const [uploadFile, setUploadFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [errors, setErrors] = useState({});
    const [apiError, setApiError] = useState(null);
    const [createdEmail, setCreatedEmail] = useState(null); // for success banner
    const fileInputRef = useRef(null);

    const set = (k, v) => {
        setForm((p) => ({ ...p, [k]: v }));
        setErrors((p) => ({ ...p, [k]: undefined }));
        setApiError(null);
    };

    const selectAvatar = (idx) => {
        setAvatarIdx(idx);
        setUploadedPreview(null);
        setUploadFile(null);
        set("profileImage", AVATARS[idx].src);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadFile(file);
        setUploadedPreview(URL.createObjectURL(file));
        setAvatarIdx(-1);
    };

    const previewSrc = uploadedPreview || form.profileImage;

    const validate = () => {
        const e = {};
        if (!form.firstName.trim()) e.firstName = "Required";
        if (!form.lastName.trim()) e.lastName = "Required";
        if (!isEditing && !form.password.trim()) e.password = "Required";
        if (!isEditing && form.password && form.password.length < 6) e.password = "Min 6 characters";
        if (!form.roleId) e.roleId = "Select a role";
        if (!form.hasFullBranchAccess && form.branchIds.length === 0)
            e.branchIds = "Select at least one branch or grant full access";
        return e;
    };

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        const e = validate();
        if (Object.keys(e).length) { setErrors(e); return; }

        const payload = {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            roleId: form.roleId,
            isPractitioner: form.isPractitioner,
            specialty: form.isPractitioner ? form.specialty : null,
            hasFullBranchAccess: form.hasFullBranchAccess,
            branchIds: form.hasFullBranchAccess ? [] : form.branchIds,
            profileImage: form.profileImage,
        };
        if (!isEditing) payload.password = form.password;
        if (form.phone) payload.phone = form.phone;
        if (form.jobTitle) payload.jobTitle = form.jobTitle;

        try {
            // Edit mode: upload custom avatar first if selected
            if (uploadFile && isEditing && staff?._id) {
                setIsUploading(true);
                const res = await staffApi.uploadAvatar(staff._id, uploadFile);
                payload.profileImage = res.data?.data?.profileImage || payload.profileImage;
                setIsUploading(false);
            }

            const result = await onSave(payload, uploadFile);

            // Create mode: show success banner with generated email
            if (!isEditing) {
                const generatedEmail =
                    result?.data?.data?.email ||
                    result?.data?.email ||
                    (suggestedEmail && usernameStatus === "taken" ? suggestedEmail : previewEmail);
                setCreatedEmail(generatedEmail);
            }
        } catch (err) {
            setIsUploading(false);
            const errCode = err?.response?.data?.error;
            if (errCode === "EMAIL_ALREADY_EXISTS_IN_ORG") {
                setApiError(
                    "⚠️ All 99 name variants for this name are taken. " +
                    "Please provide a different name (e.g. add a middle initial)."
                );
            } else {
                setApiError(
                    err?.response?.data?.message ||
                    err?.response?.data?.error?.message ||
                    "Operation failed. Please try again."
                );
            }
        }
    };

    // If we just created successfully, show the success banner
    if (createdEmail) {
        return <CreationSuccess email={createdEmail} onClose={onClose} />;
    }

    const selectedRole = safeRoles.find((r) => r._id === form.roleId);

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            style={{ background: "rgba(15,23,42,0.65)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
                style={{ maxHeight: "92vh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-8 py-6 bg-gray-50 flex justify-between items-center border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                            {isEditing ? "Edit Staff Member" : "Create Staff Member"}
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {isEditing
                                ? "Update team member information and role assignment"
                                : "A clinic email will be automatically generated"}
                        </p>
                    </div>
                    <button
                        id="staff-modal-close"
                        onClick={onClose}
                        className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition text-gray-400 hover:text-gray-700"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto" style={{ maxHeight: "calc(92vh - 88px)" }}>
                    {apiError && (
                        <div className="mx-8 mt-5 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {apiError}
                        </div>
                    )}

                    <form id={isEditing ? "edit-staff-form" : "create-staff-form"} onSubmit={handleSubmit} className="p-8 space-y-10">

                        {/* ── Section 0: Profile Picture */}
                        <section>
                            <SectionHeader
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                title="Profile Picture"
                            />
                            <div className="flex flex-col md:flex-row items-center gap-8 p-6 bg-gray-50 rounded-xl border border-gray-100">
                                <div className="flex flex-col items-center gap-3 flex-shrink-0">
                                    <div className="h-24 w-24 rounded-full border-4 border-blue-200 ring-2 ring-blue-500/20 overflow-hidden shadow-md bg-gray-100">
                                        {previewSrc ? (
                                            <img src={previewSrc} alt="Selected avatar" className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
                                                <span className="text-3xl font-bold text-white">
                                                    {form.firstName?.[0]?.toUpperCase() || "?"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs font-semibold text-gray-500">
                                        {uploadedPreview ? "Custom photo" : (AVATARS[avatarIdx]?.label ?? "Selected")}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        Upload Photo
                                    </button>
                                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                                </div>

                                <div className="hidden md:block w-px h-24 bg-gray-200 flex-shrink-0" />

                                <div className="flex-1 w-full">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Or choose an avatar</p>
                                    <div className="grid grid-cols-3 gap-4">
                                        {AVATARS.map((av, i) => (
                                            <div key={i} className="flex flex-col items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => selectAvatar(i)}
                                                    className={`h-16 w-16 rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-sm ${
                                                        avatarIdx === i && !uploadedPreview
                                                            ? "border-2 border-blue-600 ring-2 ring-blue-600/20"
                                                            : "border-2 border-transparent hover:border-gray-300"
                                                    }`}
                                                >
                                                    <img src={av.src} alt={av.label} className="h-full w-full object-cover" />
                                                </button>
                                                <span className="text-[10px] font-medium text-gray-500">{av.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* ── Section 1: Basic Info */}
                        <section>
                            <SectionHeader
                                icon={<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" /></svg>}
                                title="Basic Info"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Field label="First Name" required error={errors.firstName}>
                                    <input id="staff-firstName" type="text" value={form.firstName}
                                        onChange={(e) => set("firstName", e.target.value)}
                                        placeholder="Aya" className={inp(errors.firstName)} />
                                </Field>
                                <Field label="Last Name" required error={errors.lastName}>
                                    <input id="staff-lastName" type="text" value={form.lastName}
                                        onChange={(e) => set("lastName", e.target.value)}
                                        placeholder="Ahmed" className={inp(errors.lastName)} />
                                </Field>

                                {/* Email preview (create mode) or disabled field (edit mode) */}
                                {!isEditing ? (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-semibold text-gray-800 mb-2">
                                            Clinic Email
                                            <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Auto-generated</span>
                                        </label>
                                        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                                            usernameStatus === "available" ? "bg-green-50 border-green-200" :
                                            usernameStatus === "taken"     ? "bg-orange-50 border-orange-200" :
                                            usernameStatus === "error"     ? "bg-red-50 border-red-200" :
                                            "bg-blue-50 border-blue-100"
                                        }`}>
                                            {/* Status icon */}
                                            {usernameStatus === "checking" && (
                                                <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                            )}
                                            {usernameStatus === "available" && (
                                                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                            {usernameStatus === "taken" && (
                                                <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            )}
                                            {(usernameStatus === "idle" || usernameStatus === "error") && (
                                                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            )}
                                            <span className={`text-sm font-bold tracking-tight ${
                                                usernameStatus === "available" ? "text-green-700" :
                                                usernameStatus === "taken"     ? "text-orange-700" :
                                                usernameStatus === "error"     ? "text-red-700" :
                                                "text-blue-700"
                                            }`}>{previewEmail}</span>
                                        </div>
                                        {/* Availability status hints */}
                                        {usernameStatus === "available" && (
                                            <p className="text-xs text-green-600 font-medium mt-1.5">✓ This email is available</p>
                                        )}
                                        {usernameStatus === "taken" && suggestedEmail && (
                                            <p className="text-xs text-orange-600 font-medium mt-1.5">
                                                ⚠ This name is taken — system will use <strong>{suggestedEmail}</strong> instead
                                            </p>
                                        )}
                                        {usernameStatus === "taken" && !suggestedEmail && (
                                            <p className="text-xs text-orange-600 font-medium mt-1.5">
                                                ⚠ This name is already used — a suffix will be added automatically
                                            </p>
                                        )}
                                        {usernameStatus === "idle" && (
                                            <p className="text-xs text-gray-400 mt-1.5">
                                                Staff log in with this clinic email — not a personal email.
                                            </p>
                                        )}
                                        {usernameStatus === "checking" && (
                                            <p className="text-xs text-gray-400 mt-1.5">Checking availability…</p>
                                        )}
                                    </div>
                                ) : (
                                    <Field label="Clinic Email">
                                        <input
                                            type="email"
                                            value={staff?.email || ""}
                                            disabled
                                            className={`${inp(false)} opacity-60 cursor-not-allowed`}
                                        />
                                    </Field>
                                )}

                                {!isEditing && (
                                    <Field label="Password" required error={errors.password}>
                                        <input id="staff-password" type="password" value={form.password}
                                            onChange={(e) => set("password", e.target.value)}
                                            placeholder="•••••••• (min 6 chars)"
                                            className={inp(errors.password)} />
                                    </Field>
                                )}
                                <Field label="Phone">
                                    <input id="staff-phone" type="tel" value={form.phone}
                                        onChange={(e) => set("phone", e.target.value)}
                                        placeholder="+20 100 000 0000" className={inp(false)} />
                                </Field>
                                <Field label="Job Title">
                                    <input id="staff-jobTitle" type="text" value={form.jobTitle}
                                        onChange={(e) => set("jobTitle", e.target.value)}
                                        placeholder="e.g. Senior Orthodontist" className={inp(false)} />
                                </Field>
                            </div>
                        </section>

                        {/* ── Section 2: Role & Branch Access */}
                        <section>
                            <SectionHeader
                                icon={<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" /></svg>}
                                title="Role & Access"
                                color="violet"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Field label="Assign Role" required error={errors.roleId}>
                                    {safeRoles.length === 0 ? (
                                        <div className="w-full px-4 py-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 text-amber-700 text-sm flex items-center gap-2">
                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            No roles found
                                        </div>
                                    ) : (
                                        <select
                                            id="staff-roleId"
                                            value={form.roleId}
                                            onChange={(e) => set("roleId", e.target.value)}
                                            className={inp(errors.roleId)}
                                        >
                                            <option value="">— Select a role —</option>
                                            {safeRoles.map((r) => (
                                                <option key={r._id} value={r._id}>
                                                    {formatRoleName(r.name)}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </Field>

                                {/* Full branch access toggle */}
                                <Field label="Branch Access">
                                    <label className="flex items-center gap-3 h-[50px] px-4 rounded-lg ring-1 ring-gray-200 bg-white cursor-pointer hover:ring-blue-300 transition-all">
                                        <input
                                            id="staff-fullBranchAccess"
                                            type="checkbox"
                                            checked={form.hasFullBranchAccess}
                                            onChange={(e) => set("hasFullBranchAccess", e.target.checked)}
                                            className="w-4 h-4 rounded accent-blue-600"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Full branch access</span>
                                    </label>
                                </Field>
                            </div>

                            {/* Branch multi-select (hidden when full access is on) */}
                            {!form.hasFullBranchAccess && (
                                <div className="mt-5">
                                    <Field
                                        label="Assign Branches"
                                        required
                                        error={errors.branchIds}
                                        hint="Staff can only access appointments and data from their assigned branches"
                                    >
                                        <div className="mt-2">
                                            <BranchMultiSelect
                                                branches={branches}
                                                selectedIds={form.branchIds}
                                                onChange={(ids) => set("branchIds", ids)}
                                                disabled={form.hasFullBranchAccess}
                                            />
                                        </div>
                                    </Field>
                                </div>
                            )}

                            {form.hasFullBranchAccess && (
                                <div className="mt-4 px-4 py-3 bg-violet-50 rounded-xl border border-violet-100 flex items-center gap-3">
                                    <svg className="w-4 h-4 text-violet-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                                    </svg>
                                    <p className="text-sm text-violet-700 font-medium">
                                        This staff member will have access to all current and future branches.
                                    </p>
                                </div>
                            )}

                            {selectedRole && (
                                <div className="mt-4 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                                    <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                                    </svg>
                                    <div>
                                        <p className="text-sm font-semibold text-blue-800">{formatRoleName(selectedRole.name)}</p>
                                        <p className="text-xs text-blue-600 mt-0.5">
                                            {selectedRole.isSystemRole ? "System Role — permissions managed by platform" : "Custom organization role"}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* ── Section 3: Practitioner Toggle + Specialty */}
                        <section className="p-6 bg-gray-50 rounded-xl border border-gray-100">
                            <SectionHeader
                                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>}
                                title="Practitioner"
                                badge="Clinical"
                                color="orange"
                            />

                            {/* Toggle */}
                            <label className="flex items-center gap-3 px-4 py-3.5 rounded-xl ring-1 ring-gray-200 bg-white cursor-pointer hover:ring-blue-300 transition-all mb-4">
                                <input
                                    id="staff-isPractitioner"
                                    type="checkbox"
                                    checked={form.isPractitioner}
                                    onChange={(e) => {
                                        set("isPractitioner", e.target.checked);
                                        // Auto-reset specialty when turning off
                                        if (!e.target.checked) set("specialty", "general");
                                    }}
                                    className="w-4.5 h-4.5 rounded accent-orange-500"
                                />
                                <span className="text-sm font-semibold text-gray-800">This staff member performs clinical procedures</span>
                                <span className="ml-auto text-xs font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">Doctor</span>
                            </label>

                            {/* Specialty — only visible when isPractitioner */}
                            {form.isPractitioner && (
                                <Field label="Specialty" required>
                                    <select
                                        id="staff-specialty"
                                        value={form.specialty}
                                        onChange={(e) => set("specialty", e.target.value)}
                                        className={inp(false)}
                                    >
                                        {SPECIALTY_OPTIONS.map((s) => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400 mt-1.5">
                                        Shown in the appointment scheduling dropdown.
                                    </p>
                                </Field>
                            )}

                            {!form.isPractitioner && (
                                <p className="text-xs text-gray-400">
                                    Enable this if the staff member treats patients (doctor, specialist, surgeon).
                                    They will appear in the appointment doctor selector.
                                </p>
                            )}
                        </section>

                        {/* ── Actions */}
                        <div className="pt-2 flex gap-4">
                            <button type="button" onClick={onClose} disabled={isSaving || isUploading}
                                className="flex-1 px-6 py-4 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50">
                                Cancel
                            </button>
                            <button
                                id={isEditing ? "edit-staff-submit" : "create-staff-submit"}
                                type="submit"
                                disabled={isSaving || isUploading}
                                className="flex-[2] bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-4 rounded-xl font-bold shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {(isSaving || isUploading) ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        {isUploading ? "Uploading photo..." : (isEditing ? "Saving..." : "Creating...")}
                                    </span>
                                ) : (
                                    isEditing ? "Save Changes" : "Create Staff Member"
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
