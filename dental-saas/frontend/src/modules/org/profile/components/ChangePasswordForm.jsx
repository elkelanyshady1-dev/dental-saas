/**
 * ChangePasswordForm.jsx — Password Change Component
 */
import { useState } from "react";
import { Input } from "@/design-system";
import { authApi } from "../api/auth.api";
import { setCsrfToken, setAccessToken } from "@/services/api";

export default function ChangePasswordForm() {
    const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        if (form.newPassword !== form.confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (form.newPassword.length < 8) {
            setError("New password must be at least 8 characters");
            return;
        }

        setSaving(true);
        try {
            const res = await authApi.changePassword({
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
            });

            // ── CSRF Sync (GAP-1 Frontend) ──────────────────────────────────────
            // Backend rotates both the httpOnly refresh cookie AND the CSRF pair
            // on password change. The new csrfToken is returned in the response
            // body so we can update the module-level variable immediately.
            // Without this, the next mutation after a password change fails 403.
            if (res.data?.csrfToken) {
                setCsrfToken(res.data.csrfToken);
            }
            // Sync new access token as well (tokenVersion was bumped)
            if (res.data?.token) {
                setAccessToken(res.data.token);
            }

            setSuccess(true);
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        } catch (err) {
            setError(err.response?.data?.message || "Failed to change password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div>
                <h3 className="text-base font-bold text-gray-800">Change Password</h3>
                <p className="text-sm text-gray-500 mt-0.5">Update your password to keep your account secure</p>
            </div>

            {success && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-medium">
                    ✓ Password changed successfully
                </div>
            )}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Current Password" type="password"
                    value={form.currentPassword}
                    onChange={(e) => set("currentPassword", e.target.value)}
                    required
                />
                <Input
                    label="New Password" type="password"
                    value={form.newPassword}
                    onChange={(e) => set("newPassword", e.target.value)}
                    required
                />
                <Input
                    label="Confirm New Password" type="password"
                    value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)}
                    required
                />

                <div className="flex justify-end pt-2">
                    <button type="submit" disabled={saving}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition disabled:opacity-50">
                        {saving ? "Changing..." : "Change Password"}
                    </button>
                </div>
            </form>
        </div>
    );
}
