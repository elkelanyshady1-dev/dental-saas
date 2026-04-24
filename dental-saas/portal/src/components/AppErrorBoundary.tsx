/**
 * AppErrorBoundary.tsx
 *
 * Patient-facing error boundary. Wraps the portal main content so a crash in
 * one page doesn't blank the whole app. Surfaces backend error codes where
 * possible so users see actionable copy ("access denied", "not found"),
 * falling back to a generic message otherwise.
 */

import React, { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    label?: string;
    onReset?: () => void;
}
interface State {
    hasError: boolean;
    error: any;
}

class AppErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error('[AppErrorBoundary] render error', {
            boundary: this.props.label || 'unlabelled',
            message: error?.message,
            stack: error?.stack?.slice?.(0, 400),
            componentStack: errorInfo?.componentStack?.slice?.(0, 400),
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
                ? { title: 'Access Denied', body: "You don't have permission to view this page." }
                : code === 'NOT_FOUND'
                    ? { title: 'Not Found', body: 'We couldn\'t locate that resource.' }
                    : code === 'VALIDATION_ERROR'
                        ? { title: 'Invalid Request', body: 'The request was malformed.' }
                        : { title: 'Something went wrong', body: 'An unexpected error prevented this page from loading.' };

        return (
            <div
                className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center"
                role="alert"
                aria-live="assertive"
            >
                <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500 mb-4">
                    <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-1.5">
                    {copy.title}
                </h3>
                <p className="text-xs font-medium text-slate-500 max-w-md mb-5">{copy.body}</p>
                <button
                    onClick={this.handleReset}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-all"
                >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Try again
                </button>
            </div>
        );
    }
}

export default AppErrorBoundary;
