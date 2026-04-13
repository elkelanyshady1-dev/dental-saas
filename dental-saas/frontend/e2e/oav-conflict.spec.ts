import { test, expect } from '@playwright/test';

test.describe('OAV Conflict Handling', () => {
    test('should show error on stale version update', async ({ page, context }) => {
        // 1. Setup two pages for the same organization
        const page1 = await context.newPage();
        const page2 = await context.newPage();

        for (const p of [page1, page2]) {
            await p.goto('/platform/login');
            await p.fill('input[name="email"]', 'superadmin@dental-saas.com');
            await p.fill('input[name="password"]', 'superadmin123');
            await p.click('button[type="submit"]');
            await p.goto('/platform/organizations');
            await p.click('tbody tr:first-child a');
        }

        // 2. Update on page 1
        await page1.click('button:has-text("Change Plan")');
        await page1.click('button:has-text("Growth")'); // Assume Growth is one of the options
        await page1.click('button:has-text("Confirm Change")');
        await expect(page1.locator('text=Plan updated successfully')).toBeVisible();

        // 3. Update on page 2 (stale version)
        await page2.click('button:has-text("Change Plan")');
        await page2.click('button:has-text("Pioneer")');
        await page2.click('button:has-text("Confirm Change")');

        // 4. Expect Conflict Error
        await expect(page2.locator('text=VERSION_CONFLICT')).toBeVisible();
        await expect(page2.locator('text=Another user has updated this organization')).toBeVisible();
    });
});
