/**
 * CompleteProfilePage.jsx — Profile Completion Screen (Phase 3.3)
 * Displayed as a blocking gate for org users whose profile.isComplete === false.
 *
 * Route: /complete-profile
 * Access: Any authenticated org user with incomplete profile.
 *
 * On success → navigates to /org/dashboard.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usersApi } from "@/modules/org/users/api/users.api";

const SPECIALITY_OPTIONS = [
    { value: "orthodontist", label: "Orthodontist" },
    { value: "general_dentist", label: "General Dentist" },
    { value: "pediatric_dentist", label: "Pediatric Dentist" },
    { value: "oral_surgeon", label: "Oral Surgeon" },
    { value: "endodontist", label: "Endodontist" },
    { value: "periodontist", label: "Periodontist" },
    { value: "prosthodontist", label: "Prosthodontist" },
    { value: "dental_assistant", label: "Dental Assistant" },
    { value: "dental_hygienist", label: "Dental Hygienist" },
    { value: "receptionist", label: "Receptionist" },
    { value: "lab_technician", label: "Lab Technician" },
    { value: "manager", label: "Clinic Manager" },
    { value: "other", label: "Other" },
];

export default function CompleteProfilePage() {
    const navigate = useNavigate();
    const { user, setUser } = useAuth();

    const [form, setForm] = useState({
        firstName: user?.firstName || "",
        lastName: user?.lastName || "",
        phone: user?.phone || "",
        speciality: user?.speciality || "orthodontist",
        jobTitle: user?.jobTitle || "",
    });
    const [fieldErrors, setFieldErrors] = useState({});

    const set = (field, value) => {
        setForm((p) => ({ ...p, [field]: value }));
        setFieldErrors((p) => ({ ...p, [field]: undefined }));
    };

    // ─── Mutation ─────────────────────────────────────────────────────────────
    const { mutate, isPending, error } = useMutation({
        mutationFn: (data) => usersApi.completeProfile(data),
        onSuccess: (res) => {
            // Update AuthContext with the completed profile
            const updatedUser = res.data?.data;
            if (updatedUser && setUser) {
                setUser((prev) => ({ ...prev, ...updatedUser, profile: { isComplete: true } }));
            }
            navigate("/org/dashboard", { replace: true });
        },
    });

    const validate = () => {
        const errs = {};
        if (!form.firstName.trim()) errs.firstName = "First name is required";
        if (!form.lastName.trim()) errs.lastName = "Last name is required";
        return errs;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setFieldErrors(errs);
            return;
        }
        mutate(form);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-600/30 mb-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Complete Your Profile</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Welcome! Please set up your profile before continuing.
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 p-8">
                    {error && (
                        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                            {error?.response?.data?.message || error?.message || "Something went wrong. Please try again."}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5" id="complete-profile-form">
                        {/* Name row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    First Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="complete-firstName"
                                    type="text"
                                    value={form.firstName}
                                    onChange={(e) => set("firstName", e.target.value)}
                                    placeholder="Mohamed"
                                    className={`w-full h-12 rounded-xl border px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                                        fieldErrors.firstName ? "border-red-400 bg-red-50" : "border-gray-200"
                                    }`}
                                />
                                {fieldErrors.firstName && (
                                    <p className="text-xs text-red-500 mt-1">{fieldErrors.firstName}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Last Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="complete-lastName"
                                    type="text"
                                    value={form.lastName}
                                    onChange={(e) => set("lastName", e.target.value)}
                                    placeholder="Ahmed"
                                    className={`w-full h-12 rounded-xl border px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                                        fieldErrors.lastName ? "border-red-400 bg-red-50" : "border-gray-200"
                                    }`}
                                />
                                {fieldErrors.lastName && (
                                    <p className="text-xs text-red-500 mt-1">{fieldErrors.lastName}</p>
                                )}
                            </div>
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Phone Number
                            </label>
                            <input
                                id="complete-phone"
                                type="tel"
                                value={form.phone}
                                onChange={(e) => set("phone", e.target.value)}
                                placeholder="+20 100 000 0000"
                                className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            />
                        </div>

                        {/* Speciality */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Speciality
                            </label>
                            <select
                                id="complete-speciality"
                                value={form.speciality}
                                onChange={(e) => set("speciality", e.target.value)}
                                className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                            >
                                {SPECIALITY_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Job Title */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Job Title
                            </label>
                            <input
                                id="complete-jobTitle"
                                type="text"
                                value={form.jobTitle}
                                onChange={(e) => set("jobTitle", e.target.value)}
                                placeholder="e.g. Senior Orthodontist"
                                className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                            />
                        </div>

                        {/* Submit */}
                        <button
                            id="complete-profile-submit"
                            type="submit"
                            disabled={isPending}
                            className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                        >
                            {isPending ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </span>
                            ) : (
                                "Complete Profile"
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-gray-400 mt-4">
                    This information is only visible to your organization.
                </p>
            </div>
        </div>
    );
}
