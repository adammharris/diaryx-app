import { test, expect } from '@playwright/test';

test.describe('Mobile drawers', () => {
  test('close buttons collapse library and metadata panels', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/');

    const libraryDrawer = page.locator('#library-drawer');
    const metadataDrawer = page.locator('#metadata-drawer');

    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');

    await page.locator('.mobile-drawer-toggle.left').click();
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false');
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');

    const backdrop = page.locator('.drawer-backdrop');
    await backdrop.waitFor({ state: 'attached' });
    await expect(backdrop).toHaveAttribute('data-open', 'true');
    await backdrop.click();
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');

    await page.locator('.mobile-drawer-toggle.right').click();
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'false');
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');

    await page.locator('.mobile-drawer-toggle.left').click();
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false');
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');

    await backdrop.waitFor({ state: 'attached' });
    await expect(backdrop).toHaveAttribute('data-open', 'true');
    await backdrop.click();
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false');
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'false');
  });
});
