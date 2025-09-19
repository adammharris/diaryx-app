import { test, expect } from '@playwright/test';

test.describe('Mobile drawers', () => {
  test('clicking outside (backdrop) collapses library and metadata panels', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.addInitScript(() => {
      const noteId = 'e2e-mobile-drawers';
      const now = Date.now();
      const note = {
        id: noteId,
        body: [
          '# Mobile Drawers Seed',
          '',
          'This is a seeded note to ensure the editor and mobile toggles render.',
        ].join('\n'),
        metadata: { title: 'Mobile Drawers' },
        lastModified: now,
      };
      try {
        localStorage.setItem('diaryx.editorMode', 'split');
        localStorage.setItem('diaryx.notes.index', JSON.stringify([noteId]));
        localStorage.setItem(`diaryx.note:${noteId}`, JSON.stringify(note));
      } catch {
        // ignore storage errors
      }
    });
    await page.goto('/');

    // Ensure mobile drawer toggles are present before proceeding
    await expect(page.locator('.mobile-drawer-toggle.left')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.mobile-drawer-toggle.right')).toBeVisible({ timeout: 10000 });

    const libraryDrawer = page.locator('#library-drawer');
    const metadataDrawer = page.locator('#metadata-drawer');

    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true');

    await page.locator('.mobile-drawer-toggle.left').click();
    await page.waitForTimeout(120);
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true', { timeout: 10000 });

    const backdrop = page.locator('.drawer-backdrop');
    await backdrop.waitFor({ state: 'attached' });
    await expect(backdrop).toHaveAttribute('data-open', 'true');
    await page.waitForFunction(() => {
      const el = document.querySelector('.drawer-backdrop') as HTMLElement | null;
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.pointerEvents === 'auto' && parseFloat(cs.opacity || '0') > 0.5;
    });
    const box1 = await backdrop.boundingBox();
    if (box1) {
      // Left drawer open: click far right of the backdrop to avoid being overlapped by the drawer
      await page.mouse.click(box1.x + box1.width - 10, box1.y + box1.height / 2);
    } else {
      await backdrop.click({ position: { x: 5, y: 5 } });
    }
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true', { timeout: 10000 });

    await page.locator('.mobile-drawer-toggle.right').click();
    await page.waitForTimeout(120);
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true');

    // Click outside (backdrop) to close metadata drawer
    await expect(backdrop).toHaveAttribute('data-open', 'true');
    await page.waitForFunction(() => {
      const el = document.querySelector('.drawer-backdrop') as HTMLElement | null;
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.pointerEvents === 'auto' && parseFloat(cs.opacity || '0') > 0.5;
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('.drawer-backdrop') as HTMLElement | null;
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.pointerEvents === 'auto' && parseFloat(cs.opacity || '0') > 0.5;
    });
    const box2 = await backdrop.boundingBox();
    if (box2) {
      // Right drawer open: click far left of the backdrop to avoid being overlapped by the drawer
      await page.mouse.click(box2.x + 10, box2.y + box2.height / 2);
    } else {
      await backdrop.click({ position: { x: 5, y: 5 } });
    }
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true', { timeout: 10000 });

    await page.locator('.mobile-drawer-toggle.left').click();
    await page.waitForTimeout(120);
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true', { timeout: 10000 });

    // Click outside (backdrop) to close library drawer
    await expect(backdrop).toHaveAttribute('data-open', 'true');
    const box3 = await backdrop.boundingBox();
    if (box3) {
      // Left drawer open again: click far right of the backdrop
      await page.mouse.click(box3.x + box3.width - 10, box3.y + box3.height / 2);
    } else {
      await backdrop.click({ position: { x: 5, y: 5 } });
    }
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'true', { timeout: 10000 });
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'true', { timeout: 10000 });

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(libraryDrawer).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
    await expect(metadataDrawer).toHaveAttribute('aria-hidden', 'false', { timeout: 10000 });
  });
});
