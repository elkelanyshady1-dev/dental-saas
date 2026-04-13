import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { PLATFORM_FEATURES } from '@/platform/core/routing/platformFeatureRegistry';

/**
 * Breadcrumbs
 * Deterministic navigation indicator derived from the Feature Registry.
 *
 * Matching algorithm: for each path segment at index i, we build the
 * accumulated path "/platform/seg0/.../segi" and compare it against every
 * feature's full path pattern, where `:param` wildcards match any segment.
 * This prevents false matches where a dynamic segment (e.g. templateId)
 * collides with a different feature's param (e.g. ORG_DETAIL's :id).
 */
const Breadcrumbs = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x && x !== 'platform');

    /**
     * Convert a feature path pattern like "plans/templates/:templateId"
     * into a RegExp that matches "/platform/plans/templates/<anything>".
     * Each :param segment becomes [^/]+ so it matches exactly one segment.
     */
    function featurePathToRegex(featurePath) {
        const escaped = featurePath
            .split('/')
            .map(seg => seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('/');
        return new RegExp(`^/platform/${escaped}$`);
    }

    const breadcrumbs = pathnames.map((_, index) => {
        // Build the full accumulated path up to and including this segment
        const accumulatedPath = `/platform/${pathnames.slice(0, index + 1).join('/')}`;

        // Find the feature whose full path pattern matches the accumulated path
        const feature = PLATFORM_FEATURES.find(f => {
            const regex = featurePathToRegex(f.path);
            return regex.test(accumulatedPath);
        });

        const segment = pathnames[index];
        let label = feature?.breadcrumb;
        if (!label) {
            const isHexId = /^[0-9a-fA-F]{24}$/.test(segment);
            const isUUID = /^[0-9a-fA-F-]{36}$/.test(segment);
            if (isHexId || isUUID) {
                const context = pathnames[index - 1];
                label = (context === "versions") ? "Version Detail" : 
                        (context === "organizations") ? "Organization Details" : "Details";
            } else {
                label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
            }
        }

        return {
            label,
            url: accumulatedPath,
            isLast: index === pathnames.length - 1
        };
    });

    if (breadcrumbs.length === 0) return null;

    return (
        <nav className="flex items-center space-x-2 text-sm text-slate-500 mb-6 overflow-x-auto no-scrollbar">
            <Link to="/platform/dashboard" className="hover:text-white transition-colors flex items-center">
                <Home className="w-3.5 h-3.5" />
            </Link>

            {breadcrumbs.map((bc, idx) => (
                <React.Fragment key={bc.url}>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                    {bc.isLast ? (
                        <span className="text-indigo-400 font-medium truncate">{bc.label}</span>
                    ) : (
                        <Link to={bc.url} className="hover:text-white transition-colors truncate">
                            {bc.label}
                        </Link>
                    )}
                </React.Fragment>
            ))}
        </nav>
    );
};

export default Breadcrumbs;
