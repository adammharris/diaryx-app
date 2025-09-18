import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import { stampNoteUpdated } from "../lib/diaryx/note-utils";
import { CodeMirrorEditor } from "./codemirror-editor";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";
import { renderMarkdownToHtml } from "../lib/markdown/renderer";


export const NoteEditor = component$(() => {
  const session = useDiaryxSession();
  const markdownSignal = useSignal("");
  const htmlSignal = useSignal("");
  const viewMode = useSignal(session.ui.editorMode);

  useTask$(({ track }) => {
    track(() => session.ui.libraryMode);
    track(() => session.activeNoteId);
    track(() => session.sharedActiveNoteId);
    track(() => session.notes.length);
    track(() => session.sharedNotes.length);
    const libraryMode = session.ui.libraryMode;
    const activeId =
      libraryMode === "shared" ? session.sharedActiveNoteId : session.activeNoteId;
    const collection = libraryMode === "shared" ? session.sharedNotes : session.notes;
    const note = collection.find((item) => item.id === activeId);
    markdownSignal.value = note?.body ?? "";
    htmlSignal.value = note ? renderMarkdownToHtml(note.body) : "";
  });

  useTask$(({ track }) => {
    const text = track(() => markdownSignal.value);
    htmlSignal.value = renderMarkdownToHtml(text);
  });

  useTask$(({ track }) => {
    const libraryMode = track(() => session.ui.libraryMode);
    if (libraryMode === "shared") {
      if (viewMode.value !== "preview") {
        viewMode.value = "preview";
      }
      return;
    }
    const mode = track(() => session.ui.editorMode);
    if (viewMode.value !== mode) {
      viewMode.value = mode;
    }
  });

  const libraryMode = session.ui.libraryMode;
  const isSharedView = libraryMode === "shared";
  const activeId = isSharedView ? session.sharedActiveNoteId : session.activeNoteId;
  const collection = isSharedView ? session.sharedNotes : session.notes;
  const note = collection.find((item) => item.id === activeId);

  if (!activeId) {
    return (
      <section class="note-editor empty">
        <p>{isSharedView ? "Select a shared note to view." : "Select or create a note to begin."}</p>
      </section>
    );
  }

  if (!note) {
    return (
      <section class="note-editor empty">
        <p>{isSharedView ? "Shared note not available." : "Note not found."}</p>
      </section>
    );
  }

  const isLivePreview = !isSharedView && viewMode.value === "live";
  const showEditorPane = !isSharedView && viewMode.value !== "preview";
  const showPreviewPane = isSharedView || viewMode.value === "split" || viewMode.value === "preview";

  return (
    <section class="note-editor" data-mode={viewMode.value} data-shared={isSharedView ? "true" : undefined}>
      <header class="editor-toolbar">
        <div class="editor-summary">
          <span class="note-title" title={note.metadata.title}>
            {note.metadata.title || "Untitled"}
          </span>
          <span class="note-updated">
            {isSharedView ? "Shared note" : `Updated ${note.metadata.updated}`}
          </span>
        </div>
        <div class="toolbar-groups">
          {isSharedView ? (
            <span class="view-select" aria-live="polite">
              Preview only
            </span>
          ) : (
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
          )}
        </div>
      </header>
      <div class="editor-panes">
        {showEditorPane && (
          <div class={{ "editor-pane": true, live: isLivePreview }}>
            <CodeMirrorEditor
              value={markdownSignal.value}
              variant={isLivePreview ? "live" : "default"}
              onChange$={(next: string) => {
                if (note.body === next) {
                  return;
                }
                markdownSignal.value = next;
                note.body = next;
                stampNoteUpdated(note);
              }}
            />
          </div>
        )}
        {showPreviewPane && (
          <div
            class={{
              "preview-pane": true,
              readonly: isSharedView || viewMode.value === "preview",
            }}
            dangerouslySetInnerHTML={htmlSignal.value}
          />
        )}
      </div>
    </section>
  );
});
