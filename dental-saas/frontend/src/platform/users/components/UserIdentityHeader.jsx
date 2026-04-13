/**
 * UserIdentityHeader.jsx
 * Shared hero card for Platform and Org User detail pages.
 *
 * Props:
 *  user        – user object (name, email, profilePhotoUrl, isActive, twoFactorEnabled)
 *  roleLabel   – human-readable role string, e.g. "Super Admin" or "Org Staff"
 *  onEdit      – callback to open the Edit Profile modal (optional)
 */
import React from 'react';
import { KeyRound, Pencil, ShieldCheck, UserCircle2 } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns up to 2 uppercase initials.
 * Prefers firstName[0] + lastName[0] when the split fields are available.
 * Falls back to word-splitting the legacy `name` field.
 */
function getInitials(user) {
    if (user?.firstName && user?.lastName) {
        return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    if (user?.firstName) return user.firstName[0].toUpperCase();
    const name = user?.name || '';
    return name
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || '?';
}

// Deterministic gradient based on name's first char code
const GRADIENTS = [
    'from-indigo-500 to-violet-600',
    'from-blue-500   to-cyan-600',
    'from-emerald-500 to-teal-600',
    'from-rose-500   to-pink-600',
    'from-amber-500  to-orange-600',
    'from-purple-500 to-indigo-600',
];

function avatarGradient(user) {
    const seed = user?.firstName || user?.name || '';
    return GRADIENTS[(seed.charCodeAt(0) || 0) % GRADIENTS.length];
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user }) {
    if (user?.profilePhotoUrl || user?.profileImage) {
        return (
            <img
                src={user.profilePhotoUrl || user.profileImage}
                alt={user.name}
                className="w-16 h-16 rounded-2xl object-cover ring-4 ring-white shadow-md flex-shrink-0"
            />
        );
    }
    const initials = getInitials(user);
    const gradient = avatarGradient(user);
    return (
        <div
            className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} ring-4 ring-white shadow-md flex items-center justify-center font-bold text-white text-xl flex-shrink-0 select-none`}
        >
            {initials}
        </div>
    );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ label }) {
    if (!label) return null;
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase tracking-widest">
            <ShieldCheck className="w-3 h-3" />
            {label}
        </span>
    );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ isActive }) {
    return isActive ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide bg-red-50 text-red-700 border-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Suspended
        </span>
    );
}

// ─── 2FA chip ─────────────────────────────────────────────────────────────────

function TwoFAChip({ enabled }) {
    return enabled ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200">
            <KeyRound className="w-3 h-3" /> 2FA On
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide bg-amber-50 text-amber-700 border-amber-200">
            <KeyRound className="w-3 h-3" /> 2FA Off
        </span>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function UserIdentityHeader({ user, roleLabel, onEdit }) {
    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Subtle decorative gradient bar */}
            <div className="h-20 bg-gradient-to-r from-indigo-50 via-slate-50 to-purple-50 border-b border-slate-100" />

            {/* Identity row — overlaps banner by -mt-10 */}
            <div className="px-6 pt-0 pb-5">
                <div className="flex items-end gap-0 -mt-10 flex-wrap">
                    {/* Avatar — pops above the gradient bar */}
                    <div className="flex-shrink-0 mr-4">
                        <Avatar user={user} />
                    </div>

                    {/* Name / Email / Role — vertically centered at bottom of banner */}
                    <div className="flex-1 min-w-0 mb-1 pt-10">
                        {/* Name */}
                        <h1 className="text-lg font-bold text-slate-900 leading-tight truncate">
                            {user?.name || <span className="text-slate-400 italic">Unknown User</span>}
                        </h1>

                        {/* Email */}
                        <p className="text-sm text-slate-500 mt-0.5 truncate">
                            {user?.email}
                        </p>

                        {/* Role badge */}
                        <div className="mt-2">
                            <RoleBadge label={roleLabel} />
                        </div>
                    </div>

                    {/* Right: status chips + edit button — aligned to bottom */}
                    <div className="flex flex-col items-end gap-2 mb-1 ml-auto pl-4">
                        {/* Status + 2FA chips */}
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            <StatusChip isActive={user?.isActive} />
                            <TwoFAChip enabled={user?.twoFactorEnabled} />
                        </div>

                        {/* Edit Profile button */}
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-colors"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
