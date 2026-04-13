import { test, expect } from '@playwright/test';

test.describe('Add-On Lifecycle E2E', () => {
    test('should allow superadmin to add and remove add-ons with UI updates', async ({ page }) => {
        // 1. Login as Superadmin
        await page.goto('/platform/login');
        await page.fill('input[name="email"]', 'superadmin@dental-saas.com');
        await page.fill('input[name="password"]', 'superadmin123');
        await page.click('button[type="submit"]');

        await expect(page).toHaveURL(/.*\/platform\/dashboard/);

        // 2. Open Organization
        await page.click('a[href="/platform/organizations"]');
        await page.click('tbody tr:first-child a');

        // 3. Verify initial limits (e.g., from a badge or stat card)
        const initialLimit = await page.textContent('[data-testid="quota-sms-limit"]');

        // 4. Add SMS Booster Add-On
        await page.click('button:has-text("Manage Add-ons")'); // Open modal
        await page.click('button:has-text("Add SMS Booster")');
        await page.click('button:has-text("Confirm Purchase")');

        // 5. Verify UI reflects increased limits
        await expect(page.locator('text=Add-on applied successfully')).toBeVisible();
        await expect(page.locator('[data-testid="quota-sms-limit"]')).not.toHaveText(initialLimit || '');

        // 6. Remove Add-on
        await page.click('button:has-text("Manage Add-ons")'); // Re-open or use a list
        await page.click('button[aria-label="Remove SMS Booster"]');
        await page.click('button:has-text("Confirm Removal")');

        // 7. Verify limits revert
        await expect(page.locator('text=Add-on removed successfully')).toBeVisible();
        await expect(page.locator('[data-testid="quota-sms-limit"]')).toHaveText(initialLimit || '');

        // 8. Refresh and confirm state persistence
        await page.reload();
        await expect(page.locator('[data-testid="quota-sms-limit"]')).toHaveText(initialLimit || '');
    });
});
