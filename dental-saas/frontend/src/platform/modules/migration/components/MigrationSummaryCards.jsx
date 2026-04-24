import React, { useMemo } from "react";
import { Building2, Layers, Activity, AlertTriangle } from "lucide-react";

function Card({ icon: Icon, label, value, accent = "text-gray-800", children }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wide">
                {Icon ? <Icon className="w-4 h-4" /> : null}
                <span>{label}</span>
            </div>
            <div className={`text-3xl font-semibold ${accent}`}>{value}</div>
            {children ? <div className="text-xs text-gray-500 mt-1">{children}</div> : null}
        </div>
    );
}

export function MigrationSummaryCards({ orgs }) {
    const summary = useMemo(() => {
        const total = orgs.length;

        const distribution = {};
        for (const o of orgs) {
            if (!o.cluster) continue;
            distribution[o.cluster] = (distribution[o.cluster] || 0) + 1;
        }
        const sortedClusters = Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        const ongoing = orgs.filter((o) =>
            (o.migrationState && o.migrationState !== "FAILED") || o.maintenanceMode
        ).length;
        const failed = orgs.filter((o) => o.migrationState === "FAILED").length;

        return { total, distribution, sortedClusters, ongoing, failed };
    }, [orgs]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card icon={Building2} label="Total organizations" value={summary.total} />

            <Card
                icon={Layers}
                label="Cluster distribution"
                value={Object.keys(summary.distribution).length}
            >
                {summary.sortedClusters.length === 0
                    ? "No clusters yet"
                    : summary.sortedClusters.map(([key, count]) => (
                        <div key={key} className="flex justify-between font-mono">
                            <span className="truncate">{key}</span>
                            <span className="text-gray-400">{count}</span>
                        </div>
                    ))}
            </Card>

            <Card
                icon={Activity}
                label="Ongoing migrations"
                value={summary.ongoing}
                accent={summary.ongoing > 0 ? "text-amber-600" : "text-gray-800"}
            >
                {summary.ongoing > 0 ? "Live updates every 3s" : "All quiet"}
            </Card>

            <Card
                icon={AlertTriangle}
                label="Failed migrations"
                value={summary.failed}
                accent={summary.failed > 0 ? "text-rose-600" : "text-gray-800"}
            >
                {summary.failed > 0 ? "Needs operator attention" : "No failures"}
            </Card>
        </div>
    );
}

export default MigrationSummaryCards;
