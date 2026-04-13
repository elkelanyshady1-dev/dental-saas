/**
 * PageContainer.jsx
 * Platform UI Primitive — Standard Page Wrapper
 *
 * Provides consistent page-level heading, subtitle, and spacing.
 * All platform pages should use this as the outermost content wrapper.
 *
 * Usage:
 *   <PageContainer
 *     title="Organizations"
 *     subtitle="Provision and manage tenant organizations"
 *     actions={<button>...</button>}
 *   >
 *     {children}
 *   </PageContainer>
 */
export default function PageContainer({ title, subtitle, icon: Icon, actions, children }) {
    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Page header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    {Icon && (
                        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 shrink-0">
                            <Icon className="w-5 h-5 text-blue-600" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
                        {subtitle && (
                            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
                        )}
                    </div>
                </div>

                {actions && (
                    <div className="flex items-center gap-3 shrink-0">
                        {actions}
                    </div>
                )}
            </div>

            {/* Page content */}
            {children}
        </div>
    );
}
