/**
 * LabPageShell — shared page chrome for lab pages.
 *
 * Provides the clinical light-mode header with breadcrumb, title,
 * optional eyebrow, and a slot for page actions. Wraps children in a
 * LabErrorBoundary so render failures stay scoped.
 */

import { Link } from "react-router-dom";
import { ChevronRightIcon, BeakerIcon } from "@heroicons/react/24/outline";
import LabErrorBoundary from "./LabErrorBoundary";

export default function LabPageShell({
    eyebrow,
    title,
    subtitle,
    breadcrumbs = [],
    actions,
    children,
}) {
    return (
        <div className="min-h-full bg-surface">
            <header className="bg-card border-b border-borderSubtle px-6 lg:px-8 py-6">
                <div className="max-w-[1400px] mx-auto">
                    {breadcrumbs.length > 0 && (
                        <nav className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
                            <BeakerIcon className="w-3.5 h-3.5 text-brand-clinical" />
                            {breadcrumbs.map((bc, i) => (
                                <span key={i} className="flex items-center gap-1.5">
                                    {bc.to ? (
                                        <Link
                                            to={bc.to}
                                            className="hover:text-brand-clinical transition-colors"
                                        >
                                            {bc.label}
                                        </Link>
                                    ) : (
                                        <span className="text-text-secondary">{bc.label}</span>
                                    )}
                                    {i < breadcrumbs.length - 1 && (
                                        <ChevronRightIcon className="w-3 h-3 text-text-subtle" />
                                    )}
                                </span>
                            ))}
                        </nav>
                    )}

                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            {eyebrow && (
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-clinical mb-1">
                                    {eyebrow}
                                </p>
                            )}
                            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
                                {title}
                            </h1>
                            {subtitle && (
                                <p className="text-sm text-text-muted mt-1">{subtitle}</p>
                            )}
                        </div>
                        {actions && (
                            <div className="flex items-center gap-2 flex-wrap">{actions}</div>
                        )}
                    </div>
                </div>
            </header>

            <main className="px-6 lg:px-8 py-8">
                <div className="max-w-[1400px] mx-auto">
                    <LabErrorBoundary>{children}</LabErrorBoundary>
                </div>
            </main>
        </div>
    );
}
