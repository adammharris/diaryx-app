import { test, expect } from '@playwright/test';

test.describe('Editor visibility on initial load', () => {
  test('CodeMirror editor is visible without toggling modes', async ({ page }) => {
    // Force a deterministic initial mode before navigation.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('diaryx.editorMode', 'source');
        // Clear any prior UI state that could interfere
        localStorage.removeItem('diaryx.theme');
        localStorage.removeItem('diaryx.accent');
      } catch {
        // ignored
      }
    });

    await page.goto('/');

    // App shell should be present and not deferred by on:qvisible
    const appShell = await page.waitForSelector('.app-shell', { state: 'attached' });
    const appShellHasOnQVisible = await appShell.evaluate((el) =>
      el.hasAttribute('on:qvisible')
    );
    expect(appShellHasOnQVisible).toBeFalsy();

    // The editor container should be in the DOM
    const container = await page.waitForSelector('.codemirror-container', {
      state: 'attached',
      timeout: 10_000,
    });

    // Ensure the CodeMirror editor mounts and is visible (not the fallback)
    const editor = page.locator('.codemirror-container .cm-editor');
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Bounding box must have a positive height to ensure it's actually rendered
    const box = await editor.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // The content element should be contenteditable (sanity check the view is initialized)
    const isContentEditable = await page.$eval(
      '.codemirror-container .cm-content',
      (el) => el.getAttribute('contenteditable') === 'true'
    );
    expect(isContentEditable).toBe(true);

    // Fallback should not be visible once editor is ready
    const fallbackLocator = page.locator('.codemirror-fallback');
    if (await fallbackLocator.count()) {
      await expect(fallbackLocator).toBeHidden();
    }
  });
});
