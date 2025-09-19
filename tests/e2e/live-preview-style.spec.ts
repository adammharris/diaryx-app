import { test, expect } from '@playwright/test';

test.describe('Live Preview styling', () => {
  test('applies header, inline code, and blockquote styles in live mode', async ({ page }) => {
    // Force live mode and seed a deterministic note in the repo-backed storage
    await page.addInitScript(() => {
      const noteId = 'e2e-live';
      const now = Date.now();
      const note = {
        id: noteId,
        body: [
          '# Title',
          '',
          'Some `code` and **bold** and *italic*.',
          '',
          '> Quote line',
          '',
        ].join('\n'),
        metadata: { title: 'E2E Live' },
        lastModified: now,
      };
      try {
        localStorage.setItem('diaryx.editorMode', 'live');
        localStorage.setItem('diaryx.notes.index', JSON.stringify([noteId]));
        localStorage.setItem(`diaryx.note:${noteId}`, JSON.stringify(note));
      } catch {
        // ignored
      }
    });

    await page.goto('/');

    // Editor is present
    const editor = page.locator('.codemirror-container .cm-editor');
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Live mode applied at the note-editor root
    const noteEditor = page.locator('.note-editor');
    await expect(noteEditor).toHaveAttribute('data-mode', 'live');

    // Header styling (h1) — ensure it has large font-size and heavy weight
    const header = page.locator('.cm-header-1').first();
    await expect(header).toBeVisible();
    const headerStyle = await header.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { fontSize: cs.fontSize, fontWeight: cs.fontWeight };
    });
    const headerFontSizePx = parseFloat(String(headerStyle.fontSize).replace('px', '')) || 0;
    const headerFontWeight = parseInt(String(headerStyle.fontWeight), 10) || 0;
    expect(headerFontSizePx).toBeGreaterThanOrEqual(30); // live CSS sets ~2.4rem (~38px)
    expect(headerFontWeight).toBeGreaterThanOrEqual(600); // bold or heavier

    // Inline code styling — ensure it has a non-transparent background color
    const inlineCode = page.locator('.cm-inline-code').first();
    await expect(inlineCode).toBeVisible();
    const inlineCodeStyle = await inlineCode.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { backgroundColor: cs.backgroundColor, borderRadius: cs.borderRadius };
    });
    // Background should not be fully transparent
    expect(inlineCodeStyle.backgroundColor.toLowerCase()).not.toContain('rgba(0, 0, 0, 0)');
    // Border radius should be non-zero per live theme
    const radiusNumeric = parseFloat(inlineCodeStyle.borderRadius || '0');
    expect(radiusNumeric).toBeGreaterThan(0);

    // Blockquote styling — ensure it has a visible left border
    const quote = page.locator('.cm-quote').first();
    await expect(quote).toBeVisible();
    const quoteStyle = await quote.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return { borderLeftWidth: cs.borderLeftWidth };
    });
    const borderLeftPx = parseFloat(String(quoteStyle.borderLeftWidth).replace('px', '')) || 0;
    expect(borderLeftPx).toBeGreaterThanOrEqual(2); // live theme sets 3px

    // Sanity: contenteditable present (editor initialized with content)
    const isEditable = await page.$eval(
      '.codemirror-container .cm-content',
      (el) => el.getAttribute('contenteditable') === 'true'
    );
    expect(isEditable).toBe(true);
  });
});
