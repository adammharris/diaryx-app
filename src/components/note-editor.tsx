import {
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@builder.io/qwik";
import { stampNoteUpdated } from "../lib/diaryx/note-utils";
import { CodeMirrorEditor } from "./codemirror-editor";
import { ProseMirrorEditor } from "./prosemirror-editor";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";
import { renderMarkdownToHtml } from "../lib/markdown/renderer";

export const NoteEditor = component$(() => {
  const session = useDiaryxSession();
  const markdownSignal = useSignal("");
  const htmlSignal = useSignal("");
  const viewMode = useSignal(session.ui.editorMode);
  const libraryToggleRef = useSignal<HTMLButtonElement>();
  const metadataToggleRef = useSignal<HTMLButtonElement>();
  const libraryWasOpen = useSignal(session.ui.showLibrary);
  const metadataWasOpen = useSignal(session.ui.showMetadata);
  const activeNoteDirty = useSignal(false);

  useTask$(({ track }) => {
    track(() => session.ui.libraryMode);
    track(() => session.activeNoteId);
    track(() => session.sharedActiveNoteId);
    track(() => session.notes.length);
    track(() => session.sharedNotes.length);
    const libraryMode = session.ui.libraryMode;
    const activeId =
      libraryMode === "shared"
        ? session.sharedActiveNoteId
        : session.activeNoteId;
    const collection =
      libraryMode === "shared" ? session.sharedNotes : session.notes;
    const note = collection.find((item) => item.id === activeId);
    markdownSignal.value = note?.body ?? "";
    htmlSignal.value = note ? renderMarkdownToHtml(note.body) : "";
    activeNoteDirty.value = false;
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

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ track }) => {
      track(() => session.ui.showLibrary);
      const wasOpen = libraryWasOpen.value;
      const isOpen = session.ui.showLibrary;
      libraryWasOpen.value = isOpen;
      if (!wasOpen || isOpen) return;
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      libraryToggleRef.value?.focus();
    },
    { strategy: "document-ready" },
  );

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ track }) => {
      track(() => session.ui.showMetadata);
      const wasOpen = metadataWasOpen.value;
      const isOpen = session.ui.showMetadata;
      metadataWasOpen.value = isOpen;
      if (!wasOpen || isOpen) return;
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      metadataToggleRef.value?.focus();
    },
    { strategy: "document-ready" },
  );

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    cleanup(() => {
      session.ui.editorHasFocus = false;
    });
  });

  const libraryMode = session.ui.libraryMode;
  const isSharedView = libraryMode === "shared";
  const activeId = isSharedView
    ? session.sharedActiveNoteId
    : session.activeNoteId;
  const collection = isSharedView ? session.sharedNotes : session.notes;
  const note = collection.find((item) => item.id === activeId);

  if (!activeId) {
    return (
      <section class="note-editor empty">
        <p>
          {isSharedView
            ? "Select a shared note to view."
            : "Select or create a note to begin."}
        </p>
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
  const showPreviewPane =
    isSharedView || viewMode.value === "split" || viewMode.value === "preview";

  if (!showEditorPane && session.ui.editorHasFocus) {
    session.ui.editorHasFocus = false;
  }

  return (
    <section
      class="note-editor"
      data-mode={viewMode.value}
      data-shared={isSharedView ? "true" : undefined}
    >
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
          <div class="mobile-drawer-toggles">
            <button
              type="button"
              class="mobile-drawer-toggle left"
              aria-label="Open notes"
              aria-controls="library-drawer"
              aria-expanded={session.ui.showLibrary ? "true" : "false"}
              ref={libraryToggleRef}
              onClick$={() => {
                if (session.ui.showLibrary) {
                  session.ui.showLibrary = false;
                  return;
                }
                session.ui.showLibrary = true;
                session.ui.showMetadata = false;
              }}
            >
              Notes
            </button>
            <button
              type="button"
              class="mobile-drawer-toggle right"
              aria-label="Open info"
              aria-controls="metadata-drawer"
              aria-expanded={session.ui.showMetadata ? "true" : "false"}
              ref={metadataToggleRef}
              onClick$={() => {
                if (session.ui.showMetadata) {
                  session.ui.showMetadata = false;
                  return;
                }
                session.ui.showMetadata = true;
                session.ui.showLibrary = false;
              }}
            >
              Info
            </button>
          </div>
        </div>
      </header>
      <div class="editor-panes">
        {showEditorPane && (
          <div class={{ "editor-pane": true, live: isLivePreview }}>
            {isLivePreview ? (
              <ProseMirrorEditor
                value={markdownSignal.value}
                variant="live"
                onChange$={(next: string) => {
                  if (note.body === next) {
                    return;
                  }
                  markdownSignal.value = next;
                  note.body = next;
                  activeNoteDirty.value = true;
                }}
                onFocus$={() => {
                  session.ui.editorHasFocus = true;
                }}
                onBlur$={() => {
                  session.ui.editorHasFocus = false;
                  if (activeNoteDirty.value) {
                    stampNoteUpdated(note);
                    activeNoteDirty.value = false;
                  }
                }}
              />
            ) : (
              <CodeMirrorEditor
                value={markdownSignal.value}
                variant="default"
                onChange$={(next: string) => {
                  if (note.body === next) {
                    return;
                  }
                  markdownSignal.value = next;
                  note.body = next;
                  activeNoteDirty.value = true;
                }}
                onFocus$={() => {
                  session.ui.editorHasFocus = true;
                }}
                onBlur$={() => {
                  session.ui.editorHasFocus = false;
                  if (activeNoteDirty.value) {
                    stampNoteUpdated(note);
                    activeNoteDirty.value = false;
                  }
                }}
              />
            )}
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
