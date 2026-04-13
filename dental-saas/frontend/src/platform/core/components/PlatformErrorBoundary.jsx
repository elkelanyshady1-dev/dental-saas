/**
 * PlatformErrorBoundary.jsx
 * Platform UI Resilience — React Error Boundary
 *
 * Catches React render crashes before they produce a blank screen.
 * Wraps the entire <Outlet /> tree in PlatformShell to ensure:
 *   - Uncaught module errors are surfaced with a visible message
 *   - Console logging preserves the full error stack
 *   - Users never see a completely blank white screen
 *   - A retry mechanism resets the error state
 *
 * Usage:
 *   <PlatformErrorBoundary>
 *     <Outlet />
 *   </PlatformErrorBoundary>
 */
import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export class PlatformErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
        this.handleReset = this.handleReset.bind(this);
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Read the last requestId captured by platformApi's response interceptor.
        // This links the React crash to the backend request that triggered it.
        const requestId = window.__lastRequestId || null;

        console.error("[PlatformErrorBoundary] UI_CRASH_DETECTED", {
            requestId,
            message: error?.message,
            stack: error?.stack?.slice(0, 400),
            componentStack: errorInfo?.componentStack?.slice(0, 400),
            timestamp: new Date().toISOString(),
        });

        this.setState({ errorInfo, requestId });
    }

    handleReset() {
        this.setState({ hasError: false, error: null, errorInfo: null, requestId: null });
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const isDev = import.meta.env.DEV;
        const message = this.state.error?.message || "An unexpected rendering error occurred.";
        const requestId = this.state.requestId;

        return (
            <div className="min-h-[60vh] flex items-center justify-center p-8">
                <div className="w-full max-w-lg">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center shadow-sm">
                        <div className="w-14 h-14 bg-red-100 border border-red-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <AlertTriangle className="w-7 h-7 text-red-500" />
                        </div>

                        <h2 className="text-lg font-bold text-red-800 mb-2">
                            Platform UI Error
                        </h2>
                        <p className="text-sm text-red-600 mb-4 leading-relaxed">
                            {message}
                        </p>

                        {/* Request ID badge — always shown so support can correlate */}
                        {requestId && (
                            <div className="mb-5 px-3 py-2 bg-red-100 border border-red-200 rounded-xl text-left">
                                <p className="text-[9px] font-black uppercase tracking-widest text-red-500 mb-0.5">Request ID</p>
                                <p className="text-[11px] font-mono text-red-700 break-all select-all">{requestId}</p>
                            </div>
                        )}

                        {isDev && this.state.error && (
                            <pre className="text-left text-[10px] text-red-700 bg-red-100 border border-red-200 rounded-xl p-4 mb-5 overflow-x-auto whitespace-pre-wrap font-mono">
                                {this.state.error.stack?.slice(0, 600)}
                            </pre>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={this.handleReset}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Retry
                            </button>
                            <button
                                onClick={() => window.location.assign('/platform/dashboard')}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-red-200 hover:border-red-300 text-red-700 text-sm font-bold rounded-xl transition-colors"
                            >
                                Go to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
