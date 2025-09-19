import { test, expect } from '@playwright/test';

test.describe('Mobile drawers', () => {
  test('close buttons collapse library and metadata panels', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto('/');

    const libraryDrawer = page.locator('#library-drawer');
    const metadataDrawer = page.locator('#metadata-drawer');
    const libraryClose = libraryDrawer.locator('.drawer-close');
    const metadataClose = metadataDrawer.locator('.drawer-close');

    if ((await metadataDrawer.getAttribute('aria-hidden')) === 'false') {
      await metadataClose.click();
      await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');
    }
    if ((await libraryDrawer.getAttribute('aria-hidden')) === 'false') {
      await libraryClose.click();
      await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');
    }

    await page.locator('.mobile-drawer-toggle.left').click();
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false');
    await libraryClose.click();
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');

    await page.locator('.mobile-drawer-toggle.right').click();
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'false');
    await metadataClose.click();
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');
  });
});
