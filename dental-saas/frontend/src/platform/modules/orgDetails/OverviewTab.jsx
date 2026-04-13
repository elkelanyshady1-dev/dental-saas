/**
 * OverviewTab.jsx
 * OrgDetails — Plan Overview
 * Token-aligned: replaced inline bg-white/rounded-2xl/shadow-sm with Card primitive.
 */
import React from "react";
import { useOrgPlan } from "../../hooks/useOrgPlan";
import { Spinner } from "../../utils/components/Spinner";
import { InfoItem } from "../../utils/components/InfoItem";
import Card, { CardHeader } from "../../core/ui/Card";
import { AlertBanner } from "../../core/ui/Feedback";
import { StatusBadge } from "../../core/ui/StatusBadge";
import { Layers, Zap } from "lucide-react";

export default function OverviewTab({ orgId }) {
    const { data: plan, addons, loading, error } = useOrgPlan(orgId);

    if (loading) return <Spinner />;
    if (error) return <AlertBanner variant="error" message={error} />;
    if (!plan) return <AlertBanner variant="info" message="No plan data available for this organization." />;

    const limits = plan.limits || {};

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Plan Summary */}
                <Card>
                    <CardHeader title="Plan Details" icon={Layers} />
                    <div className="space-y-4">
                        <InfoItem label="Base Plan" value={plan.name} isBold isCaps statusColor="active" />
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wide">Active Add-ons</span>
                            {addons.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {addons.map(addon => (
                                        <StatusBadge
                                            key={addon.key}
                                            variant="info"
                                            label={addon.name}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <span className="text-sm text-slate-400 font-medium">None active</span>
                            )}
                        </div>
                    </div>
                </Card>

                {/* Resource Limits */}
                <Card>
                    <CardHeader title="Effective Limits" icon={Zap} />
                    <div className="grid grid-cols-2 gap-4">
                        <InfoItem label="Max Users" value={limits.maxUsers || "N/A"} isBold />
                        <InfoItem label="Max Branches" value={limits.maxBranches || "N/A"} isBold />
                        <InfoItem label="Monthly Emails" value={limits.monthlyEmails?.toLocaleString() || "0"} isBold />
                        <InfoItem label="Monthly SMS" value={limits.monthlySms?.toLocaleString() || "0"} isBold />
                    </div>
                </Card>
            </div>

            {/* Feature Summary */}
            {plan.features?.length > 0 && (
                <Card>
                    <CardHeader title="Enabled Features" icon={Zap} />
                    <div className="flex flex-wrap gap-3">
                        {plan.features.map(feat => (
                            <div
                                key={feat}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-100"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {feat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}
