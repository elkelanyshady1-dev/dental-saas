import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";

const formatCurrency = (val) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val || 0);

export default function DunningMonitorPage() {
    const [dunningList, setDunningList] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchDunningData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all orgs to find who is in Grace or Suspended
            const { data: orgs } = await api.get("/platform/organizations");

            const atRiskOrgs = orgs.filter(org =>
                org.subscription?.graceEndsAt ||
                org.subscription?.status === 'suspended'
            );

            // 2. For each at-risk org, fetch their invoices to find pending/failed ones
            const dunningPromises = atRiskOrgs.map(async (org) => {
                try {
                    const { data: invoices } = await api.get(`/platform/organizations/${org.id}/invoices`);
                    const openInvoices = invoices.filter(inv => inv.status === 'pending' || inv.status === 'failed');

                    return openInvoices.map(inv => ({
                        org,
                        invoice: inv
                    }));
                } catch (err) {
                    console.error(`Failed to fetch invoices for org ${org.id}`, err);
                    return [];
                }
            });

            const results = await Promise.all(dunningPromises);
            setDunningList(results.flat().sort((a, b) => new Date(b.invoice.createdAt) - new Date(a.invoice.createdAt)));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDunningData();
    }, []);

    const handleAction = async (invoiceId, actionType, orgId) => {
        try {
            if (actionType === 'retry' || actionType === 'void') {
                const newStatus = actionType === 'void' ? 'void' : 'paid'; // Mocks action
                await api.patch(`/platform/invoices/${invoiceId}/status`, { status: newStatus });
            } else if (actionType === 'suspend') {
                if (!window.confirm("Force suspend this organization?")) return;
                await api.patch(`/platform/organizations/${orgId}/suspend`);
            }
            fetchDunningData();
        } catch (err) {
            alert(err.response?.data?.message || err.message);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-5 h-5 border-2 border-blue-100 border-t-amber-500 rounded-full animate-spin"></div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Scanning Ledger for Dunning...</p>
        </div>
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dunning Monitor</h1>
                    <p className="text-gray-500 mt-1 text-sm">Global view of failing invoices and organizations in grace</p>
                </div>
                <button onClick={fetchDunningData} className="px-4 py-2 bg-white border border-gray-200 shadow-sm rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Refresh Ledger
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                            <th className="px-6 py-4">Organization</th>
                            <th className="px-6 py-4">Plan / Status</th>
                            <th className="px-6 py-4">Amount</th>
                            <th className="px-6 py-4">Retry Timeline</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {dunningList.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-gray-400">No organizations currently in dunning.</td>
                            </tr>
                        ) : dunningList.map(({ org, invoice }) => (
                            <tr key={invoice._id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-semibold text-gray-900">
                                    <Link to={`/platform/organizations/${org.id}?tab=dunning`} className="hover:text-blue-600 transition-colors">
                                        {org.name}
                                    </Link>
                                    <div className="text-[11px] text-gray-400 font-normal">{invoice._id}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="capitalize font-medium text-gray-800">{org.subscription?.plan}</span>
                                    <br />
                                    <span className={`text-[10px] font-bold uppercase ${org.subscription?.status === 'suspended' ? 'text-red-500' : 'text-amber-500'}`}>
                                        {org.subscription?.status === 'suspended' ? 'Suspended' : 'Grace Period'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-black text-gray-800">
                                    {formatCurrency(invoice.subscriptionSnapshot?.finalAmount)}
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-gray-800 font-medium">Attempt {invoice.retryCount} / {invoice.maxRetries}</p>
                                    {invoice.nextRetryAt && (
                                        <p className="text-[11px] text-gray-500 mt-1">Next: {new Date(invoice.nextRetryAt).toLocaleString()}</p>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    {invoice.status !== 'void' && (
                                        <>
                                            <button onClick={() => handleAction(invoice._id, 'void', org.id)} className="px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs font-semibold hover:bg-gray-200 transition-colors">Void</button>
                                        </>
                                    )}
                                    {org.subscription?.status !== 'suspended' && (
                                        <button onClick={() => handleAction(invoice._id, 'suspend', org.id)} className="px-3 py-1 bg-red-50 text-red-600 border border-red-100 rounded text-xs font-semibold hover:bg-red-100 transition-colors shadow-sm">Force Suspend</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
