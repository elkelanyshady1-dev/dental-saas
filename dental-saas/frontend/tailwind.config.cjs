/** @type {import('tailwindcss').Config} */

/**
 * Tailwind Design Token Bridge
 *
 * Extends Tailwind's default theme with DentalSaaS design tokens.
 * These extensions add SEMANTIC utility classes (e.g. bg-brand-primary)
 * on TOP of default Tailwind — nothing is overridden or removed.
 *
 * Usage in JSX:
 *   bg-brand-primary        → #2563eb
 *   bg-surface              → #ffffff
 *   bg-sidebar              → #0f172a
 *   bg-success              → #10b981
 *   border-subtle           → border-subtle token
 *   text-primary            → #0f172a
 *   shadow-brand            → blue glow shadow
 *
 * All standard Tailwind classes remain available during the migration period.
 *
 * ── PHASE 2: TOKEN LOCKDOWN (activate after migration sprint) ───────────────
 *
 * To remove raw palette access, replace `theme.extend.colors` with
 * `theme.colors` (no extend key). This makes bg-blue-500, text-gray-700,
 * etc. no longer generate CSS utilities.
 *
 * Migration checklist before activating lockdown:
 *   1. Run: node scripts/validateDesignTokens.js
 *      Fix ALL reported violations
 *   2. Run: npm run lint
 *      Fix ALL design-token warnings (change severity to 'error' first)
 *   3. Replace 'extend' → remove it (theme.colors, not theme.extend.colors)
 *   4. Run: npm run build
 *      Verify zero build errors
 *   5. Run full regression: npm test
 *
 * ─────────────────────────────────────────────────────────────────────────
 */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // ── Semantic Color Tokens ──────────────────────────────────
      colors: {
        // Aura Medical Pro — Brand
        brand: {
          primary: 'var(--color-brand-primary)',
          'primary-lt': 'var(--color-brand-primary-lt)',
          hover: 'var(--color-brand-primary-hover)',
          container: 'var(--color-primary_container)',
          accent: 'var(--color-brand-accent)',
          border: 'var(--color-brand-border)',
        },

        // Aura Medical Pro — Surfaces (The No-Line Rule)
        surface: 'var(--color-surface)',
        'surface-low': 'var(--color-surface-low)',
        'surface-lowest': 'var(--color-surface-lowest)',
        'surface-high': 'var(--color-surface-high)',
        'surface-subtle': 'var(--color-surface-low)',
        'surface-strong': 'var(--color-surface-high)',
        'surface-dark': 'var(--color-sidebar-bg)',

        // Card
        card: 'var(--color-surface-lowest)',

        // Typography
        'text-primary': 'var(--color-text-primary)',
        'text-body': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        'text-subtle': 'var(--color-text-disabled)',

        // Borders
        border: 'var(--color-border-default)',
        subtle: 'var(--color-border-soft)',
        'border-muted': 'var(--color-border-soft)',
        'border-strong': 'var(--color-text-muted)',

        // Sidebar
        sidebar: {
          DEFAULT: 'var(--color-sidebar-bg)',
          hover: 'var(--color-sidebar-hover)',
          text: 'var(--color-sidebar-text)',
          'text-muted': 'var(--color-sidebar-text-muted)',
          border: 'var(--color-sidebar-border)',
          active: 'var(--color-sidebar-active)',
        },

        // Semantic status
        success: {
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          text: 'var(--color-success-text)',
          border: 'var(--color-success-border)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          text: 'var(--color-warning-text)',
          border: 'rgba(245, 158, 11, 0.2)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
          text: 'var(--color-danger-text)',
          border: 'var(--color-danger-border)',
        },
        info: {
          DEFAULT: '#3b82f6',
          bg: '#eff6ff',
          text: '#1d4ed8',
          border: '#bfdbfe',
        },

        // Page backgrounds
        'bg-page': 'var(--color-bg)',
        'bg-card': 'var(--color-surface-lowest)',
        'bg-dark': 'var(--color-sidebar-bg)',
      },

      // ── Border Radius Tokens ───────────────────────────────────
      borderRadius: {
        card: 'var(--radius-lg)',
        'card-xl': 'var(--radius-xl)',
        btn: 'var(--radius-md)',
        pill: 'var(--radius-full)',
      },

      // ── Shadow Tokens ──────────────────────────────────────────
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'card': 'var(--shadow-sm)',
        'card-hover': 'var(--shadow-md)',
        'ambient': 'var(--shadow-lg)',
        'brand': 'var(--shadow-brand)',
        'inner-sm': 'inset 0 1px 2px rgba(0,0,0,0.06)',
      },

      // ── Transition Tokens ──────────────────────────────────────
      transitionDuration: {
        '150': '150ms',
        '250': '250ms',
      },
      transitionTimingFunction: {
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      // ── Font Family ────────────────────────────────────────────
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        manrope: ['"Manrope"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },

      // ── Animation ─────────────────────────────────────────────
      animation: {
        'in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};