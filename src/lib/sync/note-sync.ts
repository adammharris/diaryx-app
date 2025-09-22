import { parseDiaryxString } from "../diaryx/parser";
import { exportDiaryxNoteToMarkdown } from "../diaryx/serializer";
import type { DiaryxNote } from "../diaryx/types";
import type { DiaryxSessionState } from "../state/diaryx-context";
import { persistMarkdownNotes } from "../persistence/markdown-store";
import { createDiaryxRepository } from "../persistence/diaryx-repository";
import type { RemoteNotePayload, RemoteVisibilityTerm } from "./note-sync-types";

const buildPayload = (note: DiaryxNote) => ({
  id: note.id,
  markdown: exportDiaryxNoteToMarkdown(note, { includeFrontmatter: true }),
  sourceName: note.sourceName ?? null,
  lastModified: Number.isFinite(note.lastModified) ? note.lastModified : Date.now(),
});

const parseRemoteNote = (payload: RemoteNotePayload): DiaryxNote | null => {
  if (!payload?.id || typeof payload.markdown !== "string") return null;
  try {
    const { note } = parseDiaryxString(payload.markdown, { id: payload.id });
    const lastModified = Number(payload.lastModified ?? Date.now());
    note.lastModified = Number.isFinite(lastModified) ? lastModified : Date.now();
    if (payload.sourceName) {
      note.sourceName = payload.sourceName ?? undefined;
    }
    return note;
  } catch (error) {
    console.warn("Failed to parse remote note", error);
    return null;
  }
};

const API_HEADERS = {
  "Content-Type": "application/json",
};

const toVisibilityPayload = (visibility: Record<string, string[]> | undefined) =>
  visibility
    ? Object.entries(visibility).map(([term, emails]) => ({
        term,
        emails: Array.from(
          new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))
        ),
      }))
    : [];

const readSyncResponse = async (response: Response) => {
  const status = response.status;
  const contentType = response.headers.get("content-type") || "";
  let data: unknown = null;
  let textFallback: string | undefined;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
      return { status, data, text: undefined };
    } catch (error) {
      console.warn("Failed to parse JSON sync response", error);
    }
  }

  try {
    textFallback = await response.text();
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(textFallback);
      } catch (error) {
        console.warn("Text response was not valid JSON", error);
      }
    }
  } catch (error) {
    console.warn("Failed to read sync response text", error);
  }

  if (data == null && textFallback) {
    data = textFallback;
  }

  return { status, data, text: textFallback };
};

export const syncNotesWithServer = async (session: DiaryxSessionState) => {
  if (typeof window === "undefined") return;

  const payload = session.notes.map(buildPayload);
  const localMarkdownById = new Map(payload.map((entry) => [entry.id, entry.markdown]));
  const visibilityTermsPayload = toVisibilityPayload(session.sharedVisibilityEmails);

  const response = await fetch("/api/notes", {
    method: "POST",
    headers: API_HEADERS,
    credentials: "include",
    body: JSON.stringify({
      notes: payload,
      visibilityTerms: visibilityTermsPayload,
    }),
  });

  const { status, data, text } = await readSyncResponse(response);

  if (status === 401) {
    throw new Error("You must be signed in to sync notes.");
  }

  if (status !== 200 || typeof data !== "object" || data === null) {
    const message =
      (data as any)?.error?.message ||
      (data as any)?.message ||
      (typeof data === "string" ? data : undefined) ||
      text ||
      response.statusText ||
      "Failed to sync notes.";
    throw new Error(message);
  }

  const remoteNotes = Array.isArray((data as any).notes) ? (data as any).notes : [];
  const remoteVisibilityTerms: RemoteVisibilityTerm[] = Array.isArray(
    (data as any).visibilityTerms
  )
    ? ((data as any).visibilityTerms as RemoteVisibilityTerm[])
    : [];
  const parsed: DiaryxNote[] = [];
  const remoteMarkdownById = new Map<string, string>();
  for (const remote of remoteNotes) {
    const note = parseRemoteNote(remote);
    if (note) {
      parsed.push(note);
      if (remote.id) {
        remoteMarkdownById.set(remote.id, remote.markdown);
      }
    }
  }

  const repo = createDiaryxRepository();

  if (!parsed.length) {
    if (!session.notes.length) {
      return;
    }
    session.notes.splice(0, session.notes.length);
    session.activeNoteId = undefined;
    persistMarkdownNotes([]);
    await repo.clear();
    return;
  }

  parsed.sort((a, b) => {
    const diff = (b.lastModified ?? 0) - (a.lastModified ?? 0);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  const existingMap = new Map(session.notes.map((note) => [note.id, note]));
  let hasChanges = session.notes.length !== parsed.length;

  const nextNotes: DiaryxNote[] = parsed.map((remoteNote) => {
    const existing = existingMap.get(remoteNote.id);
    if (!existing) {
      hasChanges = true;
      return remoteNote;
    }

    const localMarkdown = localMarkdownById.get(remoteNote.id);
    const remoteMarkdown = remoteMarkdownById.get(remoteNote.id);
    const sameMarkdown = localMarkdown === remoteMarkdown;
    const sameModified = existing.lastModified === remoteNote.lastModified;

    if (sameMarkdown && sameModified) {
      return existing;
    }

    hasChanges = true;
    existing.body = remoteNote.body;
    existing.metadata = remoteNote.metadata;
    existing.frontmatter = remoteNote.frontmatter;
    existing.autoUpdateTimestamp = remoteNote.autoUpdateTimestamp;
    existing.lastModified = remoteNote.lastModified;
    existing.sourceName = remoteNote.sourceName;
    return existing;
  });

  if (!hasChanges) {
    return;
  }

  session.notes.splice(0, session.notes.length, ...nextNotes);
  if (!session.activeNoteId || !nextNotes.find((note) => note.id === session.activeNoteId)) {
    session.activeNoteId = nextNotes[0].id;
  }

  persistMarkdownNotes(nextNotes);
  await repo.clear();
  await Promise.all(nextNotes.map((note) => repo.save(note)));

  if (remoteVisibilityTerms.length) {
    const aggregated = new Map<string, Set<string>>();
    for (const entry of remoteVisibilityTerms) {
      const term = entry.term.trim();
      if (!term) continue;
      const set = aggregated.get(term) ?? new Set<string>();
      for (const email of entry.emails) {
        const normalizedEmail = email.trim().toLowerCase();
        if (normalizedEmail) {
          set.add(normalizedEmail);
        }
      }
      aggregated.set(term, set);
    }
    session.sharedVisibilityEmails = Object.fromEntries(
      Array.from(aggregated.entries()).map(([term, set]) => [term, Array.from(set.values())])
    );
  }
};

export const deleteNoteOnServer = async (noteId: string) => {
  if (typeof window === "undefined") return;
  try {
    const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok && response.status !== 404) {
      console.warn("Failed to delete note on server", await response.text());
    }
  } catch (error) {
    console.warn("Failed to delete note on server", error);
  }
};
