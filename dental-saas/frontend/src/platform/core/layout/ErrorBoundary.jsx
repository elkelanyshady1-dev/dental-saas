/**
 * ErrorBoundary.jsx
 * v11.1 Sovereign Governance — Resilience Layer
 */

import React, { Component } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        const requestId = window.__lastRequestId || null;
        console.error("[UI_ERROR_BOUNDARY] Sovereign Crash Detected", {
            requestId,
            message: error?.message,
            stack: error?.stack?.slice(0, 400),
            componentStack: errorInfo?.componentStack?.slice(0, 400),
            timestamp: new Date().toISOString(),
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Governance Console Crash</h2>
                    <p className="text-slate-400 max-w-md mb-8">
                        A critical error occurred in this module. Sovereign safety protocols have suspended execution to prevent data drift.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all font-semibold"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Reload Sovereign Console
                    </button>

                    <div className="mt-8 p-4 bg-slate-950 border border-slate-800 rounded-lg text-left w-full max-w-2xl overflow-hidden">
                        <div className="text-[10px] text-slate-500 uppercase mb-2">Stack Trace</div>
                        <pre className="text-xs text-red-400/80 font-mono whitespace-pre-wrap">
                            {this.state.error?.message}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
