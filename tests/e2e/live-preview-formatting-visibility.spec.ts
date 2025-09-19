import { test, expect } from '@playwright/test';

test.describe('Live Preview formatting visibility', () => {
  test('markdown tokens are hidden by default and visible on selection', async ({ page }) => {
    // Seed a deterministic note and force live mode
    await page.addInitScript(() => {
      const noteId = 'e2e-live-formatting';
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
        metadata: { title: 'Formatting Visibility' },
        lastModified: now,
      };
      try {
        localStorage.setItem('diaryx.editorMode', 'live');
        localStorage.setItem('diaryx.notes.index', JSON.stringify([noteId]));
        localStorage.setItem(`diaryx.note:${noteId}`, JSON.stringify(note));
      } catch {
        // ignore storage errors in restricted environments
      }
    });

    await page.goto('/');

    // Ensure the editor is present and live mode is active
    const editor = page.locator('.codemirror-container .cm-editor');
    await expect(editor).toBeVisible({ timeout: 10_000 });

    const noteEditor = page.locator('.note-editor');
    await expect(noteEditor).toHaveAttribute('data-mode', 'live');

    // There should be formatting token elements (e.g., #, *, `, >) with class .cm-formatting
    const formattingTokens = page.locator('.cm-formatting');
    await expect(formattingTokens).toHaveCountGreaterThan(0);

    // Verify formatting tokens are hidden by default (color: transparent)
    const tokenCount = await formattingTokens.count();
    const sampleCount = Math.min(tokenCount, 6);
    for (let i = 0; i < sampleCount; i++) {
      const color = await formattingTokens.nth(i).evaluate((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        return cs.color;
      });
      // Transparent often resolves to rgba(0, 0, 0, 0)
      expect(color.toLowerCase()).toContain('0, 0, 0, 0');
    }

    // Try to select a formatting token by dragging across it
    const firstToken = formattingTokens.first();
    const box = await firstToken.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + Math.max(1, box.width / 3), box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + Math.max(2, (box.width * 2) / 3), box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
    }

    // The current selection should contain at least one markdown formatting character
    const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selectedText).toMatch(/[#*`>]/);

    // Optionally, if the browser exposes ::selection styles via getComputedStyle, verify it's not transparent.
    // This is a soft assertion since support varies.
    const selectionColor = await firstToken.evaluate((el) => {
      try {
        // Some engines may return the ::selection computed color; others may return empty string.
        const pseudo = (getComputedStyle as any)(el, '::selection');
        return (pseudo && pseudo.color) || '';
      } catch {
        return '';
      }
    });
    if (selectionColor && typeof selectionColor === 'string') {
      // When exposed, the ::selection color should not be fully transparent
      expect.soft(selectionColor.toLowerCase()).not.toContain('0, 0, 0, 0');
    }
  });
});

// Small helper: haveCountGreaterThan for readability
expect.extend({
  async toHaveCountGreaterThan(received: any, min: number) {
    const count = await received.count();
    const pass = count > min;
    return {
      pass,
      message: () =>
        `Expected locator to have count > ${min}, but got ${count}`,
    };
  },
});

declare module '@playwright/test' {
  interface Matchers<R, T = {}> {
    toHaveCountGreaterThan(min: number): R;
  }
}
