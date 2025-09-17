import { $, component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { MetadataPanel } from "../components/metadata-panel";
import { NoteEditor } from "../components/note-editor";
import { NoteList } from "../components/note-list";
import { createDiaryxRepository } from "../lib/persistence/diaryx-repository";
import { useDiaryxSessionProvider } from "../lib/state/use-diaryx-session";
import type { ThemePreference, ColorAccent } from "../lib/state/diaryx-context";

const ACCENT_VALUES: readonly ColorAccent[] = ["violet", "blue", "teal", "amber"];
const isValidAccent = (value: string | null): value is ColorAccent =>
  value !== null && ACCENT_VALUES.includes(value as ColorAccent);

const HANDLE_WIDTH = 16;
const MIN_EDITOR_WIDTH = 420;
const MIN_PANEL_WIDTH = 180;
const SNAP_THRESHOLD = 32;

export default component$(() => {
  const session = useDiaryxSessionProvider();
  const shellRef = useSignal<HTMLDivElement>();

  const clampWidths = $(
    () => {
      const shell = shellRef.value;
      if (!shell) return;
      const total = shell.getBoundingClientRect().width;
      const maxLeft = Math.max(
        0,
        total - session.ui.rightPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2
      );
      if (session.ui.leftPanelWidth > maxLeft) {
        session.ui.leftPanelWidth = Math.max(0, maxLeft);
        session.ui.showLibrary = session.ui.leftPanelWidth > SNAP_THRESHOLD;
      }
      const maxRight = Math.max(
        0,
        total - session.ui.leftPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2
      );
      if (session.ui.rightPanelWidth > maxRight) {
        session.ui.rightPanelWidth = Math.max(0, maxRight);
        session.ui.showMetadata = session.ui.rightPanelWidth > SNAP_THRESHOLD;
      }
    }
  );

  const beginLeftDrag = $((event: PointerEvent) => {
    const shell = shellRef.value;
    if (!shell) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId
    );
    const rect = shell.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = session.ui.leftPanelWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - startX;
      const maxWidth = Math.max(
        0,
        rect.width - session.ui.rightPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2
      );
      let newWidth = startWidth + delta;
      newWidth = Math.min(Math.max(newWidth, 0), maxWidth);
      session.ui.leftPanelWidth = newWidth;
      session.ui.showLibrary = newWidth > SNAP_THRESHOLD;
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      if (session.ui.leftPanelWidth <= SNAP_THRESHOLD / 2) {
        session.ui.leftPanelWidth = 0;
        session.ui.showLibrary = false;
      } else if (session.ui.leftPanelWidth < MIN_PANEL_WIDTH) {
        const maxWidth = Math.max(
          0,
          rect.width - session.ui.rightPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2
        );
        session.ui.leftPanelWidth = Math.min(
          Math.max(session.ui.leftPanelWidth, MIN_PANEL_WIDTH),
          maxWidth
        );
        session.ui.showLibrary = true;
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener(
      "pointerup",
      () => {
        handleUp();
      },
      { once: true }
    );
  });

  const beginRightDrag = $((event: PointerEvent) => {
    const shell = shellRef.value;
    if (!shell) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId
    );
    const rect = shell.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = session.ui.rightPanelWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const delta = startX - moveEvent.clientX;
      const maxWidth = Math.max(
        0,
        rect.width - session.ui.leftPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2
      );
      let newWidth = startWidth + delta;
      newWidth = Math.min(Math.max(newWidth, 0), maxWidth);
      session.ui.rightPanelWidth = newWidth;
      session.ui.showMetadata = newWidth > SNAP_THRESHOLD;
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      if (session.ui.rightPanelWidth <= SNAP_THRESHOLD / 2) {
        session.ui.rightPanelWidth = 0;
        session.ui.showMetadata = false;
      } else if (session.ui.rightPanelWidth < MIN_PANEL_WIDTH) {
        const maxWidth = Math.max(
          0,
          rect.width - session.ui.leftPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2
        );
        session.ui.rightPanelWidth = Math.min(
          Math.max(session.ui.rightPanelWidth, MIN_PANEL_WIDTH),
          maxWidth
        );
        session.ui.showMetadata = true;
      }
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener(
      "pointerup",
      () => {
        handleUp();
      },
      { once: true }
    );
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (globalThis.window && window.innerWidth < 900) {
      session.ui.showLibrary = false;
      session.ui.leftPanelWidth = 0;
      session.ui.showMetadata = false;
      session.ui.rightPanelWidth = 0;
    }
    clampWidths();
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem("diaryx.theme") as
      | ThemePreference
      | null;
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      session.ui.theme = storedTheme;
    }
    const storedAccent = window.localStorage.getItem("diaryx.accent");
    if (isValidAccent(storedAccent)) {
      session.ui.accent = storedAccent;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => session.ui.theme);
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const theme = session.ui.theme;
    if (theme === "system") {
      root.removeAttribute("data-theme");
      root.style.removeProperty("color-scheme");
    } else {
      root.setAttribute("data-theme", theme);
      root.style.colorScheme = theme;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("diaryx.theme", theme);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => session.ui.accent);
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const accent = session.ui.accent;
    root.setAttribute("data-accent", accent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("diaryx.accent", accent);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    const repo = createDiaryxRepository();
    const notes = await repo.loadAll();
    if (notes.length) {
      session.notes.splice(0, session.notes.length, ...notes);
      session.activeNoteId = notes[0]?.id;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => session.notes.map((note) => note.lastModified));
    if (!session.notes.length) return;
    const repo = createDiaryxRepository();
    await Promise.all(session.notes.map((note) => repo.save(note)));
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const adjust = () => {
      clampWidths();
    };
    window.addEventListener("resize", adjust);
    clampWidths();
    return () => window.removeEventListener("resize", adjust);
  });

  const leftWidth = Math.max(session.ui.leftPanelWidth, 0);
  const rightWidth = Math.max(session.ui.rightPanelWidth, 0);
  const gridTemplate = `${leftWidth}px ${HANDLE_WIDTH}px minmax(${MIN_EDITOR_WIDTH}px, 1fr) ${HANDLE_WIDTH}px ${rightWidth}px`;

  return (
    <div
      class="app-shell"
      ref={shellRef}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <NoteList />
      <button
        type="button"
        class={{ "panel-handle": true, collapsed: session.ui.leftPanelWidth === 0 }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize library panel"
        onPointerDown$={beginLeftDrag}
      />
      <NoteEditor />
      <button
        type="button"
        class={{ "panel-handle": true, collapsed: session.ui.rightPanelWidth === 0 }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize info panel"
        onPointerDown$={beginRightDrag}
      />
      <MetadataPanel />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Diaryx Studio",
  meta: [
    {
      name: "description",
      content:
        "Craft Diaryx-compliant notes with metadata-first workflows inspired by Bear and Liquid Glass.",
    },
  ],
};
