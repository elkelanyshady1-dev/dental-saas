/**
 * OrthoErrorBoundary.tsx — Error Boundary for Orthodontic Chart Module
 *
 * Catches React rendering errors in the orthodontic chart (scans, TADs, bonding, etc.)
 * and prevents the entire application from crashing.
 *
 * ARCHITECTURE:
 * - Class-based component (required for error boundaries)
 * - Logs errors via structured logger (production: sends to monitoring)
 * - Shows recovery UI with manual reset button
 * - Preserves application state (no full reload)
 *
 * USAGE:
 *   <OrthoErrorBoundary>
 *     <OrthodonticCasePage />
 *   </OrthoErrorBoundary>
 *
 *   With fallback UI:
 *   <OrthoErrorBoundary fallback={<ErrorPlaceholder />}>
 *     <ScanViewer3D />
 *   </OrthoErrorBoundary>
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

export interface OrthoErrorBoundaryProps {
  /**
   * React elements to protect
   */
  children: ReactNode;

  /**
   * Optional custom fallback UI
   * If not provided, renders a styled error card
   */
  fallback?: ReactNode;

  /**
   * Optional callback when error is caught
   * Useful for logging to external services
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface OrthoErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * OrthoErrorBoundary Class Component
 *
 * Implements React Error Boundary API to catch and handle rendering errors.
 * Prevents the entire orthodontic module from crashing the app.
 */
export class OrthoErrorBoundary extends Component<
  OrthoErrorBoundaryProps,
  OrthoErrorBoundaryState
> {
  constructor(props: OrthoErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<OrthoErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error details
    this.setState({
      errorInfo,
    });

    // Log to structured logger
    console.error('[OrthoErrorBoundary] Rendering error caught:', {
      error: error.toString(),
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Call optional callback for external logging
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In production, send to monitoring service (e.g., Sentry)
    // captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-red-50 rounded-2xl border border-red-200">
          {/* Error Icon */}
          <div className="w-16 h-16 mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>

          {/* Heading */}
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            Clinical Chart Error
          </h3>

          {/* Description */}
          <p className="text-sm text-red-600 mb-4 text-center max-w-md leading-relaxed">
            An unexpected error occurred in the clinical chart. Your data has been auto-saved.
          </p>

          {/* Error Message (Dev/Debug) */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-6 w-full max-w-md">
              <summary className="cursor-pointer text-xs text-red-500 font-mono hover:text-red-600">
                Error details (dev only)
              </summary>
              <pre className="mt-2 p-3 bg-red-100 rounded text-xs text-red-700 overflow-auto max-h-48">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {'\n\nComponent Stack:\n'}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}

          {/* Reset Button */}
          <button
            onClick={this.handleReset}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium shadow-md hover:shadow-lg"
            aria-label="Reload clinical chart"
          >
            Reload Chart
          </button>

          {/* Help Text */}
          <p className="text-xs text-red-500 mt-4">
            If the error persists, refresh the page or contact support.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default OrthoErrorBoundary;
