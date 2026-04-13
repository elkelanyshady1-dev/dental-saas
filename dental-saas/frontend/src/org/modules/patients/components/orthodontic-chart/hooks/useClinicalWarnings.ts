/**
 * useClinicalWarnings.ts — React Hook for Clinical Action Warnings
 *
 * USAGE:
 *   const { showWarning, warnings } = useClinicalWarnings();
 *   showWarning('Duplicate action blocked');
 *
 * UI Integration:
 *   {warnings.map(w => <Toast key={w.id}>{w.message}</Toast>)}
 */

import { useState, useCallback, useEffect } from 'react';

export interface ClinicalWarning {
  id: string;
  message: string;
  timestamp: number;
  type: 'warning' | 'error' | 'info';
}

interface UseClinicalWarningsReturn {
  warnings: ClinicalWarning[];
  showWarning: (message: string, type?: 'warning' | 'error' | 'info') => void;
  dismissWarning: (id: string) => void;
  clearWarnings: () => void;
}

const STORAGE_KEY = 'clinical-warnings-enabled';
const MAX_WARNINGS = 5;
const WARNING_TIMEOUT_MS = 5000;

let globalListeners: Array<(warning: ClinicalWarning) => void> = [];
let globalDismissListeners: Array<(id: string) => void> = [];

/**
 * Show a warning from anywhere in the app (including non-React code).
 */
export function showClinicalWarningGlobal(message: string, type: 'warning' | 'error' | 'info' = 'warning'): void {
  const warning: ClinicalWarning = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    message,
    timestamp: Date.now(),
    type,
  };
  globalListeners.forEach(listener => listener(warning));
}

/**
 * React hook for subscribing to clinical warnings.
 */
export function useClinicalWarnings(): UseClinicalWarningsReturn {
  const [warnings, setWarnings] = useState<ClinicalWarning[]>([]);

  const showWarning = useCallback((message: string, type: 'warning' | 'error' | 'info' = 'warning') => {
    const warning: ClinicalWarning = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message,
      timestamp: Date.now(),
      type,
    };
    setWarnings(prev => [...prev.slice(-MAX_WARNINGS + 1), warning]);
  }, []);

  const dismissWarning = useCallback((id: string) => {
    setWarnings(prev => prev.filter(w => w.id !== id));
  }, []);

  const clearWarnings = useCallback(() => {
    setWarnings([]);
  }, []);

  // Subscribe to global warnings from action dispatcher
  useEffect(() => {
    const handleGlobalWarning = (warning: ClinicalWarning) => {
      showWarning(warning.message, warning.type);
    };

    globalListeners.push(handleGlobalWarning);

    return () => {
      globalListeners = globalListeners.filter(l => l !== handleGlobalWarning);
    };
  }, [showWarning]);

  // Subscribe to dismiss requests
  useEffect(() => {
    const handleGlobalDismiss = (id: string) => {
      dismissWarning(id);
    };

    globalDismissListeners.push(handleGlobalDismiss);

    return () => {
      globalDismissListeners = globalDismissListeners.filter(l => l !== handleGlobalDismiss);
    };
  }, [dismissWarning]);

  // Auto-dismiss warnings after timeout
  useEffect(() => {
    if (warnings.length === 0) return;

    const timeouts = warnings.map(w =>
      setTimeout(() => {
        dismissWarning(w.id);
      }, WARNING_TIMEOUT_MS)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [warnings, dismissWarning]);

  return {
    warnings,
    showWarning,
    dismissWarning,
    clearWarnings,
  };
}

/**
 * Hook to check if clinical warnings are enabled.
 */
export function useWarningsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== 'false';
  });

  const setWarningsEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value));
    setEnabled(value);
  }, []);

  return enabled;
}