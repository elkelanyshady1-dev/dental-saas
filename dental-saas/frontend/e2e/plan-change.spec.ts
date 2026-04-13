import { test, expect } from '@playwright/test';

test.describe('Subscription Plan Change Flow', () => {
    test('should allow a superadmin to change an organization plan', async ({ page }) => {
        // 1. Login as Superadmin
        // Note: Using real credentials suitable for the dev environment
        await page.goto('/platform/login');
        await page.fill('input[name="email"]', 'superadmin@dental-saas.com');
        await page.fill('input[name="password"]', 'superadmin123');
        await page.click('button[type="submit"]');

        // Wait for navigation to platform dashboard
        await expect(page).toHaveURL(/.*\/platform\/dashboard/);

        // 2. Navigate to Organizations
        await page.click('a[href="/platform/organizations"]');

        // 3. Select an organization (e.g., the first one in the list)
        await page.click('tbody tr:first-child a');

        // 4. Change plan
        const currentPlan = await page.textContent('[data-testid="current-plan-badge"]');
        const currentVersion = await page.textContent('[data-testid="org-version-badge"]');

        // Monitor console errors
        const consoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        // Open Change Plan Modal
        await page.click('button:has-text("Change Plan")');
        await page.click('button:has-text("Enterprise")');
        await page.click('button:has-text("Confirm Change")');

        // 5. Confirm UI update
        await expect(page.locator('text=Plan updated successfully')).toBeVisible();
        await expect(page.locator('[data-testid="current-plan-badge"]')).not.toHaveText(currentPlan || '');
        await expect(page.locator('[data-testid="org-version-badge"]')).not.toHaveText(currentVersion || '');

        // 6. Verify no console errors
        expect(consoleErrors).toHaveLength(0);
    });
});
