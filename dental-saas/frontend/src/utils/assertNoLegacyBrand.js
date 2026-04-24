/**
 * assertNoLegacyBrand.js — DEV-only runtime guard
 *
 * Fires a loud console.error if "DentalSaaS" appears anywhere in the
 * rendered DOM. Runs once after initial render + periodically on route
 * changes so regressions are caught instantly during development.
 */
export function assertNoLegacyBrand() {
  if (!import.meta.env.DEV) return;

  const FORBIDDEN = "DentalSaaS";

  const check = () => {
    if (document.documentElement.innerHTML.includes(FORBIDDEN)) {
      console.error(
        `🚨 LEGACY BRAND REGRESSION DETECTED: "${FORBIDDEN}" found in rendered DOM.\n` +
        `   Run \`npm run lint:branding\` to locate the source file.`
      );
    }
  };

  // Check after initial render settles
  setTimeout(check, 2000);

  // Re-check on route changes (SPA navigation)
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      setTimeout(check, 500);
    }
  }, 1000);
}
