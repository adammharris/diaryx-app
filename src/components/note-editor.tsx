import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import MarkdownIt from "markdown-it";
import { stampNoteUpdated } from "../lib/diaryx/note-utils";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

export const NoteEditor = component$(() => {
  const session = useDiaryxSession();
  const markdownSignal = useSignal("");
  const htmlSignal = useSignal("");
  const viewMode = useSignal(session.ui.editorMode);

  useTask$(({ track }) => {
    const activeId = track(() => session.activeNoteId);
    const note = session.notes.find((item) => item.id === activeId);
    markdownSignal.value = note?.body ?? "";
    htmlSignal.value = note ? md.render(note.body) : "";
  });

  useTask$(({ track }) => {
    const text = track(() => markdownSignal.value);
    htmlSignal.value = md.render(text);
  });

  useTask$(({ track }) => {
    const mode = track(() => session.ui.editorMode);
    if (viewMode.value !== mode) {
      viewMode.value = mode;
    }
  });

  if (!session.activeNoteId) {
    return (
      <section class="note-editor empty">
        <p>Select or create a note to begin.</p>
      </section>
    );
  }

  const note = session.notes.find((item) => item.id === session.activeNoteId);
  if (!note) {
    return (
      <section class="note-editor empty">
        <p>Note not found.</p>
      </section>
    );
  }

  const showEditorPane = viewMode.value === "split" || viewMode.value === "source";
  const showPreviewPane = viewMode.value === "split" || viewMode.value === "preview" || viewMode.value === "live";
  const isLivePreview = viewMode.value === "live";

  return (
    <section class="note-editor" data-mode={viewMode.value}>
      <header class="editor-toolbar">
        <div class="editor-summary">
          <span class="note-title" title={note.metadata.title}>
            {note.metadata.title || "Untitled"}
          </span>
          <span class="note-updated">Updated {note.metadata.updated}</span>
        </div>
        <div class="toolbar-groups">
          <label class="view-select">
            <span class="sr-only">Editor view mode</span>
            <select
              value={viewMode.value}
              onChange$={(event) => {
                const target = event.target as HTMLSelectElement;
                const value = target.value as typeof session.ui.editorMode;
                viewMode.value = value;
                session.ui.editorMode = value;
              }}
            >
              <option value="split">Split view</option>
              <option value="source">Source only</option>
              <option value="preview">Preview only</option>
              <option value="live">Live preview (beta)</option>
            </select>
          </label>
        </div>
      </header>
      <div class="editor-panes">
        {showEditorPane && (
          <div class={{ "editor-pane": true, hidden: isLivePreview }}>
            <textarea
              spellcheck={false}
              value={markdownSignal.value}
              class={{ "code-mode": viewMode.value === "source" }}
              placeholder="Write your Diaryx note here..."
              onInput$={(event) => {
                const target = event.target as HTMLTextAreaElement;
                markdownSignal.value = target.value;
                note.body = target.value;
                stampNoteUpdated(note);
              }}
            />
          </div>
        )}
        {showPreviewPane && (
          <div
            class={{
              "preview-pane": true,
              readonly: viewMode.value === "preview" || viewMode.value === "live",
              interactive: isLivePreview,
            }}
            dangerouslySetInnerHTML={htmlSignal.value}
          />
        )}
      </div>
    </section>
  );
});
