/**
 * EditProfileModal.jsx — v1.0
 * Shared modal for editing platform & org user identity/contact fields.
 *
 * Props:
 *   open          — boolean
 *   user          — user object (populated with identity fields)
 *   onClose       — () => void
 *   onSaved       — (updatedUser) => void
 *   saveEndpoint  — full API path e.g. "/users/:id/profile" or "/governance/org/:orgId/:userId/profile"
 *
 * Fields editable:
 *   - profileImage (URL or base64 preview)
 *   - phone
 *   - whatsapp
 *   - jobTitle
 *   - department
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    X, User, Phone, MessageCircle, Briefcase, Building2,
    Camera, Loader2, CheckCircle2, AlertTriangle, Upload,
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name = "") {
    return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

const GRADIENT_COLORS = [
    "from-indigo-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-rose-500 to-pink-600",
];

function avatarGradient(name = "") {
    return GRADIENT_COLORS[(name.charCodeAt(0) || 0) % GRADIENT_COLORS.length];
}

// ─── Avatar preview ───────────────────────────────────────────────────────────
function AvatarPreview({ src, name, onImageSelect }) {
    const fileRef = useRef(null);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast.error("Only JPG, PNG, and WebP images are supported.");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error("Image must be under 2 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => onImageSelect(ev.target.result);
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative group">
                {src ? (
                    <img
                        src={src}
                        alt={name}
                        className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md"
                    />
                ) : (
                    <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${avatarGradient(name)} ring-4 ring-white shadow-md flex items-center justify-center font-bold text-white text-2xl select-none`}>
                        {getInitials(name)}
                    </div>
                )}
                {/* Upload overlay */}
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Change photo"
                >
                    <Camera className="w-5 h-5 text-white" />
                </button>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFile}
            />
            <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
                <Upload className="w-3 h-3" />
                Upload photo
            </button>
            <p className="text-[11px] text-slate-400 -mt-1">JPG, PNG or WebP · Max 2 MB</p>
        </div>
    );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ id, label, icon: Icon, value, onChange, placeholder, type = "text" }) {
    return (
        <div>
            <label htmlFor={id} className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                {label}
            </label>
            <div className="relative">
                {Icon && (
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                )}
                <input
                    id={id}
                    type={type}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full ${Icon ? "pl-9" : "pl-3"} pr-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors`}
                />
            </div>
        </div>
    );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function EditProfileModal({ open, user, onClose, onSaved, saveEndpoint }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [profileImage, setProfileImage] = useState("");
    const [phone, setPhone] = useState("");
    const [whatsapp, setWhatsapp] = useState("");
    const [jobTitle, setJobTitle] = useState("");
    const [department, setDepartment] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Seed form from user prop
    useEffect(() => {
        if (open && user) {
            setFirstName(user.firstName || "");
            setLastName(user.lastName || "");
            setProfileImage(user.profileImage || user.profilePhotoUrl || "");
            setPhone(user.phone || "");
            setWhatsapp(user.whatsapp || "");
            setJobTitle(user.jobTitle || "");
            setDepartment(user.department || "");
            setError(null);
            setSuccess(false);
            setLoading(false);
        }
    }, [open, user]);

    // ESC to close
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (e.key === "Escape" && !loading) onClose(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [open, loading, onClose]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!saveEndpoint) return;
        setLoading(true);
        setError(null);
        try {
            const payload = { firstName, lastName, profileImage, phone, whatsapp, jobTitle, department };
            const res = await platformApi.patch(saveEndpoint, payload);
            setSuccess(true);
            onSaved?.(res.data.user);
            setTimeout(onClose, 1200);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to save profile.");
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
            {/* Backdrop */}
            <div className="absolute inset-0" onClick={!loading ? onClose : undefined} aria-hidden="true" />

            <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h2 id="edit-profile-title" className="text-sm font-bold text-slate-800">Edit Profile</h2>
                            <p className="text-xs text-slate-400 mt-0.5">{user?.name}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40"
                        aria-label="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="px-6 py-5 space-y-5">

                    {/* Avatar */}
                    <AvatarPreview
                        src={profileImage}
                        name={[firstName, lastName].filter(Boolean).join(" ") || user?.name || ""}
                        onImageSelect={setProfileImage}
                    />

                    <div className="border-t border-slate-100" />

                    {/* Identity: first + last name */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            id="edit-firstname"
                            label="First Name"
                            icon={User}
                            value={firstName}
                            onChange={setFirstName}
                            placeholder="Jane"
                        />
                        <Field
                            id="edit-lastname"
                            label="Last Name"
                            value={lastName}
                            onChange={setLastName}
                            placeholder="Smith"
                        />
                    </div>

                    <div className="border-t border-slate-100" />

                    {/* Contact fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            id="edit-phone"
                            label="Phone"
                            icon={Phone}
                            value={phone}
                            onChange={setPhone}
                            placeholder="+20 100 000 0000"
                            type="tel"
                        />
                        <Field
                            id="edit-whatsapp"
                            label="WhatsApp"
                            icon={MessageCircle}
                            value={whatsapp}
                            onChange={setWhatsapp}
                            placeholder="+20 100 000 0000"
                            type="tel"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field
                            id="edit-jobtitle"
                            label="Job Title"
                            icon={Briefcase}
                            value={jobTitle}
                            onChange={setJobTitle}
                            placeholder="e.g. Lead Dentist"
                        />
                        <Field
                            id="edit-department"
                            label="Department"
                            icon={Building2}
                            value={department}
                            onChange={setDepartment}
                            placeholder="e.g. Operations"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || success}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50
                                ${success ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white"}`}
                        >
                            {success
                                ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                                : loading
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                    : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
