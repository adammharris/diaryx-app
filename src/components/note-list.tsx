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
import type { DiaryxNote } from "../lib/diaryx/types";
import {
  buildDiaryxNoteTree,
  formatDiaryxLink,
  normalizeMetadataList,
} from "../lib/diaryx/note-tree";
import type { DiaryxNoteTreeNode } from "../lib/diaryx/note-tree";
import { stampNoteUpdated, syncNoteFrontmatter } from "../lib/diaryx/note-utils";
import {
  importBatchNotes,
  normalizePath as normalizeImportPath,
} from "../lib/import/batch-import";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const ensureUniqueTitle = (baseTitle: string, existing: Set<string>): string => {
  const normalizedBase = baseTitle.trim() || "Untitled note";
  const baseKey = normalizedBase.toLowerCase();

  if (!existing.has(baseKey)) {
    existing.add(baseKey);
    return normalizedBase;
  }

  let counter = 2;
  while (true) {
    const candidate = `${normalizedBase} ${counter}`.trim();
    const candidateKey = candidate.toLowerCase();
    if (!existing.has(candidateKey)) {
      existing.add(candidateKey);
      return candidate;
    }
    counter += 1;
  }
};

const generateUniqueFileName = (
  baseTitle: string,
  existing: Set<string>,
  extension = ".md"
): string => {
  const baseSlug = slugify(baseTitle) || "note";
  let candidate = `${baseSlug}${extension}`;
  let counter = 2;

  while (existing.has(candidate.toLowerCase())) {
    candidate = `${baseSlug}-${counter}${extension}`;
    counter += 1;
  }

  existing.add(candidate.toLowerCase());
  return candidate;
};

const ensureNoteSourceName = (
  note: DiaryxNote,
  existing: Set<string>,
  fallbackTitle?: string
): string => {
  const current = note.sourceName?.trim();
  if (current) {
    existing.add(current.toLowerCase());
    return current;
  }

  const generated = generateUniqueFileName(
    fallbackTitle ?? note.metadata.title ?? "note",
    existing
  );
  note.sourceName = generated;
  return generated;
};

interface NoteListDisplayItem {
  note: DiaryxNote;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  matchesSearch: boolean;
  descendantMatches: boolean;
}

export const NoteList = component$(() => {
  const session = useDiaryxSession();
  const querySignal = useSignal(session.filters.query);
  const fileInputSignal = useSignal<HTMLInputElement>();
  const folderInputSignal = useSignal<HTMLInputElement>();
  const exportFormatSignal = useSignal("");
  const accountSectionOpen = useSignal(false);
  const displaySectionOpen = useSignal(false);
  const noteListRef = useSignal<HTMLElement>();
  const openMenuId = useSignal<string | undefined>(undefined);

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
      const tree = buildDiaryxNoteTree(session.notes);
      const expanded = { ...session.ui.expandedNotes };
      let current = tree.parentById.get(noteId);
      while (current) {
        expanded[current] = true;
        current = tree.parentById.get(current);
      }
      session.ui.expandedNotes = expanded;
    }
    openMenuId.value = undefined;
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

  const handleToggleExpand = $((noteId: string, event?: Event) => {
    event?.stopPropagation();
    if (session.ui.libraryMode === "shared") {
      return;
    }

    const expandedEntries = session.ui.expandedNotes ?? {};
    const nextExpanded = { ...expandedEntries };
    const tree = buildDiaryxNoteTree(session.notes);
    const node = tree.nodesById.get(noteId);
    const defaultExpanded = node?.note.metadata.this_file_is_root_index === true;
    const explicitState = expandedEntries[noteId];
    const isExpanded =
      explicitState !== undefined ? explicitState : Boolean(defaultExpanded);

    nextExpanded[noteId] = !isExpanded;
    session.ui.expandedNotes = nextExpanded;
  });

  const handleCreateChild = $((parentId: string, event?: Event) => {
    event?.stopPropagation();
    if (session.ui.libraryMode === "shared") {
      return;
    }

    const parent = session.notes.find((note) => note.id === parentId);
    if (!parent) return;

    const existingTitles = new Set<string>();
    for (const note of session.notes) {
      const titleKey = String(note.metadata.title ?? "").trim().toLowerCase();
      if (titleKey) {
        existingTitles.add(titleKey);
      }
    }

    const childTitle = ensureUniqueTitle("Untitled note", existingTitles);

    const existingFileNames = new Set<string>();
    for (const note of session.notes) {
      const source = note.sourceName?.trim();
      if (source) {
        existingFileNames.add(source.toLowerCase());
      }
    }

    const parentLabel = parent.metadata.title?.trim() || "Parent note";
    const parentFileName = ensureNoteSourceName(parent, existingFileNames, parentLabel);
    const childFileName = generateUniqueFileName(childTitle, existingFileNames);

    const childLink = formatDiaryxLink(childTitle, childFileName);
    const parentLink = formatDiaryxLink(parentLabel, parentFileName);

    const contentsList = normalizeMetadataList(
      parent.metadata.contents as string | string[] | undefined
    );
    if (!contentsList.includes(childLink)) {
      contentsList.push(childLink);
    }
    parent.metadata.contents = contentsList;
    stampNoteUpdated(parent);
    syncNoteFrontmatter(parent);

    const newNote = createBlankNote({
      metadata: {
        title: childTitle,
        part_of: parentLink,
      },
      sourceName: childFileName,
    });
    syncNoteFrontmatter(newNote);

    session.notes.unshift(newNote);
    session.activeNoteId = newNote.id;
    session.ui.expandedNotes = {
      ...session.ui.expandedNotes,
      [parentId]: true,
    };

    persistMarkdownNotes(session.notes);
  });

  const handleToggleMenu = $((noteId: string, event?: Event) => {
    event?.stopPropagation();
    if (session.ui.libraryMode === "shared") {
      return;
    }
    openMenuId.value = openMenuId.value === noteId ? undefined : noteId;
  });

  const handleMenuAction = $((
    noteId: string,
    action: "add-child" | "delete",
    event?: Event
  ) => {
    event?.stopPropagation();
    openMenuId.value = undefined;
    if (action === "add-child") {
      handleCreateChild(noteId);
    } else {
      handleDeleteNote(noteId);
    }
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
    session.importState.lastSummary = undefined;
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

  const handleBatchImport = $(async (files: FileList | null) => {
    if (!files?.length) return;
    session.importState.isImporting = true;
    session.importState.lastError = undefined;
    session.importState.lastSummary = undefined;
    try {
      const inputs = Array.from(files)
        .map((file) => ({
          file,
          relativePath:
            (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
            file.name,
        }))
        .filter((item) => Boolean(item.relativePath));

      if (!inputs.length) {
        session.importState.lastError = "Selected folder does not contain Markdown files.";
        return;
      }

      const result = await importBatchNotes(inputs);

      const existingPaths = new Set(
        session.notes
          .map((note) =>
            note.sourceName ? normalizeImportPath(note.sourceName) : undefined
          )
          .filter((value): value is string => Boolean(value))
      );

      const importedNotes: DiaryxNote[] = [];
      const duplicates: string[] = [];

      for (const note of result.notes) {
        const source = note.sourceName
          ? normalizeImportPath(note.sourceName)
          : undefined;
        if (source && existingPaths.has(source)) {
          duplicates.push(note.sourceName ?? note.metadata.title ?? note.id);
          continue;
        }
        if (source) {
          existingPaths.add(source);
        }
        importedNotes.push(note);
      }

      for (let i = importedNotes.length - 1; i >= 0; i--) {
        session.notes.unshift(importedNotes[i]);
      }

      if (importedNotes.length) {
        const normalizedRoots = result.roots.map(normalizeImportPath);
        const rootNote = normalizedRoots
          .map((rootPath) =>
            importedNotes.find(
              (note) =>
                note.sourceName &&
                normalizeImportPath(note.sourceName) === rootPath
            )
          )
          .find((note): note is DiaryxNote => Boolean(note));
        session.activeNoteId = (rootNote ?? importedNotes[0]).id;
        persistMarkdownNotes(session.notes);
      }

      const summaryParts: string[] = [];
      summaryParts.push(
        `Imported ${importedNotes.length}/${result.notes.length} note${
          result.notes.length === 1 ? "" : "s"
        }`
      );
      if (result.roots.length) {
        summaryParts.push(`Roots: ${result.roots.join(", ")}`);
      }
      if (duplicates.length) {
        summaryParts.push(`${duplicates.length} already in library`);
      }
      if (result.skipped.length) {
        summaryParts.push(`${result.skipped.length} skipped in folder`);
      }
      if (result.unresolved.length) {
        summaryParts.push(
          `${result.unresolved.length} unresolved link${
            result.unresolved.length === 1 ? "" : "s"
          }`
        );
      }
      if (result.errors.length) {
        summaryParts.push(
          `${result.errors.length} parse error${
            result.errors.length === 1 ? "" : "s"
          }`
        );
      }
      session.importState.lastSummary = summaryParts.join(" · ");

      const problems: string[] = [];
      if (result.errors.length) {
        problems.push(result.errors.slice(0, 3).join("; "));
      }
      if (result.unresolved.length) {
        const unresolvedPreview = result.unresolved
          .slice(0, 3)
          .map((item) => `${item.parent} → ${item.target}`)
          .join("; ");
        problems.push(`Unresolved: ${unresolvedPreview}`);
      }
      session.importState.lastError = problems.length
        ? problems.join(" · ")
        : undefined;
    } catch (error) {
      session.importState.lastSummary = undefined;
      session.importState.lastError =
        error instanceof Error ? error.message : "Unable to import folder.";
    } finally {
      session.importState.isImporting = false;
    }
  });

  const handleBatchFolderChange = $(async (event: Event) => {
    const input = event.target as HTMLInputElement;
    await handleBatchImport(input.files);
    if (input) {
      input.value = "";
    }
  });

  const libraryMode = session.ui.libraryMode;
  const isSharedView = libraryMode === "shared";
  const activeCollection = isSharedView ? session.sharedNotes : session.notes;
  const activeNoteId = isSharedView ? session.sharedActiveNoteId : session.activeNoteId;
  const searchQuery = querySignal.value.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  const noteMatchesQuery = (note: DiaryxNote): boolean => {
    if (!isSearching) return true;
    const titleMatch = String(note.metadata.title ?? "")
      .toLowerCase()
      .includes(searchQuery);
    const bodyMatch = note.body.toLowerCase().includes(searchQuery);
    const authorMatch = authorLabel(note.metadata.author)
      .toLowerCase()
      .includes(searchQuery);
    return titleMatch || bodyMatch || authorMatch;
  };

  const sharedNotesToDisplay = isSharedView
    ? activeCollection.filter((note) => !isSearching || noteMatchesQuery(note))
    : [];

  const treeDisplayItems: NoteListDisplayItem[] = [];

  if (!isSharedView) {
    const tree = buildDiaryxNoteTree(activeCollection);
    const expandedEntries = session.ui.expandedNotes ?? {};
    const expandedTrue = new Set(
      Object.entries(expandedEntries)
        .filter(([, value]) => value === true)
        .map(([key]) => key)
    );
    const collapsedExplicit = new Set(
      Object.entries(expandedEntries)
        .filter(([, value]) => value === false)
        .map(([key]) => key)
    );

    const ancestorsOfActive = new Set<string>();
    let walker = activeNoteId ? tree.parentById.get(activeNoteId) : undefined;
    while (walker) {
      if (ancestorsOfActive.has(walker)) {
        break;
      }
      ancestorsOfActive.add(walker);
      walker = tree.parentById.get(walker);
    }

    const traverse = (
      node: DiaryxNoteTreeNode,
      depth: number,
      visited: Set<string>
    ): { hasMatch: boolean; items: NoteListDisplayItem[] } => {
      if (visited.has(node.note.id)) {
        return { hasMatch: false, items: [] };
      }
      visited.add(node.note.id);

      const childResults = node.children.map((child) =>
        traverse(child, depth + 1, visited)
      );
      const hasMatchingChild = childResults.some((result) => result.hasMatch);
      const matchesSearch = isSearching ? noteMatchesQuery(node.note) : false;
      const isActive = node.note.id === activeNoteId;
      const shouldInclude =
        !isSearching ||
        matchesSearch ||
        hasMatchingChild ||
        isActive ||
        ancestorsOfActive.has(node.note.id);
      const explicitState = expandedEntries[node.note.id];
      const searchExpanded = isSearching && (matchesSearch || hasMatchingChild);
      const defaultExpanded =
        node.note.metadata.this_file_is_root_index === true &&
        !collapsedExplicit.has(node.note.id);
      const effectiveExpanded =
        explicitState !== undefined
          ? explicitState
          : defaultExpanded || expandedTrue.has(node.note.id);
      const isExpanded = effectiveExpanded || searchExpanded;

      const items: NoteListDisplayItem[] = [];
      if (shouldInclude) {
        items.push({
          note: node.note,
          depth,
          hasChildren: node.children.length > 0,
          isExpanded,
          matchesSearch,
          descendantMatches: hasMatchingChild,
        });
        if (
          node.children.length &&
          (isExpanded || (isSearching && (matchesSearch || hasMatchingChild)))
        ) {
          for (const result of childResults) {
            if (result.items.length) {
              items.push(...result.items);
            }
          }
        }
      }

      visited.delete(node.note.id);

      const hasMatch =
        matchesSearch ||
        hasMatchingChild ||
        isActive ||
        ancestorsOfActive.has(node.note.id);

      return {
        hasMatch,
        items,
      };
    };

    for (const root of tree.roots) {
      const result = traverse(root, 0, new Set());
      if (result.items.length) {
        treeDisplayItems.push(...result.items);
      }
    }

    for (const note of activeCollection) {
      if (treeDisplayItems.some((item) => item.note.id === note.id)) {
        continue;
      }
      if (tree.parentById.has(note.id)) {
        continue;
      }
      const node = tree.nodesById.get(note.id);
      const hasChildren = Boolean(node?.children.length);
      const matchesSearch = isSearching ? noteMatchesQuery(note) : false;
      const explicitState = expandedEntries[note.id];
      const defaultExpanded =
        hasChildren &&
        note.metadata.this_file_is_root_index === true &&
        !collapsedExplicit.has(note.id);
      const isExpanded =
        (explicitState !== undefined ? explicitState : defaultExpanded) ||
        (isSearching && (matchesSearch || Boolean(node && node.children.length)));

      treeDisplayItems.push({
        note,
        depth: 0,
        hasChildren,
        isExpanded,
        matchesSearch,
        descendantMatches: Boolean(node && node.children.length > 0),
      });
    }
  }

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => openMenuId.value);
    if (!openMenuId.value) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-note-actions]')) {
        openMenuId.value = undefined;
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    cleanup(() => window.removeEventListener("pointerdown", handlePointerDown));
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => folderInputSignal.value);
    const input = folderInputSignal.value;
    if (input && !input.hasAttribute("webkitdirectory")) {
      input.setAttribute("webkitdirectory", "");
    }
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
            onClick$={() => folderInputSignal.value?.click()}
            disabled={session.importState.isImporting}
          >
            Import folder
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
        {session.importState.lastSummary && (
          <p class="status success">{session.importState.lastSummary}</p>
        )}
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
      <input
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        class="sr-only"
        ref={folderInputSignal}
        onChange$={handleBatchFolderChange}
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
        {isSharedView &&
          sharedNotesToDisplay.map((note) => {
            const isActive = session.sharedActiveNoteId === note.id;
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
                    {author && <span class="shared-author"> — {author}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        {!isSharedView &&
          treeDisplayItems.map((item) => {
            const note = item.note;
            const isActive = session.activeNoteId === note.id;
            const indent = Math.max(item.depth, 0) * 16;
            return (
              <li
                key={note.id}
                class={{ active: isActive, "has-children": item.hasChildren }}
                data-depth={item.depth}
              >
                <div
                  class="note-row"
                  style={{ paddingInlineStart: `${indent}px` }}
                  data-note-actions={openMenuId.value === note.id ? "open" : undefined}
                >
                  {item.hasChildren ? (
                    <button
                      type="button"
                      class="note-toggle"
                      data-expanded={item.isExpanded}
                      aria-label={`${item.isExpanded ? "Collapse" : "Expand"} ${note.metadata.title || "note"}`}
                      onClick$={(event) => handleToggleExpand(note.id, event)}
                    />
                  ) : null}
                  <button
                    type="button"
                    class="note-open"
                    onClick$={() => handleSelect(note.id)}
                  >
                    <span class="title">{note.metadata.title}</span>
                  </button>
                  <div class="note-row-actions" data-note-actions>
                    <button
                      type="button"
                      class="note-menu-trigger"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId.value === note.id ? "true" : "false"}
                      aria-label="Note actions"
                      onClick$={(event) => handleToggleMenu(note.id, event)}
                    >
                      ⋯
                    </button>
                    {openMenuId.value === note.id && (
                      <div class="note-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick$={(event) => handleMenuAction(note.id, "add-child", event)}
                        >
                          Add child note
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          class="danger"
                          onClick$={(event) => handleMenuAction(note.id, "delete", event)}
                        >
                          Delete note
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        {isSharedView &&
          !session.sharedNotesState.isLoading &&
          !session.sharedNotesState.isUnauthorized &&
          !session.sharedNotesState.lastError &&
          !sharedNotesToDisplay.length && (
            <li class="note-empty">
              {isSearching ? "No shared notes match your search." : "No shared notes yet."}
            </li>
          )}
        {!isSharedView && !treeDisplayItems.length && (
          <li class="note-empty">
            {isSearching ? "No notes match your search." : "No notes yet."}
          </li>
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
