/**
 * LabErrorBoundary — catches render errors inside any lab page and shows a
 * recoverable fallback. Logs to console in dev.
 */

import React from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export default class LabErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        if (import.meta.env?.DEV) {
            // eslint-disable-next-line no-console
            console.error("[LabErrorBoundary]", error, info);
        }
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-danger-bg flex items-center justify-center mb-4">
                    <ExclamationTriangleIcon className="w-7 h-7 text-danger" />
                </div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                    Something went wrong in the Lab module
                </h2>
                <p className="text-sm text-text-muted max-w-md">
                    {this.state.error?.message || "An unexpected error occurred."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="px-4 py-2 text-sm font-medium bg-brand-clinical text-white rounded-btn hover:bg-brand-clinical-hover transition-colors"
                    >
                        Try again
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 text-sm font-medium bg-danger-bg text-danger rounded-btn hover:bg-danger/10 transition-colors"
                    >
                        Reload page
                    </button>
                    <a
                        href="/org/dashboard"
                        className="px-4 py-2 text-sm font-medium bg-surface-low text-text-secondary rounded-btn hover:bg-surface-high transition-colors"
                    >
                        Back to dashboard
                    </a>
                </div>
            </div>
        );
    }
}
