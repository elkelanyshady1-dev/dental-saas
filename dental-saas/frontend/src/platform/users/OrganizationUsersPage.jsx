import React, { useEffect, useState } from 'react';
import {
    Users,
    Building2,
    Search,
    UserX,
    UserCheck,
    ShieldAlert,
    Key,
    LogOut,
    Eye,
    ChevronRight,
    SearchX
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import platformApi from '../auth/platformApi';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import RequireCapability from '../core/guards/RequireCapability';
import { usePlatformCapabilities } from '../hooks/usePlatformCapabilities';
import { toast } from 'sonner';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const OrganizationUsersPageContent = () => {
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const { hasCapability } = usePlatformCapabilities();

    const [selectedOrg, setSelectedOrg] = useState(null);
    const [orgUsers, setOrgUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [modal, setModal] = useState({ open: false, type: null, target: null });
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch organizations list
    const fetchOrgs = async () => {
        setLoading(true);
        try {
            const res = await platformApi.get('/organizations');
            // v23.1 Safety: normalize response — API may return bare array or { data: [...] }
            setOrganizations(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) {
            setError('Failed to fetch organizations list');
        } finally {
            setLoading(false);
        }
    };

    const fetchOrgUsers = async (orgId) => {
        setUsersLoading(true);
        try {
            const res = await platformApi.get(`/governance/org/${orgId}`);
            setOrgUsers(res.data);
        } catch (err) {
            toast.error('Failed to fetch users for this organization');
        } finally {
            setUsersLoading(false);
        }
    };

    useEffect(() => {
        fetchOrgs();
    }, []);

    useEffect(() => {
        if (selectedOrg) {
            fetchOrgUsers(selectedOrg._id);
        }
    }, [selectedOrg]);

    const handleAction = async () => {
        if (!modal.target || !selectedOrg) return;
        setActionLoading(true);
        try {
            let endpoint = `/governance/org/${selectedOrg._id}/${modal.target._id}`;
            let method = 'patch';
            let data = {};

            switch (modal.type) {
                case 'FORCE_LOGOUT':
                    endpoint += '/force-logout';
                    break;
                case 'RESET_PASSWORD':
                    endpoint += '/reset-password';
                    break;
                case 'TOGGLE_STATUS':
                    endpoint += '/status';
                    data = { isActive: !modal.target.isActive };
                    break;
                default:
                    return;
            }

            await platformApi[method](endpoint, data);
            await fetchOrgUsers(selectedOrg._id);
            setModal({ open: false, type: null, target: null });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Governance action failed');
        } finally {
            setActionLoading(false);
        }
    };

    const filteredUsers = orgUsers.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 text-center text-slate-400">Loading organizations...</div>;

    return (
        <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
                        <Building2 className="w-8 h-8 text-indigo-400" />
                        Organization Governance
                    </h1>
                    <p className="text-slate-400 mt-1">Cross-tenant user oversight and security enforcement.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col h-[calc(100vh-250px)]">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Select Organization</h3>
                        <div className="overflow-y-auto flex-1 space-y-2 pr-2 custom-scrollbar">
                            {organizations.map(org => (
                                <button
                                    key={org._id}
                                    onClick={() => setSelectedOrg(org)}
                                    className={cn(
                                        "w-full text-left px-4 py-3 rounded-xl transition-all border",
                                        selectedOrg?._id === org._id
                                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-100"
                                            : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                    )}
                                >
                                    <div className="font-medium truncate">{org.name}</div>
                                    <div className="text-xs opacity-60 truncate">{org.slug}.dentalsaas.com</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-3">
                    {!selectedOrg ? (
                        <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl h-[calc(100vh-250px)] flex flex-col items-center justify-center text-slate-500">
                            <Users className="w-16 h-16 mb-4 opacity-20" />
                            <p>Select an organization to manage its users</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search by name or email..."
                                        className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="text-sm text-slate-400">
                                    {filteredUsers.length} Users Found
                                </div>
                            </div>

                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden min-h-[calc(100vh-325px)]">
                                {usersLoading ? (
                                    <div className="p-20 text-center">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto"></div>
                                    </div>
                                ) : filteredUsers.length === 0 ? (
                                    <div className="p-20 text-center text-slate-500 flex flex-col items-center">
                                        <SearchX className="w-12 h-12 mb-3 opacity-20" />
                                        <p>No users match your filters for this organization</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-4 font-semibold">User</th>
                                                    <th className="px-6 py-4 font-semibold">Role / Scope</th>
                                                    <th className="px-6 py-4 font-semibold">Status</th>
                                                    <th className="px-6 py-4 font-semibold">Last Login</th>
                                                    <th className="px-6 py-4 font-semibold text-right text-xs">Platform Override</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {filteredUsers.map(user => (
                                                    <tr key={user._id} className="hover:bg-slate-800/30 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="font-medium text-slate-200">{user.name}</div>
                                                            <div className="text-sm text-slate-500">{user.email}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-slate-300 text-sm font-medium">{user.roleId?.name || 'No Role'}</div>
                                                            <div className="text-xs text-slate-500">
                                                                {user.hasFullBranchAccess ? 'Full Access' : `${user.branchAccess?.length || 0} Branches`}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter border",
                                                                user.isActive
                                                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                                    : "bg-red-500/10 text-red-400 border-red-500/20"
                                                            )}>
                                                                {user.isActive ? 'Active' : 'Suspended'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-xs text-slate-500">
                                                            {user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : 'Never'}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex justify-end gap-1.5">
                                                                {hasCapability("MANAGE_ORGANIZATIONS") && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => setModal({ open: true, type: 'FORCE_LOGOUT', target: user })}
                                                                            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
                                                                            title="Revoke Sessions"
                                                                        >
                                                                            <LogOut className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setModal({ open: true, type: 'RESET_PASSWORD', target: user })}
                                                                            className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                                                                            title="Trigger PWD Reset"
                                                                        >
                                                                            <Key className="w-4 h-4" />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setModal({ open: true, type: 'TOGGLE_STATUS', target: user })}
                                                                            className={cn(
                                                                                "p-2 rounded-lg transition-all",
                                                                                user.isActive ? "text-slate-400 hover:text-red-400 hover:bg-red-400/10" : "text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10"
                                                                            )}
                                                                            title={user.isActive ? "Suspend User" : "Reactivate User"}
                                                                        >
                                                                            {user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                                                        </button>
                                                                    </>
                                                                )}
                                                                <button
                                                                    onClick={() => navigate(`/platform/users/org/${selectedOrg._id}/${user._id}`)}
                                                                    className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-all"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation Modal */}
            {modal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6">
                        <div className="flex items-center gap-3 text-amber-400 mb-4">
                            <ShieldAlert className="w-6 h-6" />
                            <h3 className="text-xl font-bold text-slate-100">Sovereign Override</h3>
                        </div>

                        <p className="text-slate-400 leading-relaxed">
                            You are about to perform an external administrative action on user <strong>{modal.target?.name}</strong> from <strong>{selectedOrg?.name}</strong>.
                            {modal.type === 'FORCE_LOGOUT' && " This will invalidate their current session."}
                            {modal.type === 'TOGGLE_STATUS' && (modal.target?.isActive ? " This will block organization access." : " This will restore access.")}
                        </p>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setModal({ open: false, type: null, target: null })}
                                className="flex-1 px-4 py-2 border border-slate-800 text-slate-100 hover:bg-slate-800 rounded-xl transition-colors font-medium"
                                disabled={actionLoading}
                            >
                                Abort
                            </button>
                            <button
                                onClick={handleAction}
                                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
                                disabled={actionLoading}
                            >
                                {actionLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : 'Confirm Override'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function OrganizationUsersPage() {
    return (
        <RequireCapability permission="VIEW_ORGANIZATIONS">
            <OrganizationUsersPageContent />
        </RequireCapability>
    );
}
