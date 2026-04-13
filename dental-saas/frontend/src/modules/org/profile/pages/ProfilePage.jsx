/**
 * ProfilePage.jsx — Unified Profile System (v5.0)
 *
 * Role-aware architecture:
 *   org_admin / admin → redirected to Staff Management (/org/settings/users?profile=me)
 *                       so they use the full StaffFormModal via the Staff page
 *   all other roles   → this page — self-service edit, no admin controls
 *
 * Data: fetched via useCurrentUser() (React Query → GET /org/users/me)
 * Update: via useUpdateProfile() (PATCH /org/users/me — safe fields only)
 * Password: via ChangePasswordForm (PATCH /auth/change-password)
 *
 * Rules enforced:
 *   ❌ No role change from this page
 *   ❌ No system email (email) editable — only realEmail
 *   ❌ No useState(apiData)
 *   ✅ React Query for all server state
 *   ✅ Inline validation errors
 *   ✅ Toast feedback
 */
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUpdateProfile } from "../hooks/useUpdateProfile";
import { userService } from "../api/user.service";
import ChangePasswordForm from "../components/ChangePasswordForm";
import ActiveSessionsPanel from "../components/ActiveSessionsPanel";

// ─── Predefined staff avatars (matches StaffFormModal) ───────────────────────
const AVATARS = [
    { label: "Male Doctor",      src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBzj3fHh57WbgvMsXM5uD5i9OxD8FcH65IYg4lmrABqQNgckfHcpCL_pCBzwYOFbVeKj4tNf8UWDlXMqV8dzcJLj_30Ry-pra2tjEFrd-Am_OewPSALL9BYFRHMigf9L93AKRNN3qhd8YoPfZl5FFbH-KHKoTwzqUXyzA4BW-3dumLZGa2uYRLW17t-QC87UmGNcPHDhSqQFxWqZ0CdaX5BM6XKnnImnROHpdlaKAZ_wtWMVny3KIOYqFyeF75REWs4WEVCXHfrsJU" },
    { label: "Female Doctor",    src: "https://lh3.googleusercontent.com/aida-public/AB6AXuCEhADJK7Y3Rms4lwBKChxXnEAhEa7IbKa_ZuO5nc77tYsvHSoZRifw4P1jG7n28ZY6F3ThYvdYXW-DojzU1Va5SdOp0vgdT2WUagMt6D6mP-DSkP2mQaTbVeVCkOGbdZZHOEQqNhj7u9Y6oZwF5WGYsV4gzMQ0R4IjJoGCcaJStbDXlhk8sUQbclAnOUjuHJd_Jjqxug4yBmEZolpmtP6WxrU4a7ELZdr1ewTZRTEWm7h-ll7kcQsUVMdD-3WHCfIQtFw9_fvR3xk" },
    { label: "Male Assistant",   src: "https://lh3.googleusercontent.com/aida-public/AB6AXuDMe28hChj-ISmB03ttyardi_6FsQjvQKBwO2NOJUGQ0W_WGqSLqO0WbVRmB6FULTWV7SHXjzIH5aq0Jfr-ud_qef_b-K83zALIoQiBzmuCxuWmxUS1-UrT7s6XlZi8tITdj2unDXrp8p4MO-SHVSjuDM9a3coQ0ijyOk32vBqIIVZN00XRWZfBNjR0E6IQMlTmPQmBMqfs5j9wXsJCoffNNWoRTxzi5SKszLfXF6HIafFrvbdq0Xc7CgA7Yl3IkgSEEK3YuwEwONI" },
    { label: "Female Assistant", src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBtJCtRgvTUA8l1nohMfRvNBkNf6-IFcV5JXU4fagXPmq5rFLJe9xzvm7JrzAisgLRQ1Q04ELcdA1IFXdL0xkUwJibiFaGN3ajfPxDajfOUq0geZOZz2MIe4sis16pU-DpIXTwwWsOu6HKPcyB5j8C12hkDBJLmg0cj7wBg7JNbAjn4a2IXcQxFgPi8w9hksU7cyTEO8ZahLE5IF-lu1FhJYOKlxHJD5KSA0Fe3EsbTU5s1o96qt2GAdVEVAoUVSK7IvhpDZ8aU0Nc" },
    { label: "Male Staff",       src: "https://lh3.googleusercontent.com/aida-public/AB6AXuBhNp9Ce9RIeMLzucPO56yjHzvY6m_9YaryvDvTUat6QbeUqIiRY_zN7dDl_jR7GzOHv9ltoYAMpzNMfoo6cLCk3zn910R0lHVI-p62z6dbp-_QWXA0oL9-Vxq9EGS0n5kAPMyrE-styhhcw_u7OnaVOpBJebO68ziJXsL4X7Rq3YywR7-FxaU5fSnoTMpsGcv7uKiaSyJxIO_WOV-d6WDcQJVZt8D3Y4fjOE2YKRtWZgQKCC8qZ_CNHYNjPA65iVZkzJCgfBmxUD8" },
    { label: "Female Staff",     src: "https://lh3.googleusercontent.com/aida-public/AB6AXuC4lgGEvYq-M9QIvLtt9mKNSkkGSRE_17iBa_8KHNmv7dtczhnNFw7pjWoGC7HciXYxHXSAfi6MQsWKdKg4tbIulMzhr0EBAfKpyFDCWDZ1AJV5Toui85ftc660TTDuc5_XgiMUjaUnLmwAsgL8pq-C8w6-eOS_7yi0uchaUHnrA4XQRe5s72OIW-aC_2vAOlINhH5OQcYczqRYT7eNzLzAh-lY3AjSKNnENDOrDJngBCbhqdv5VUU0hWQaUTo-Fv6yknoCDKKvG70" },
];

const TABS = [
    { key: "profile",  label: "Profile" },
    { key: "security", label: "Security" },
    { key: "sessions", label: "Sessions" },
];

// ─── Toast notification ───────────────────────────────────────────────────────
function Toast({ message, type = "success", onDismiss }) {
    return (
        <div
            className={`fixed top-6 right-6 z-[500] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border
                transition-all animate-[slideIn_0.2s_ease]
                ${type === "success"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
        >
            <span className="text-sm font-semibold">{message}</span>
            <button onClick={onDismiss} className="ml-2 text-inherit opacity-60 hover:opacity-100 transition">✕</button>
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function ProfileSkeleton() {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6 animate-pulse">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-slate-200" />
                    <div className="flex-1 space-y-2">
                        <div className="h-5 bg-slate-200 rounded w-40" />
                        <div className="h-3 bg-slate-100 rounded w-56" />
                        <div className="h-5 bg-slate-100 rounded-full w-20" />
                    </div>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-2">
                {[1,2,3].map(i => <div key={i} className="flex-1 h-10 bg-slate-100 rounded-xl" />)}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex items-center justify-between px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded w-24" />
                        <div className="h-4 bg-slate-100 rounded w-36" />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Avatar picker section ────────────────────────────────────────────────────
function AvatarSection({ currentSrc, onAvatarChange, userId }) {
    const { refreshUser } = useAuth();
    const [preview, setPreview]       = useState(currentSrc);
    const [uploading, setUploading]   = useState(false);
    const [avatarIdx, setAvatarIdx]   = useState(
        AVATARS.findIndex((a) => a.src === currentSrc)
    );
    const fileRef = useRef(null);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPreview(URL.createObjectURL(file));
        setAvatarIdx(-1);
        setUploading(true);
        try {
            const res = await userService.uploadAvatar(userId, file);
            const url = res.data?.data?.profileImage || res.data?.profileImage;
            if (url) {
                setPreview(url);
                onAvatarChange(url);
                // Sync header avatar immediately — no page reload needed
                await refreshUser?.();
            }
        } catch {
            // revert on failure
            setPreview(currentSrc);
        } finally {
            setUploading(false);
        }
    };

    const selectAvatar = (idx) => {
        setAvatarIdx(idx);
        setPreview(AVATARS[idx].src);
        onAvatarChange(AVATARS[idx].src);
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-5">Profile Picture</h3>
            <div className="flex flex-col md:flex-row items-center gap-8">
                {/* Current preview */}
                <div className="flex flex-col items-center gap-3 flex-shrink-0">
                    <div className="relative w-24 h-24 rounded-full overflow-hidden ring-4 ring-indigo-100 shadow-md">
                        {preview ? (
                            <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-3xl font-bold">
                                ?
                            </div>
                        )}
                        {uploading && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload Photo
                    </button>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
                </div>

                <div className="hidden md:block w-px h-24 bg-gray-100" />

                {/* Avatar grid */}
                <div className="flex-1 w-full">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Or choose an avatar</p>
                    <div className="grid grid-cols-3 gap-3">
                        {AVATARS.map((av, i) => (
                            <div key={i} className="flex flex-col items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => selectAvatar(i)}
                                    className={`w-14 h-14 rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95
                                        ${avatarIdx === i
                                            ? "ring-2 ring-indigo-600 ring-offset-2"
                                            : "ring-2 ring-transparent hover:ring-gray-200"
                                        }`}
                                >
                                    <img src={av.src} alt={av.label} className="w-full h-full object-cover" />
                                </button>
                                <span className="text-[9px] font-medium text-slate-400 text-center">{av.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Edit Profile Form (non-admin) ────────────────────────────────────────────
function EditProfileForm({ profile, onSaved, refreshUser }) {
    const [form, setForm] = useState({
        firstName:  profile.firstName || "",
        lastName:   profile.lastName  || "",
        phone:      profile.phone     || "",
        realEmail:  profile.realEmail || "",
        jobTitle:   profile.jobTitle  || profile.profile?.jobTitle || "",
        profileImage: profile.profileImage || "",
    });
    const [errors, setErrors] = useState({});
    const [toast, setToast]   = useState(null);

    const updateProfile = useUpdateProfile({
        onSuccess: async () => {
            await refreshUser?.();
            setToast({ type: "success", message: "Profile updated successfully" });
            onSaved?.();
        },
        onError: (err) => {
            setToast({ type: "error", message: err?.response?.data?.message || "Update failed" });
        },
    });

    const set = (k, v) => {
        setForm((p) => ({ ...p, [k]: v }));
        setErrors((p) => ({ ...p, [k]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (!form.firstName.trim()) e.firstName = "First name is required";
        if (form.realEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.realEmail))
            e.realEmail = "Enter a valid email address";
        return e;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length) { setErrors(errs); return; }
        updateProfile.mutate(form);
    };

    const inp = (err) =>
        `w-full px-4 py-3 rounded-xl bg-white border ${err ? "border-red-300 bg-red-50" : "border-gray-200"}
        focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all text-sm text-slate-800`;

    return (
        <>
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onDismiss={() => setToast(null)}
                />
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Avatar */}
                <AvatarSection
                    currentSrc={form.profileImage}
                    userId={profile._id}
                    onAvatarChange={(url) => set("profileImage", url)}
                />

                {/* Basic Info */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Basic Info</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                First Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                value={form.firstName}
                                onChange={(e) => set("firstName", e.target.value)}
                                className={inp(errors.firstName)}
                                placeholder="First name"
                            />
                            {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Last Name</label>
                            <input
                                value={form.lastName}
                                onChange={(e) => set("lastName", e.target.value)}
                                className={inp(false)}
                                placeholder="Last name"
                            />
                        </div>
                    </div>

                    {/* System email — READ ONLY */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                            Clinic Email
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                Read Only
                            </span>
                        </label>
                        <input
                            value={profile.email || ""}
                            disabled
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-400 cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-400 mt-1">System-generated clinic email. Cannot be changed.</p>
                    </div>

                    {/* Personal email */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Personal Email</label>
                        <input
                            type="email"
                            value={form.realEmail}
                            onChange={(e) => set("realEmail", e.target.value)}
                            className={inp(errors.realEmail)}
                            placeholder="your@personal-email.com (optional)"
                        />
                        {errors.realEmail && <p className="text-xs text-red-500 mt-1">{errors.realEmail}</p>}
                        <p className="text-xs text-slate-400 mt-1">Used for password recovery and important notifications.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Phone</label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={(e) => set("phone", e.target.value)}
                                className={inp(false)}
                                placeholder="+20 100 000 0000"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Job Title</label>
                            <input
                                value={form.jobTitle}
                                onChange={(e) => set("jobTitle", e.target.value)}
                                className={inp(false)}
                                placeholder="e.g. Orthodontist"
                            />
                        </div>
                    </div>
                </div>

                {/* Read-only fields */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-slate-50">
                    <InfoRow label="Role">
                        <span className="text-sm font-semibold text-slate-800 capitalize">
                            {(profile.roleId?.name || profile.role || "—").replace(/_/g, " ")}
                        </span>
                    </InfoRow>
                    <InfoRow label="Branch">
                        <span className="text-sm font-semibold text-slate-800">
                            {profile.hasFullBranchAccess
                                ? "All branches"
                                : profile.branchAccess?.map(b => b.name || b).join(", ") || "—"}
                        </span>
                    </InfoRow>
                    <InfoRow label="Account Status">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                            profile.isActive !== false
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-600"
                        }`}>
                            {profile.isActive !== false ? "Active" : "Inactive"}
                        </span>
                    </InfoRow>
                </div>

                {/* Submit */}
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={updateProfile.isPending}
                        className="px-6 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {updateProfile.isPending && (
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {updateProfile.isPending ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </form>
        </>
    );
}

function InfoRow({ label, children }) {
    return (
        <div className="flex items-center justify-between px-6 py-4">
            <span className="text-sm font-medium text-slate-500">{label}</span>
            {children}
        </div>
    );
}

// ─── View-only profile tab (for admin users before redirect or fallback) ──────
function ProfileViewTab({ profile }) {
    const displayName = profile.firstName
        ? `${profile.firstName} ${profile.lastName || ""}`.trim()
        : profile.name || "—";
    const roleName = (profile.roleId?.name || profile.role || "—").replace(/_/g, " ");

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-slate-50">
            {[
                ["Full Name",       displayName],
                ["Clinic Email",    profile.email],
                ["Personal Email",  profile.realEmail || "—"],
                ["Phone",           profile.phone || "—"],
                ["Job Title",       profile.jobTitle || profile.profile?.jobTitle || "—"],
                ["Role",            roleName],
                ["Branch",          profile.hasFullBranchAccess ? "All branches" : (profile.branchAccess?.map(b => b.name || b).join(", ") || "—")],
                ["Account Status",  profile.isActive !== false ? "Active" : "Inactive"],
            ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-6 py-4">
                    <span className="text-sm font-medium text-slate-500">{label}</span>
                    <span className="text-sm font-semibold text-slate-800 text-right max-w-[60%] truncate">{value}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Main ProfilePage ─────────────────────────────────────────────────────────
export default function ProfilePage() {
    const navigate        = useNavigate();
    const { user: authUser, refreshUser } = useAuth();
    const [activeTab, setActiveTab]       = useState("profile");
    const [isEditing, setIsEditing]       = useState(false);

    // React Query — single source of truth
    const { data: profile, isLoading, isError } = useCurrentUser();

    // Resolve display data (profile if loaded, authUser as fallback while loading)
    const data        = profile || authUser;
    const roleName    = data?.roleId?.name || data?.role || "";
    const isAdmin     = ["org_admin", "admin", "superadmin"].includes(roleName);
    const displayName = data?.firstName
        ? `${data.firstName} ${data.lastName || ""}`.trim()
        : data?.name || "User";
    const avatarSrc   = data?.profileImage || data?.avatarUrl || null;
    const initial     = (displayName[0] || "?").toUpperCase();

    if (isLoading) return <ProfileSkeleton />;

    if (isError) {
        return (
            <div className="max-w-3xl mx-auto py-16 px-4 text-center">
                <p className="text-red-500 font-semibold mb-4">Failed to load profile. Please try again.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">

            {/* ── Profile Header Card ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center gap-5">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md ring-2 ring-indigo-100">
                            {avatarSrc ? (
                                <img
                                    src={avatarSrc}
                                    alt={displayName}
                                    className="w-full h-full object-cover"
                                    onError={e => { e.target.style.display = "none"; }}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-2xl font-bold">
                                    {initial}
                                </div>
                            )}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                            data?.isActive !== false ? "bg-emerald-500" : "bg-gray-300"
                        }`} />
                    </div>

                    {/* Identity */}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-bold text-gray-900 truncate">{displayName}</h1>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{data?.email}</p>
                        <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-lg text-xs font-bold capitalize bg-indigo-50 text-indigo-700">
                            {roleName.replace(/_/g, " ") || "Staff"}
                        </span>
                    </div>

                    {/* Edit Profile — same for all roles */}
                    <button
                        id="edit-profile-btn"
                        onClick={() => setIsEditing(!isEditing)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex-shrink-0 ${
                            isEditing
                                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {isEditing ? "View Profile" : "Edit Profile"}
                    </button>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setIsEditing(false); }}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                            activeTab === tab.key
                                ? "bg-white text-gray-800 shadow-sm"
                                : "text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Tab Content ── */}
            {activeTab === "profile" && (
                isEditing && !isAdmin
                    ? <EditProfileForm
                        profile={data}
                        refreshUser={refreshUser}
                        onSaved={() => setIsEditing(false)}
                    />
                    : <ProfileViewTab profile={data} />
            )}
            {activeTab === "security" && <ChangePasswordForm />}
            {activeTab === "sessions" && <ActiveSessionsPanel />}
        </div>
    );
}
