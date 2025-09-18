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
import { createDiaryxRepository } from "../lib/persistence/diaryx-repository";
import { persistMarkdownNotes } from "../lib/persistence/markdown-store";
import { deleteNoteOnServer } from "../lib/sync/note-sync";
import { fetchSharedNotes, SharedNotesError } from "../lib/api/shared-notes";

export const NoteList = component$(() => {
  const session = useDiaryxSession();
  const querySignal = useSignal(session.filters.query);
  const fileInputSignal = useSignal<HTMLInputElement>();
  const exportFormatSignal = useSignal("");
  const accountSectionOpen = useSignal(false);
  const displaySectionOpen = useSignal(false);
  const noteListRef = useSignal<HTMLElement>();

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

  const authorLabel = (value: string | string[] | undefined): string => {
    if (!value) return "";
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
        .filter(Boolean)
        .join(", ");
    }
    return value;
  };

  const handleSelect = $((noteId: string) => {
    if (session.ui.libraryMode === "shared") {
      session.sharedActiveNoteId = noteId;
    } else {
      session.activeNoteId = noteId;
    }
  });

  const handleCreateNote = $(() => {
    if (session.ui.libraryMode === "shared") {
      session.ui.libraryMode = "all";
    }
    const newNote = createBlankNote();
    session.notes.unshift(newNote);
    session.activeNoteId = newNote.id;
  });

  const handleDeleteNote = $(
    async (noteId: string, event?: Event, options?: { confirm?: boolean }) => {
      event?.stopPropagation();
      event?.preventDefault();

      if (options?.confirm !== false && typeof window !== "undefined") {
        const confirmed = window.confirm("Delete this note permanently?");
        if (!confirmed) return;
      }

      const index = session.notes.findIndex((note) => note.id === noteId);
      if (index === -1) return;

      session.notes.splice(index, 1);

      if (session.activeNoteId === noteId) {
        const fallback =
          session.notes[index] || session.notes[index - 1] || session.notes[0];
        session.activeNoteId = fallback?.id;
      }

      const repo = createDiaryxRepository();
      await repo.remove(noteId);
      persistMarkdownNotes(session.notes);

      try {
        await deleteNoteOnServer(noteId);
      } catch (error) {
        console.warn("Failed to delete note on server", error);
      }
    }
  );

  const loadSharedNotes = $(async () => {
    session.sharedNotesState.isLoading = true;
    session.sharedNotesState.lastError = undefined;
    session.sharedNotesState.isUnauthorized = false;
    try {
      const notes = await fetchSharedNotes();
      session.sharedNotes.splice(0, session.sharedNotes.length, ...notes);
      session.sharedNotesState.lastFetchedAt = Date.now();
      const existingActiveId = session.sharedActiveNoteId;
      if (existingActiveId && notes.find((note) => note.id === existingActiveId)) {
        session.sharedActiveNoteId = existingActiveId;
      } else {
        session.sharedActiveNoteId = notes[0]?.id;
      }
    } catch (error) {
      session.sharedNotes.splice(0, session.sharedNotes.length);
      session.sharedActiveNoteId = undefined;
      if (error instanceof SharedNotesError && error.status === 401) {
        session.sharedNotesState.isUnauthorized = true;
      } else if (error instanceof Error) {
        session.sharedNotesState.lastError = error.message;
      } else {
        session.sharedNotesState.lastError = "Unable to load shared notes.";
      }
    } finally {
      session.sharedNotesState.isLoading = false;
    }
  });

  const handleToggleShared = $(async () => {
    if (session.ui.libraryMode === "shared") {
      session.ui.libraryMode = "all";
      return;
    }
    session.ui.libraryMode = "shared";
    if (!session.sharedNotes.length && !session.sharedNotesState.isLoading) {
      await loadSharedNotes();
    }
    if (!session.sharedActiveNoteId && session.sharedNotes.length) {
      session.sharedActiveNoteId = session.sharedNotes[0].id;
    }
  });

  const handleExportActive = $(async (format: "html" | "markdown") => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
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
      session.exportState.lastSuccessFormat = format;
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

  const libraryMode = session.ui.libraryMode;
  const activeCollection = libraryMode === "shared" ? session.sharedNotes : session.notes;
  const searchQuery = querySignal.value.trim().toLowerCase();
  const filteredNotes = activeCollection.filter((note) => {
    if (!searchQuery) return true;
    const titleMatch = String(note.metadata.title ?? "")
      .toLowerCase()
      .includes(searchQuery);
    const bodyMatch = note.body.toLowerCase().includes(searchQuery);
    const authorMatch = authorLabel(note.metadata.author).toLowerCase().includes(searchQuery);
    return titleMatch || bodyMatch || authorMatch;
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

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => session.ui.showLibrary);
    if (!session.ui.showLibrary) {
      return;
    }
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 900px)");
    if (!media.matches) return;
    const target = noteListRef.value;
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
    });
  });

  return (
    <aside
      class={{ "note-list": true, collapsed: !session.ui.showLibrary }}
      aria-hidden={session.ui.showLibrary ? "false" : "true"}
      id="library-drawer"
      tabIndex={-1}
      ref={noteListRef}
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
          <button
            type="button"
            class={{ active: session.ui.libraryMode === "shared" }}
            onClick$={handleToggleShared}
          >
            Shared
          </button>
          <select
            aria-label="Export note"
            class="export-select"
            value={exportFormatSignal.value}
            disabled={session.ui.libraryMode === "shared" || !session.activeNoteId}
            onChange$={(event) => {
              const target = event.target as HTMLSelectElement;
              const value = target.value as "" | "html" | "markdown";
              if (!value) return;
              handleExportChange(value);
            }}
          >
            <option value="" disabled selected={!exportFormatSignal.value}>
              Export
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
          <p class="status success">
            {`Exported${
              session.exportState.lastSuccessFormat
                ? ` ${session.exportState.lastSuccessFormat.toUpperCase()}`
                : ""
            } ✓`}
          </p>
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
      <ul class="note-items">
        {libraryMode === "shared" && session.sharedNotesState.isLoading && (
          <li class="note-empty">Loading shared notes…</li>
        )}
        {libraryMode === "shared" &&
          !session.sharedNotesState.isLoading &&
          session.sharedNotesState.isUnauthorized && (
            <li class="note-empty">Sign in to view shared notes.</li>
          )}
        {libraryMode === "shared" &&
          !session.sharedNotesState.isLoading &&
          !session.sharedNotesState.isUnauthorized &&
          session.sharedNotesState.lastError && (
            <li class="note-empty">{session.sharedNotesState.lastError}</li>
          )}
        {filteredNotes.map((note) => {
          const isActive =
            libraryMode === "shared"
              ? session.sharedActiveNoteId === note.id
              : session.activeNoteId === note.id;
          const preview = note.body.split("\n")[0]?.slice(0, 80) ?? "";
          const author = authorLabel(note.metadata.author);
          return (
            <li key={note.id} class={{ active: isActive }}>
              <button
                type="button"
                class="note-open"
                onClick$={() => handleSelect(note.id)}
              >
                <span class="title">
                  {note.metadata.title}
                  {libraryMode === "shared" && author && (
                    <span class="shared-author"> — {author}</span>
                  )}
                </span>
                <span class="preview">{preview}</span>
              </button>
              {libraryMode !== "shared" && (
                <button
                  type="button"
                  class="note-delete"
                  aria-label="Delete note"
                  title="Delete note"
                  onClick$={(event) => handleDeleteNote(note.id, event)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
        {libraryMode === "shared" &&
          !session.sharedNotesState.isLoading &&
          !session.sharedNotesState.isUnauthorized &&
          !session.sharedNotesState.lastError &&
          !filteredNotes.length && (
            <li class="note-empty">No shared notes yet.</li>
          )}
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
