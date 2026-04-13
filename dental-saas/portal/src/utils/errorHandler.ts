/**
 * errorHandler.ts
 * Global error normalization for the Patient Portal
 *
 * ─── SECURITY ────────────────────────────────────────────────────────
 *   ✅ NEVER exposes stack traces, backend messages, or internal IDs
 *   ✅ Returns only safe, user-friendly messages
 *   ✅ Categorizes errors by type for consistent UI handling
 */

import type { AxiosError } from 'axios';

export type ErrorType = 'network' | 'auth' | 'validation' | 'server' | 'unknown';

export interface NormalizedError {
  message: string;
  type: ErrorType;
}

const STATUS_MAP: Record<number, { message: string; type: ErrorType }> = {
  400: { message: 'Invalid request. Please check your input.', type: 'validation' },
  401: { message: 'Session expired. Please log in again.', type: 'auth' },
  403: { message: 'You do not have permission for this action.', type: 'auth' },
  404: { message: 'The requested resource was not found.', type: 'server' },
  409: { message: 'A conflict occurred. Please try again.', type: 'validation' },
  422: { message: 'Validation error. Please check your input.', type: 'validation' },
  429: { message: 'Too many requests. Please wait a moment.', type: 'server' },
  500: { message: 'Server error. Please try again later.', type: 'server' },
  502: { message: 'Service temporarily unavailable.', type: 'server' },
  503: { message: 'Service is under maintenance. Please try later.', type: 'server' },
};

/**
 * Normalizes any error into a safe, user-friendly format.
 * NEVER exposes: stack traces, backend error details, internal IDs.
 */
export function normalizeError(error: unknown): NormalizedError {
  // Axios error with response
  if (isAxiosError(error) && error.response) {
    const status = error.response.status;
    const mapped = STATUS_MAP[status];

    if (mapped) return mapped;

    return {
      message: 'An unexpected error occurred.',
      type: 'unknown',
    };
  }

  // Network / timeout error (no response received)
  if (isAxiosError(error) && !error.response) {
    if (error.code === 'ECONNABORTED') {
      return {
        message: 'Request timed out. Please check your connection.',
        type: 'network',
      };
    }
    return {
      message: 'Network error. Please check your internet connection.',
      type: 'network',
    };
  }

  return {
    message: 'An unexpected error occurred.',
    type: 'unknown',
  };
}

function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error;
}

/** Safe message extraction for catch blocks */
export function getErrorMessage(error: unknown): string {
  return normalizeError(error).message;
}
