import { component$, $, useSignal } from "@builder.io/qwik";
import {
  exportDiaryxNoteToHtml,
  exportDiaryxNoteToMarkdown,
} from "../lib/diaryx/serializer";
import { createBlankNote } from "../lib/diaryx/sample";
import { parseDiaryxFile, DiaryxParseError } from "../lib/diaryx/parser";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";

export const NoteList = component$(() => {
  const session = useDiaryxSession();
  const querySignal = useSignal(session.filters.query);
  const fileInputSignal = useSignal<HTMLInputElement>();
  const exportFormatSignal = useSignal("");

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
    </aside>
  );
});
