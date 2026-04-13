/**
 * SubscriptionPage.jsx
 * Platform — Subscription Governance List
 * Token-aligned rewrite. No bg-white/10 glassmorphism.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Eye } from 'lucide-react';
import { getOrganizations } from '@/platform/services/subscriptionService';
import RequireCapability from '@/platform/core/guards/RequireCapability';
import PageContainer from '@/platform/core/ui/PageContainer';
import Card from '@/platform/core/ui/Card';
import { OrgStatusBadge } from '@/platform/core/ui/StatusBadge';
import { LoadingState, ErrorState } from '@/platform/core/ui/Feedback';

const SubscriptionPageContent = () => {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchOrgs = async () => {
            try {
                const data = await getOrganizations();
                setOrgs(data.organizations || []);
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to fetch subscriptions');
            } finally {
                setLoading(false);
            }
        };
        fetchOrgs();
    }, []);

    if (loading) return <LoadingState message="Loading subscriptions…" fullPage />;
    if (error) return <ErrorState message={error} />;

    return (
        <PageContainer
            title="Subscription Governance"
            subtitle={`${orgs.length} tenant${orgs.length !== 1 ? 's' : ''} with active billing`}
            icon={CreditCard}
        >
            <div className="grid grid-cols-1 gap-4">
                {orgs.map(org => (
                    <Card key={org._id} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                <CreditCard className="w-5 h-5 text-blue-500" />
                            </div>
                            <div className="min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{org.name}</p>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">{org._id}</p>
                                <div className="mt-1.5">
                                    <OrgStatusBadge status={org.subscription?.status || org.status} />
                                </div>
                            </div>
                        </div>

                        <Link
                            to={`/platform/subscriptions/${org._id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors shrink-0"
                        >
                            <Eye className="w-4 h-4" /> Manage
                        </Link>
                    </Card>
                ))}

                {orgs.length === 0 && (
                    <Card variant="muted" className="text-center py-16">
                        <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">No subscriptions found</p>
                        <p className="text-slate-400 text-sm mt-1">Subscribe organizations to see them here</p>
                    </Card>
                )}
            </div>
        </PageContainer>
    );
};

export default function SubscriptionPage() {
    return (
        <RequireCapability permission="MANAGE_SUBSCRIPTIONS">
            <SubscriptionPageContent />
        </RequireCapability>
    );
}
