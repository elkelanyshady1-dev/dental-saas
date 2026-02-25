import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import api from "../../../../services/api";

const ROUTE_LABELS = {
    platform: "Platform",
    organizations: "Organizations",
    users: "Users",
    revenue: "Revenue Intelligence",
    dunning: "Dunning Monitor",
    analytics: "Tenant Telemetry",
    system: "System Intelligence",
    cron: "Cron Monitor",
    email: "Email Logs",
    billing: "Billing & Subscription",
    audit: "Audit Logs",
    "audit-logs": "Audit Logs"
};

export default function Breadcrumbs({ hasPermission }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { orgId, userId } = useParams();
    const [cache, setCache] = useState({});

    const pathnames = location.pathname.split("/").filter((x) => x);

    useEffect(() => {
        const resolveEntities = async () => {
            // Resolve Organization Name
            if (orgId && !cache[orgId]) {
                try {
                    const res = await api.get(`/platform/organizations/${orgId}`);
                    const name = res.data?.name || "Organization";
                    setCache(prev => ({ ...prev, [orgId]: name }));
                } catch (err) {
                    console.error(err);
                    setCache(prev => ({ ...prev, [orgId]: "Organization" })); // Prevent re-fetch on error
                }
            }
            // Resolve User Name
            if (userId && !cache[userId]) {
                try {
                    // Try organization user first if orgId is present
                    const url = orgId
                        ? `/platform/organizations/${orgId}/users/${userId}`
                        : `/platform/users/${userId}`;
                    const res = await api.get(url);
                    const name = res.data?.name || "User";
                    setCache(prev => ({ ...prev, [userId]: name }));
                } catch (err) {
                    console.error(err);
                    setCache(prev => ({ ...prev, [userId]: "User" })); // Prevent re-fetch on error
                }
            }
        };
        resolveEntities();
    }, [orgId, userId]); // Removed cache from dependency array to prevent infinite loop

    // Basic Permission Mapping (Optional extension point)
    const canView = (segment) => {
        if (segment === 'organizations') return hasPermission("platform.analytics.organizations");
        if (segment === 'revenue' || segment === 'dunning') return hasPermission("platform.analytics.revenue");
        if (segment === 'users' || segment === 'system' || segment === 'audit-logs') return hasPermission("superadmin"); // Simplified check
        return true;
    };

    return (
        <nav className="flex items-center text-sm text-gray-400 font-medium mb-1 flex-wrap gap-1.5 overflow-hidden">
            {pathnames.map((value, index) => {
                const last = index === pathnames.length - 1;
                const to = `/${pathnames.slice(0, index + 1).join("/")}`;

                // Permission Gate
                if (!canView(value)) return null;

                // Label Resolution
                let label = ROUTE_LABELS[value] || value;
                if (value === orgId && cache[orgId]) label = cache[orgId];
                if (value === userId && cache[userId]) label = cache[userId];

                // If it's a UUID/ObjectId and not in cache yet, show 'Loading...' or 'ID'
                if (value.length > 20 && !cache[value] && (value === orgId || value === userId)) {
                    label = "...";
                }

                // Hide redundant segments (e.g. if we are on details page, the 'organizations' segment is enough)
                // Actually, the user wants: Platform / Organizations / [Org Name] / Billing

                return (
                    <div key={to} className="flex items-center gap-1.5 group">
                        {index > 0 && <span className="text-gray-300 pointer-events-none text-[10px]">/</span>}
                        {last ? (
                            <span className="text-gray-900 font-bold truncate max-w-[200px]">
                                {label}
                            </span>
                        ) : (
                            <Link
                                to={to}
                                className="hover:text-blue-600 transition-colors cursor-pointer whitespace-nowrap"
                            >
                                {label}
                            </Link>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
