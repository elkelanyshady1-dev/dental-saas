/**
 * resolveFileUrl.ts
 * ═══════════════════════════════════════════════════════════════
 * Resolves file URLs to their correct displayable format.
 *
 * Handles three URL formats from the storage engine:
 *
 *   1. Relative path (local storage):
 *      "/uploads/orthodontics/photos/orgId/file.jpg"
 *      → prepend API_BASE_URL if configured, else keep relative
 *
 *   2. Absolute URL (S3 / CDN):
 *      "https://bucket.s3.amazonaws.com/org/orgId/file.jpg"
 *      → return as-is (already fully qualified)
 *
 *   3. Blob URL (fallback from failed upload):
 *      "blob:http://localhost:5173/abc-123"
 *      → return as-is (browser-local reference)
 *
 *   4. Data URL (inline images):
 *      "data:image/png;base64,..."
 *      → return as-is
 *
 *   5. null / undefined / empty:
 *      → return empty string (safe for <img src="">)
 *
 * Usage:
 *   import { resolveFileUrl } from '@/utils/resolveFileUrl';
 *   <img src={resolveFileUrl(record.url)} />
 *   <audio src={resolveFileUrl(audioUrl)} />
 *
 * IMPORTANT: This utility is FRONTEND-ONLY. The backend always
 * stores the raw URL as returned by the storage provider.
 * ═══════════════════════════════════════════════════════════════
 */

// ── Base URL Resolution ──────────────────────────────────────────────────────
// In same-origin mode (default), relative paths like "/uploads/..." are served
// by the backend through express.static and the Vite proxy handles routing.
// When VITE_API_URL is set (cross-origin deployment), file URLs need the
// backend origin prepended.
//
// Environment variable format:
//   VITE_API_URL=""                          → same-origin (default)
//   VITE_API_URL="http://localhost:5000/api" → dev cross-origin
//   VITE_API_URL="https://api.example.com"  → production

/// <reference types="vite/client" />

function getBaseUrl(): string {
    const apiUrl = (import.meta.env?.VITE_API_URL as string) || '';

    if (!apiUrl) {
        // Same-origin: relative paths work directly
        return '';
    }

    // Strip /api suffix to get the bare origin
    // "http://localhost:5000/api" → "http://localhost:5000"
    // "http://localhost:5000/api/v1" → "http://localhost:5000"
    return apiUrl.replace(/\/api(\/v\d+)?$/, '');
}

// Cache the base URL — it never changes during a page session
const FILE_BASE_URL = getBaseUrl();

/**
 * Resolve a file URL for display in the browser.
 *
 * @param url — Raw URL from the storage engine or database
 * @returns Fully resolved URL safe for <img src> / <audio src>
 */
export function resolveFileUrl(url: string | null | undefined): string | undefined {
    // Guard: null, undefined, empty string
    // Return undefined (not '') so React omits the src attribute entirely.
    // src="" causes browser console warnings; omitting the attribute is silent.
    if (!url) return undefined;

    // Already absolute — S3, CDN, or external URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }

    // Blob URL — browser-local fallback from failed uploads
    if (url.startsWith('blob:')) {
        return url;
    }

    // Data URL — inline images (base64 encoded)
    if (url.startsWith('data:')) {
        return url;
    }

    // Relative path — prepend base URL if needed
    // "/uploads/orthodontics/photos/xyz/file.jpg"
    if (FILE_BASE_URL) {
        // Ensure no double slashes
        const separator = url.startsWith('/') ? '' : '/';
        return `${FILE_BASE_URL}${separator}${url}`;
    }

    // Same-origin mode: return as-is (works with proxy)
    return url;
}

export default resolveFileUrl;
