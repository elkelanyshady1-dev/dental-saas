import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import boundaries from 'eslint-plugin-boundaries'

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),

  // ── Architecture Boundary Enforcement ────────────────────────────────────
  // Enforces Sentinel Frontend Plane Isolation:
  //   • Portal modules MUST NOT import from Org Plane modules
  //   • Org Plane modules MUST NOT import from Platform modules
  //   • organizationId must NEVER appear in portal API payloads
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        // Patient Portal — isolated plane
        { type: 'portal', pattern: 'src/modules/patientDomain/portal/**' },
        { type: 'portal', pattern: 'src/modules/portal/**' },

        // Organization Plane modules
        { type: 'org-modules', pattern: 'src/modules/**' },

        // Platform modules (Platform Plane Admin UI)
        { type: 'platform', pattern: 'src/platform/**' },
        { type: 'platform', pattern: 'src/modules/platform/**' },

        // Shared utilities (both planes may use)
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'api', pattern: 'src/api/**' },
        { type: 'design-system', pattern: 'src/design-system/**' },
      ],
    },
    rules: {
      // ── Portal cannot import from Org Plane modules ──────────────────────
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['portal'],
              disallow: ['org-modules'],
              message:
                '[SentinelGuard] Patient Portal must not import from Org Plane modules. ' +
                'Portal is isolated — use src/api/, src/design-system/, or src/shared/ only.',
            },
            {
              from: ['org-modules'],
              disallow: ['platform'],
              message:
                '[SentinelGuard] Org Plane modules must not import from Platform modules. ' +
                'Use shared utilities only.',
            },
          ],
        },
      ],
    },
  },

  // ── General Rules + Design Token Enforcement ─────────────────────────────
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      'no-restricted-syntax': [
        'warn',

        // ── Forbidden raw Tailwind color utilities in JSX string attributes ──
        {
          selector:
            'JSXAttribute[name.name="className"] > Literal[value=/\\b(bg|text|border|ring|from|to|via|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)(-[0-9]+)?\\b/]',
          message:
            '[DesignToken] Avoid raw Tailwind color utilities. ' +
            'Use semantic design tokens: bg-brand-primary, bg-success, bg-surface, text-primary, etc. ' +
            'See tailwind.config.cjs for the full token list.',
        },

        // ── Forbidden raw Tailwind color utilities in JSX template literals ──
        {
          selector:
            'JSXAttribute[name.name="className"] > JSXExpressionContainer > TemplateLiteral',
          message:
            '[DesignToken] Template-literal className detected. ' +
            'Verify it uses only semantic design tokens (bg-brand-*, bg-success, etc.), not raw Tailwind colors.',
        },

        // ── Forbidden inline hex / rgb / hsl colors in JSX style props ──────
        {
          selector:
            'JSXAttribute[name.name="style"] Property[key.name!=/^--/] > Literal[value=/(#[0-9a-fA-F]{3,8}|rgb\\(|rgba\\(|hsl\\(|hsla\\()/]',
          message:
            '[DesignToken] Raw color values are forbidden in style props. ' +
            'Use CSS custom properties (var(--color-*)) or Tailwind semantic tokens.',
        },

        // ── Dedicated gray-class rule ─────────────────────────────────────────
        {
          selector:
            'JSXAttribute[name.name="className"] > Literal[value=/\\b(bg|text|border|ring)-(gray)-\\d+\\b/]',
          message:
            '[DesignToken] Raw gray-* Tailwind class detected. ' +
            'Replace with design tokens: text-muted, text-subtle, surface-subtle, ' +
            'surface-strong, border, bg-card. See tailwind.config.cjs.',
        },

        // ── Portal Tenant Isolation: no organizationId in portal API calls ───
        {
          selector:
            'MemberExpression[object.name=/[Pp]ortal/][property.name="organizationId"],' +
            'Property[key.name="organizationId"][parent.parent.callee.object.name=/[Pp]ortal/]',
          message:
            '[TenantIsolation] Portal API payloads must NEVER include organizationId. ' +
            'Organization context is derived from the portal JWT on the backend.',
        },
      ],
    },
  },
])
