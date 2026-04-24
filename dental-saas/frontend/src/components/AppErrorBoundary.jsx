/**
 * AppErrorBoundary.jsx
 *
 * Neutral error boundary for org-plane surfaces (patient layout, lazy-loaded
 * clinical components, etc). Unlike the platform sovereign boundary, this one
 * matches the clinician UI and gives the user a retry affordance without
 * reloading the whole tab.
 */

import React, { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

class AppErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Structured log so ops can trace which boundary caught the crash.
        console.error('[AppErrorBoundary] render error', {
            boundary: this.props.label || 'unlabelled',
            message: error?.message,
            stack: error?.stack?.slice(0, 400),
            componentStack: errorInfo?.componentStack?.slice(0, 400),
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        this.props.onReset?.();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        const code = this.state.error?.response?.data?.error?.code;
        const copy =
            code === 'PERMISSION_DENIED'
                ? { title: 'Access denied', body: "You don't have permission to view this section." }
                : code === 'NOT_FOUND'
                    ? { title: 'Not found', body: 'The requested resource does not exist or was removed.' }
                    : code === 'VALIDATION_ERROR'
                        ? { title: 'Invalid data', body: 'The server rejected the last request. Please retry.' }
                        : { title: 'Something went wrong', body: 'An unexpected error prevented this view from loading.' };

        return (
            <div
                className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center"
                role="alert"
                aria-live="assertive"
            >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-4">
                    <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1.5">{copy.title}</h3>
                <p className="text-sm text-slate-500 max-w-md mb-5">{copy.body}</p>
                <button
                    onClick={this.handleReset}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-all"
                >
                    <RotateCcw className="w-4 h-4" />
                    Try again
                </button>
            </div>
        );
    }
}

export default AppErrorBoundary;
