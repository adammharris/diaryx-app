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

  const showEditorPane = viewMode.value !== "preview";
  const showPreviewPane = viewMode.value !== "source";

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
          <div class="mode-toggle" role="group" aria-label="Editor view modes">
            <button
              type="button"
              class={{ active: viewMode.value === "split" }}
              aria-pressed={viewMode.value === "split" ? "true" : "false"}
              onClick$={() => {
                viewMode.value = "split";
                session.ui.editorMode = "split";
              }}
            >
              Split
            </button>
            <button
              type="button"
              class={{ active: viewMode.value === "source" }}
              aria-pressed={viewMode.value === "source" ? "true" : "false"}
              onClick$={() => {
                viewMode.value = "source";
                session.ui.editorMode = "source";
              }}
            >
              Source
            </button>
            <button
              type="button"
              class={{ active: viewMode.value === "preview" }}
              aria-pressed={viewMode.value === "preview" ? "true" : "false"}
              onClick$={() => {
                viewMode.value = "preview";
                session.ui.editorMode = "preview";
              }}
            >
              Preview
            </button>
          </div>
        </div>
      </header>
      <div class="editor-panes">
        {showEditorPane && (
          <div class="editor-pane">
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
              readonly: viewMode.value === "preview",
            }}
            dangerouslySetInnerHTML={htmlSignal.value}
          />
        )}
      </div>
    </section>
  );
});
