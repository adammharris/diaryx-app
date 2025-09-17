import {
  component$,
  $,
  useSignal,
  useVisibleTask$,
  type QwikMouseEvent,
} from "@builder.io/qwik";
import {
  exportDiaryxNoteToHtml,
  exportDiaryxNoteToMarkdown,
} from "../lib/diaryx/serializer";
import { createBlankNote } from "../lib/diaryx/sample";
import { parseDiaryxFile, DiaryxParseError } from "../lib/diaryx/parser";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";
import type { ThemePreference, ColorAccent } from "../lib/state/diaryx-context";
import { AuthSection } from "./settings/auth-section";

export const NoteList = component$(() => {
  const session = useDiaryxSession();
  const querySignal = useSignal(session.filters.query);
  const fileInputSignal = useSignal<HTMLInputElement>();
  const exportFormatSignal = useSignal("");
  const accountSectionOpen = useSignal(false);
  const displaySectionOpen = useSignal(false);

  const themeOptions: ReadonlyArray<{
    value: ThemePreference;
    label: string;
    description: string;
  }> = [
    {
      value: "system",
      label: "System",
      description: "Follow your device preference",
    },
    {
      value: "light",
      label: "Light",
      description: "Bright surfaces with dark text",
    },
    {
      value: "dark",
      label: "Dark",
      description: "Dim surfaces with soft contrast",
    },
  ];

  const accentOptions: ReadonlyArray<{
    value: ColorAccent;
    label: string;
  }> = [
    { value: "violet", label: "Violet" },
    { value: "blue", label: "Blue" },
    { value: "teal", label: "Teal" },
    { value: "amber", label: "Amber" },
  ];

  const handleSelect = $((noteId: string) => {
    session.activeNoteId = noteId;
  });

  const handleCreateNote = $(() => {
    const newNote = createBlankNote();
    session.notes.unshift(newNote);
    session.activeNoteId = newNote.id;
  });

  const handleExportActive = $(async (format: "html" | "markdown") => {
    const note = session.notes.find((item) => item.id === session.activeNoteId);
    if (!note) return;
    session.exportState.isExporting = true;
    try {
      const slug = note.metadata.title.replace(/\s+/g, "-").toLowerCase();
      const timestamp = Date.now();
      let filename = slug || "diaryx-note";
      let blob: Blob;
      if (format === "markdown") {
        const markdown = exportDiaryxNoteToMarkdown(note, { includeFrontmatter: true });
        blob = new Blob([markdown], { type: "text/markdown" });
        filename = `${filename}-${timestamp}.md`;
      } else {
        const html = exportDiaryxNoteToHtml(note);
        blob = new Blob([html], { type: "text/html" });
        filename = `${filename}-${timestamp}.html`;
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      session.exportState.lastSuccessAt = Date.now();
    } finally {
      session.exportState.isExporting = false;
    }
  });

  const handleExportChange = $(async (format: "html" | "markdown") => {
    exportFormatSignal.value = format;
    await handleExportActive(format);
    exportFormatSignal.value = "";
  });

  const handleOpenSettings = $(() => {
    session.ui.showSettings = true;
  });

  const handleCloseSettings = $(() => {
    session.ui.showSettings = false;
  });

  const handleThemeSelect = $((theme: ThemePreference) => {
    session.ui.theme = theme;
  });

  const handleAccentSelect = $((accent: ColorAccent) => {
    session.ui.accent = accent;
  });

  const handleOverlayClick = $((event: QwikMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    const currentTarget = event.currentTarget as HTMLElement | null;
    if (target && target === currentTarget) {
      session.ui.showSettings = false;
    }
  });

  const handleImport = $(async (files: FileList | null) => {
    if (!files?.length) return;
    session.importState.isImporting = true;
    session.importState.lastError = undefined;
    const imported: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const { note } = await parseDiaryxFile(file);
          note.sourceName = file.name;
          session.notes.unshift(note);
          imported.push(note.id);
        } catch (error) {
          if (error instanceof DiaryxParseError) {
            session.importState.lastError = `${file.name}: ${error.message}`;
          } else {
            console.error("Diaryx import failed", error);
            session.importState.lastError = `${file.name}: unable to import`;
          }
        }
      }
      if (imported.length) {
        session.activeNoteId = imported[0];
      }
    } finally {
      session.importState.isImporting = false;
    }
  });

  const filteredNotes = session.notes.filter((note) => {
    const query = querySignal.value.toLowerCase();
    if (!query) return true;
    return (
      note.metadata.title.toLowerCase().includes(query) ||
      note.body.toLowerCase().includes(query)
    );
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => session.ui.showSettings);
    if (!session.ui.showSettings) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        session.ui.showSettings = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    cleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <aside
      class={{ "note-list": true, collapsed: !session.ui.showLibrary }}
      aria-hidden={session.ui.showLibrary ? "false" : "true"}
    >
      <header>
        <div class="actions">
          <button type="button" onClick$={handleCreateNote}>
            New
          </button>
          <button
            type="button"
            onClick$={() => fileInputSignal.value?.click()}
            disabled={session.importState.isImporting}
          >
            Import
          </button>
          <select
            aria-label="Export note"
            class="export-select"
            value={exportFormatSignal.value}
            disabled={!session.activeNoteId}
            onChange$={(event) => {
              const target = event.target as HTMLSelectElement;
              const value = target.value as "" | "html" | "markdown";
              if (!value) return;
              handleExportChange(value);
            }}
          >
            <option value="" disabled>
              Export…
            </option>
            <option value="html">Export HTML</option>
            <option value="markdown">Export Markdown</option>
          </select>
          <button type="button" onClick$={handleOpenSettings}>
            Settings
          </button>
        </div>
        <input
          aria-label="Search notes"
          class="search-input"
          placeholder="Search"
          value={querySignal.value}
          onInput$={(event) => {
            const target = event.target as HTMLInputElement;
            const value = target.value;
            querySignal.value = value;
            session.filters.query = value;
          }}
        />
        {session.importState.lastError && (
          <p class="status error">{session.importState.lastError}</p>
        )}
        {session.exportState.lastSuccessAt && (
          <p class="status success">Exported ✓</p>
        )}
      </header>
      <input
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        class="sr-only"
        ref={fileInputSignal}
        onChange$={(event) => handleImport((event.target as HTMLInputElement).files)}
      />
      <ul>
        {filteredNotes.map((note) => {
          const isActive = session.activeNoteId === note.id;
          const preview = note.body.split("\n")[0]?.slice(0, 80) ?? "";
          return (
            <li key={note.id} class={{ active: isActive }}>
              <button type="button" onClick$={() => handleSelect(note.id)}>
                <span class="title">{note.metadata.title}</span>
                <span class="preview">{preview}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {session.ui.showSettings && (
        <div
          class="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-dialog-title"
          aria-describedby="settings-dialog-description"
          onClick$={handleOverlayClick}
        >
          <div class="settings-dialog">
            <header>
              <h2 id="settings-dialog-title">Settings</h2>
              <button
                type="button"
                class="close-button"
                onClick$={handleCloseSettings}
                aria-label="Close settings"
              >
                &times;
              </button>
            </header>
            <div class="settings-content" id="settings-dialog-description">
              <details
                class="settings-section"
                open={accountSectionOpen.value}
                onToggle$={(event) => {
                  accountSectionOpen.value = (event.target as HTMLDetailsElement).open;
                }}
              >
                <summary class="settings-section-summary">
                  <div>
                    <h3>Account</h3>
                    <p>Sign in to sync your notes across devices.</p>
                  </div>
                  <span aria-hidden="true" class="summary-indicator" />
                </summary>
                <div class="settings-section-body">
                  <div class="auth-section">
                    <AuthSection />
                  </div>
                </div>
              </details>
              <details
                class="settings-section"
                open={displaySectionOpen.value}
                onToggle$={(event) => {
                  displaySectionOpen.value = (event.target as HTMLDetailsElement).open;
                }}
              >
                <summary class="settings-section-summary">
                  <div>
                    <h3>Display Options</h3>
                    <p>Adjust contrast and accent colors.</p>
                  </div>
                  <span aria-hidden="true" class="summary-indicator" />
                </summary>
                <div class="settings-section-body">
                  <div class="display-group">
                    <span class="settings-subheading">Mode</span>
                    <div class="theme-options" role="radiogroup" aria-label="Theme selection">
                      {themeOptions.map((option) => (
                        <label
                          key={option.value}
                          class="theme-option"
                          data-selected={session.ui.theme === option.value}
                        >
                          <input
                            type="radio"
                            name="theme"
                            value={option.value}
                            checked={session.ui.theme === option.value}
                            onChange$={() => handleThemeSelect(option.value)}
                          />
                          <span class="option-copy">
                            <span class="option-title">{option.label}</span>
                            <span class="option-hint">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div class="display-group">
                    <span class="settings-subheading">Accent</span>
                    <div class="accent-options" role="radiogroup" aria-label="Accent color selection">
                      {accentOptions.map((option) => {
                        const isSelected = session.ui.accent === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            class="accent-chip"
                            data-accent={option.value}
                            data-selected={isSelected}
                            onClick$={() => handleAccentSelect(option.value)}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={isSelected ? 0 : -1}
                          >
                            <span class="swatch" aria-hidden="true" />
                            <span class="chip-label">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </details>
            </div>
            <footer>
              <button type="button" onClick$={handleCloseSettings}>
                Done
              </button>
            </footer>
          </div>
        </div>
      )}
    </aside>
  );
});
