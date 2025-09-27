import {
  $,
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
  useOnDocument,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { MetadataPanel } from "../components/metadata-panel";
import { NoteEditor } from "../components/note-editor";
import { NoteList } from "../components/note-list";
import { getAuthClient, hasAuthClient } from "../lib/auth-client";
import { createDiaryxRepository } from "../lib/persistence/diaryx-repository";
import {
  loadMarkdownNotes,
  persistMarkdownNotes,
  clearMarkdownNotes,
} from "../lib/persistence/markdown-store";
import { useDiaryxSessionProvider } from "../lib/state/use-diaryx-session";
import type { ThemePreference, ColorAccent } from "../lib/state/diaryx-context";
import type { DiaryxNote } from "../lib/diaryx/types";
import { syncNotesWithServer } from "../lib/sync/note-sync";
import { apiFetch } from "../lib/api/http";

const ACCENT_VALUES: readonly ColorAccent[] = [
  "violet",
  "blue",
  "teal",
  "amber",
];
const isValidAccent = (value: string | null): value is ColorAccent =>
  value !== null && ACCENT_VALUES.includes(value as ColorAccent);

const toVisibilityArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item.trim() : String(item).trim(),
      )
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  return [];
};

const HANDLE_WIDTH = 16;
const MIN_EDITOR_WIDTH = 420;
const MIN_PANEL_WIDTH = 180;
const SNAP_THRESHOLD = 32;
const DEFAULT_LEFT_PANEL_WIDTH = 260;
const DEFAULT_RIGHT_PANEL_WIDTH = 300;

export default component$(() => {
  const session = useDiaryxSessionProvider();
  const shellRef = useSignal<HTMLDivElement>();
  const notesHydrated = useSignal(false);
  const currentUserId = useSignal<string | null>(null);
  const isSyncing = useSignal(false);
  const isMobile = useSignal(false);
  const lastDesktopLeftWidth = useSignal(
    session.ui.leftPanelWidth || DEFAULT_LEFT_PANEL_WIDTH,
  );
  const lastDesktopRightWidth = useSignal(
    session.ui.rightPanelWidth || DEFAULT_RIGHT_PANEL_WIDTH,
  );
  const pendingAutosave = useSignal(false);

  useTask$(({ cleanup }) => {
    if (typeof window === "undefined") {
      return;
    }

    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    const preventGesture = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("wheel", preventWheelZoom, { passive: false });
    window.addEventListener("touchmove", preventMultiTouch, { passive: false });
    window.addEventListener("gesturestart", preventGesture, { passive: false });
    window.addEventListener("gesturechange", preventGesture, { passive: false });
    window.addEventListener("gestureend", preventGesture, { passive: false });

    cleanup(() => {
      window.removeEventListener("wheel", preventWheelZoom);
      window.removeEventListener("touchmove", preventMultiTouch);
      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("gestureend", preventGesture);
    });
  });

  const clampWidths = $(() => {
    const shell = shellRef.value;
    if (!shell) return;
    const total = shell.getBoundingClientRect().width;
    const maxLeft = Math.max(
      0,
      total - session.ui.rightPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2,
    );
    if (session.ui.leftPanelWidth > maxLeft) {
      session.ui.leftPanelWidth = Math.max(0, maxLeft);
      session.ui.showLibrary = session.ui.leftPanelWidth > SNAP_THRESHOLD;
    }
    const maxRight = Math.max(
      0,
      total - session.ui.leftPanelWidth - MIN_EDITOR_WIDTH - HANDLE_WIDTH * 2,
    );
    if (session.ui.rightPanelWidth > maxRight) {
      session.ui.rightPanelWidth = Math.max(0, maxRight);
      session.ui.showMetadata = session.ui.rightPanelWidth > SNAP_THRESHOLD;
    }
  });

  const beginLeftDrag = $((event: PointerEvent) => {
    const shell = shellRef.value;
    if (!shell) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId,
    );
    const rect = shell.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = session.ui.leftPanelWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - startX;
      const maxWidth = Math.max(
        0,
        rect.width -
          session.ui.rightPanelWidth -
          MIN_EDITOR_WIDTH -
          HANDLE_WIDTH * 2,
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
          rect.width -
            session.ui.rightPanelWidth -
            MIN_EDITOR_WIDTH -
            HANDLE_WIDTH * 2,
        );
        session.ui.leftPanelWidth = Math.min(
          Math.max(session.ui.leftPanelWidth, MIN_PANEL_WIDTH),
          maxWidth,
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
      { once: true },
    );
  });

  const beginRightDrag = $((event: PointerEvent) => {
    const shell = shellRef.value;
    if (!shell) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId,
    );
    const rect = shell.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = session.ui.rightPanelWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const delta = startX - moveEvent.clientX;
      const maxWidth = Math.max(
        0,
        rect.width -
          session.ui.leftPanelWidth -
          MIN_EDITOR_WIDTH -
          HANDLE_WIDTH * 2,
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
          rect.width -
            session.ui.leftPanelWidth -
            MIN_EDITOR_WIDTH -
            HANDLE_WIDTH * 2,
        );
        session.ui.rightPanelWidth = Math.min(
          Math.max(session.ui.rightPanelWidth, MIN_PANEL_WIDTH),
          maxWidth,
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
      { once: true },
    );
  });

  useTask$(() => {
    if (typeof window !== "undefined") {
      if (window.innerWidth < 900) {
        if (session.ui.leftPanelWidth > 0) {
          lastDesktopLeftWidth.value = session.ui.leftPanelWidth;
        }
        if (session.ui.rightPanelWidth > 0) {
          lastDesktopRightWidth.value = session.ui.rightPanelWidth;
        }
        session.ui.leftPanelWidth = 0;
        session.ui.rightPanelWidth = 0;
        session.ui.showLibrary = false;
        session.ui.showMetadata = false;
      } else {
        if (session.ui.leftPanelWidth <= 0) {
          session.ui.leftPanelWidth =
            lastDesktopLeftWidth.value || DEFAULT_LEFT_PANEL_WIDTH;
        }
        if (session.ui.rightPanelWidth <= 0) {
          session.ui.rightPanelWidth =
            lastDesktopRightWidth.value || DEFAULT_RIGHT_PANEL_WIDTH;
        }
        session.ui.showLibrary = true;
        session.ui.showMetadata = true;
      }
    }
    clampWidths();
  });

  useTask$(({ cleanup }) => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => {
      isMobile.value = media.matches;
    };
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      cleanup(() => media.removeEventListener("change", update));
    } else {
      media.addListener(update);
      cleanup(() => media.removeListener(update));
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    () => {
      if (typeof window === "undefined") return;
      const storedTheme = window.localStorage.getItem(
        "diaryx.theme",
      ) as ThemePreference | null;
      if (
        storedTheme === "light" ||
        storedTheme === "dark" ||
        storedTheme === "system"
      ) {
        session.ui.theme = storedTheme;
      }
      const storedAccent = window.localStorage.getItem("diaryx.accent");
      if (isValidAccent(storedAccent)) {
        session.ui.accent = storedAccent;
      }
      const storedEditorMode = window.localStorage.getItem("diaryx.editorMode");
      if (
        storedEditorMode === "split" ||
        storedEditorMode === "source" ||
        storedEditorMode === "preview" ||
        storedEditorMode === "live"
      ) {
        session.ui.editorMode =
          storedEditorMode as typeof session.ui.editorMode;
      }
    },
    { strategy: "document-ready" },
  );

  useTask$(({ track }) => {
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

  useTask$(({ track }) => {
    track(() => session.ui.accent);
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const accent = session.ui.accent;
    root.setAttribute("data-accent", accent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("diaryx.accent", accent);
    }
  });

  useTask$(({ track }) => {
    track(() => session.ui.editorMode);
    track(() => session.ui.libraryMode);
    if (typeof window === "undefined") return;
    if (session.ui.libraryMode !== "shared") {
      window.localStorage.setItem("diaryx.editorMode", session.ui.editorMode);
    }
  });

  useTask$(({ track }) => {
    const mobile = track(() => isMobile.value);
    if (typeof window === "undefined") return;
    if (mobile) {
      if (session.ui.leftPanelWidth > 0) {
        lastDesktopLeftWidth.value = session.ui.leftPanelWidth;
      }
      if (session.ui.rightPanelWidth > 0) {
        lastDesktopRightWidth.value = session.ui.rightPanelWidth;
      }
      session.ui.leftPanelWidth = 0;
      session.ui.rightPanelWidth = 0;
      session.ui.showLibrary = false;
      session.ui.showMetadata = false;
    } else {
      const leftWidth = lastDesktopLeftWidth.value || DEFAULT_LEFT_PANEL_WIDTH;
      const rightWidth =
        lastDesktopRightWidth.value || DEFAULT_RIGHT_PANEL_WIDTH;
      session.ui.leftPanelWidth = leftWidth;
      session.ui.rightPanelWidth = rightWidth;
      session.ui.showLibrary = leftWidth > SNAP_THRESHOLD;
      session.ui.showMetadata = rightWidth > SNAP_THRESHOLD;
    }
  });

  useTask$(({ track }) => {
    const mobile = track(() => isMobile.value);
    const libraryOpen = track(() => session.ui.showLibrary);
    if (typeof window === "undefined") return;
    if (!mobile) return;
    if (libraryOpen) {
      session.ui.showMetadata = false;
    }
  });

  useTask$(({ track }) => {
    const mobile = track(() => isMobile.value);
    const metadataOpen = track(() => session.ui.showMetadata);
    if (typeof window === "undefined") return;
    if (!mobile) return;
    if (metadataOpen) {
      session.ui.showLibrary = false;
    }
  });

  useTask$(({ track }) => {
    const mobile = track(() => isMobile.value);
    const leftWidth = track(() => session.ui.leftPanelWidth);
    if (typeof window === "undefined") return;
    if (!mobile && leftWidth > 0) {
      lastDesktopLeftWidth.value = leftWidth;
    }
  });

  useTask$(({ track }) => {
    const mobile = track(() => isMobile.value);
    const rightWidth = track(() => session.ui.rightPanelWidth);
    if (typeof window === "undefined") return;
    if (!mobile && rightWidth > 0) {
      lastDesktopRightWidth.value = rightWidth;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    async () => {
      const repo = createDiaryxRepository();
      let notes = await repo.loadAll();
      if (!notes.length) {
        notes = loadMarkdownNotes();
      }
      if (notes.length) {
        session.notes.splice(0, session.notes.length, ...notes);
        session.activeNoteId = notes[0]?.id;
      }
      notesHydrated.value = true;
    },
    { strategy: "document-ready" },
  );

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    async () => {
      if (!hasAuthClient()) return;
      const client = await getAuthClient();

      // Proactively hydrate the session from the server to ensure the client store is up-to-date
      try {
        console.debug("[auth] hydrating session via getSession()");
        const sessionRes = await client.getSession({
          fetchOptions: { credentials: "include" },
        });
        const hydratedUserId = (sessionRes as any)?.data?.user?.id ?? null;
        if (hydratedUserId && currentUserId.value !== hydratedUserId) {
          currentUserId.value = hydratedUserId;
          console.debug("[auth] set userId from getSession:", hydratedUserId);
        }
        console.debug("[auth] hydrate complete");
      } catch (e) {
        console.warn("[auth] getSession failed", e);
      }

      const store = client.useSession;
      const initial = store.get();
      const initialUserId = initial?.data?.user?.id ?? null;
      console.debug(
        "[auth] initial useSession value:",
        initial,
        "userId:",
        initialUserId,
      );
      currentUserId.value = initialUserId;
      if (!currentUserId.value) {
        try {
          console.debug("[auth] fallback /api/auth/get-session");
          const res = await apiFetch("/api/auth/get-session", {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            const uid =
              (data as any)?.data?.user?.id ?? (data as any)?.user?.id ?? null;
            if (uid) {
              currentUserId.value = uid;
              console.debug("[auth] set userId from fallback:", uid);
            }
          } else {
            console.warn("[auth] fallback get-session non-OK", res.status);
          }
        } catch (err) {
          console.warn("[auth] fallback get-session failed", err);
        }
      }

      const unsubscribe = store.subscribe((value) => {
        const nextValue = value as typeof initial;
        const userId = nextValue?.data?.user?.id ?? null;
        if (currentUserId.value !== userId) {
          console.debug(
            "[auth] userId changed:",
            currentUserId.value,
            "->",
            userId,
            "value:",
            nextValue,
          );
          currentUserId.value = userId;
        }
      });
      return () => unsubscribe();
    },
    { strategy: "document-ready" },
  );

  useTask$(async ({ track }) => {
    track(() => session.notes.length);
    track(() => session.notes.map((note) => note.lastModified));
    const hasFocus = track(() => session.ui.editorHasFocus);
    if (!notesHydrated.value) return;

    if (!session.notes.length) {
      clearMarkdownNotes();
      persistNotesToRepositorySync(session.notes);
      session.sharedVisibilityEmails = computeSharedVisibilityEmails(
        session.notes,
      );
      pendingAutosave.value = false;
      return;
    }

    if (hasFocus) {
      pendingAutosave.value = true;
      return;
    }

    persistMarkdownNotes(session.notes);
    const repo = createDiaryxRepository();
    await Promise.all(session.notes.map((note) => repo.save(note)));
    session.sharedVisibilityEmails = computeSharedVisibilityEmails(
      session.notes,
    );
    pendingAutosave.value = false;
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if (typeof window === "undefined") {
      return;
    }

    const runSynchronousFlush = () => {
      if (!notesHydrated.value) return;
      if (!session.notes.length) {
        clearMarkdownNotes();
        persistNotesToRepositorySync(session.notes);
      } else {
        persistMarkdownNotes(session.notes);
        persistNotesToRepositorySync(session.notes);
      }
      session.sharedVisibilityEmails = computeSharedVisibilityEmails(
        session.notes,
      );
      pendingAutosave.value = false;
    };

    const flushIfNeeded = () => {
      if (!notesHydrated.value) return;
      if (!pendingAutosave.value && !session.ui.editorHasFocus) return;
      runSynchronousFlush();
    };

    const onBeforeUnload = () => {
      flushIfNeeded();
    };

    const onPageHide = (event: Event) => {
      const pageEvent = event as { persisted?: boolean };
      if (pageEvent?.persisted) {
        return;
      }
      flushIfNeeded();
    };

    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        flushIfNeeded();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    cleanup(() => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      flushIfNeeded();
    });
  });

  useTask$(({ track, cleanup }) => {
    track(() => session.notes.length);
    track(() => session.notes.map((note) => note.lastModified));
    track(() => currentUserId.value);
    track(() => notesHydrated.value);

    if (!notesHydrated.value) {
      console.debug("[sync] skip: notes not hydrated yet");
      return;
    }

    const userId = currentUserId.value;
    if (!userId) {
      console.debug("[sync] skip: no user id");
      return;
    }

    let cancelled = false;
    console.debug("[sync] scheduling in 750ms; notes:", session.notes.length);
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        console.debug("[sync] begin syncNotesWithServer");
        isSyncing.value = true;
        await syncNotesWithServer(session);
        console.debug("[sync] completed");
      } catch (error) {
        console.warn("Note sync failed", error);
      } finally {
        isSyncing.value = false;
      }
    }, 750);

    cleanup(() => {
      cancelled = true;
      clearTimeout(timer);
    });
  });

  useTask$(() => {
    if (typeof window === "undefined") return;
    const adjust = () => {
      clampWidths();
    };
    window.addEventListener("resize", adjust);
    clampWidths();
    return () => window.removeEventListener("resize", adjust);
  });

  useTask$(({ track, cleanup }) => {
    track(() => isMobile.value);
    track(() => session.ui.showLibrary);
    track(() => session.ui.showMetadata);
    if (typeof document === "undefined") return;
    const mobileActive = isMobile.value;
    const drawerOpen = session.ui.showLibrary || session.ui.showMetadata;
    if (!mobileActive || !drawerOpen) {
      document.body.removeAttribute("data-drawer-open");
      document.body.style.removeProperty("overflow");
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        session.ui.showLibrary = false;
        session.ui.showMetadata = false;
      }
    };

    document.body.setAttribute("data-drawer-open", "true");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeydown);
    // Click-away handled via useOnDocument('click')

    cleanup(() => {
      document.removeEventListener("keydown", handleKeydown);
      // Click-away handled via useOnDocument('click')
      document.body.style.overflow = previousOverflow;
      document.body.removeAttribute("data-drawer-open");
    });
  });

  // Refresh auth session when tab becomes visible (ensures currentUserId is set)
  useOnDocument(
    "visibilitychange",
    $(async () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!hasAuthClient()) return;
      try {
        const client = await getAuthClient();
        await client.getSession({ fetchOptions: { credentials: "include" } });
        const value = client.useSession.get();
        const uid = value?.data?.user?.id ?? null;
        if (uid && currentUserId.value !== uid) {
          console.debug("[auth] visibility refresh userId:", uid);
          currentUserId.value = uid;
        }
      } catch (e) {
        console.warn("[auth] visibility getSession failed", e);
      }
    }),
  );

  // Global click-away for mobile drawers using Qwik's document listener
  useOnDocument(
    "click",
    $((event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // Only handle on mobile viewport and when a drawer is open
      if (
        typeof window !== "undefined" &&
        !window.matchMedia("(max-width: 900px)").matches
      )
        return;
      if (!(session.ui.showLibrary || session.ui.showMetadata)) return;

      const insideLibrary = !!target.closest("#library-drawer");
      const insideMetadata = !!target.closest("#metadata-drawer");
      const onToggle =
        !!target.closest('[aria-controls="library-drawer"]') ||
        !!target.closest('[aria-controls="metadata-drawer"]');

      if (insideLibrary || insideMetadata || onToggle) return;

      session.ui.showLibrary = false;
      session.ui.showMetadata = false;
    }),
  );
  useOnDocument(
    "pointerdown",
    $((event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // Only handle on mobile viewport and when a drawer is open
      if (
        typeof window !== "undefined" &&
        !window.matchMedia("(max-width: 900px)").matches
      )
        return;
      if (!(session.ui.showLibrary || session.ui.showMetadata)) return;

      const insideLibrary = !!target.closest("#library-drawer");
      const insideMetadata = !!target.closest("#metadata-drawer");
      const onToggle =
        !!target.closest('[aria-controls="library-drawer"]') ||
        !!target.closest('[aria-controls="metadata-drawer"]');

      if (insideLibrary || insideMetadata || onToggle) return;

      session.ui.showLibrary = false;
      session.ui.showMetadata = false;
    }),
  );

  const leftWidth = Math.max(session.ui.leftPanelWidth, 0);
  const rightWidth = Math.max(session.ui.rightPanelWidth, 0);
  const gridTemplate = `${leftWidth}px ${HANDLE_WIDTH}px minmax(${MIN_EDITOR_WIDTH}px, 1fr) ${HANDLE_WIDTH}px ${rightWidth}px`;

  const drawerOpen = session.ui.showLibrary || session.ui.showMetadata;
  const shellStyle = isMobile.value
    ? undefined
    : { gridTemplateColumns: gridTemplate };

  return (
    <div
      class="app-shell"
      ref={shellRef}
      style={shellStyle}
      onClick$={$((event) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (!isMobile.value) return;
        if (!(session.ui.showLibrary || session.ui.showMetadata)) return;
        const insideLibrary = !!target.closest("#library-drawer");
        const insideMetadata = !!target.closest("#metadata-drawer");
        const onToggle =
          !!target.closest('[aria-controls="library-drawer"]') ||
          !!target.closest('[aria-controls="metadata-drawer"]');
        if (insideLibrary || insideMetadata || onToggle) return;
        session.ui.showLibrary = false;
        session.ui.showMetadata = false;
      })}
    >
      <NoteList />
      <button
        type="button"
        class={{
          "panel-handle": true,
          collapsed: session.ui.leftPanelWidth === 0,
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize library panel"
        onPointerDown$={beginLeftDrag}
      />
      <NoteEditor />
      <button
        type="button"
        class={{
          "panel-handle": true,
          collapsed: session.ui.rightPanelWidth === 0,
        }}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize info panel"
        onPointerDown$={beginRightDrag}
      />
      <MetadataPanel />
      <div
        class="drawer-backdrop"
        data-open={isMobile.value && drawerOpen ? "true" : undefined}
        onClick$={() => {
          session.ui.showLibrary = false;
          session.ui.showMetadata = false;
        }}
      />
    </div>
  );
});

const computeSharedVisibilityEmails = (notes: DiaryxNote[]) => {
  if (!notes.length) {
    return {} as Record<string, string[]>;
  }

  const aggregated = new Map<string, Set<string>>();
  for (const item of notes) {
    const terms = toVisibilityArray(item.metadata.visibility);
    const emailsMap =
      (item.metadata.visibility_emails as Record<string, string[]>) ?? {};
    for (const term of terms) {
      const normalizedTerm = term.trim();
      if (!normalizedTerm) continue;
      const existing = aggregated.get(normalizedTerm) ?? new Set<string>();
      const emails = emailsMap[normalizedTerm] ?? [];
      for (const email of emails) {
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail) {
          existing.add(normalizedEmail);
        }
      }
      aggregated.set(normalizedTerm, existing);
    }
  }

  return Object.fromEntries(
    Array.from(aggregated.entries()).map(([term, emails]) => [
      term,
      Array.from(emails.values()),
    ]),
  );
};

const persistNotesToRepositorySync = (notes: DiaryxNote[]) => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }

  const storage = window.localStorage;
  const indexKey = "diaryx.notes.index";
  const noteKeyPrefix = "diaryx.note:";

  let previousIds: string[] = [];
  try {
    const rawIndex = storage.getItem(indexKey);
    if (rawIndex) {
      const parsed = JSON.parse(rawIndex);
      if (Array.isArray(parsed)) {
        previousIds = parsed as string[];
      }
    }
  } catch (error) {
    console.warn("Failed to read note index for synchronous persist", error);
  }

  const nextIds = notes.map((note) => note.id);
  const nextIdSet = new Set(nextIds);

  for (const id of previousIds) {
    if (!nextIdSet.has(id)) {
      try {
        storage.removeItem(`${noteKeyPrefix}${id}`);
      } catch (error) {
        console.warn(`Failed to remove note ${id} during synchronous persist`, error);
      }
    }
  }

  try {
    if (nextIds.length) {
      storage.setItem(indexKey, JSON.stringify(nextIds));
    } else {
      storage.removeItem(indexKey);
    }
  } catch (error) {
    console.warn("Failed to persist note index synchronously", error);
  }

  for (const note of notes) {
    try {
      storage.setItem(`${noteKeyPrefix}${note.id}`, JSON.stringify(note));
    } catch (error) {
      console.warn(`Failed to persist note ${note.id} synchronously`, error);
    }
  }
};

export const head: DocumentHead = {
  title: "Diaryx Studio",
  meta: [
    {
      name: "description",
      content: "Craft Diaryx-compliant notes with metadata-first workflows.",
    },
  ],
};

export const config = {
  runtime: "nodejs22.x",
};
