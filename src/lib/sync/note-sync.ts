import { parseDiaryxString } from "../diaryx/parser";
import { exportDiaryxNoteToMarkdown } from "../diaryx/serializer";
import type { DiaryxNote } from "../diaryx/types";
import type { DiaryxSessionState } from "../state/diaryx-context";
import { persistMarkdownNotes } from "../persistence/markdown-store";
import { createDiaryxRepository } from "../persistence/diaryx-repository";

interface RemoteNotePayload {
  id: string;
  markdown: string;
  sourceName?: string | null;
  lastModified?: number;
}

interface RemoteVisibilityTerm {
  term: string;
  emails: string[];
}

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

export const syncNotesWithServer = async (session: DiaryxSessionState) => {
  if (typeof fetch === "undefined") return;

  const payload = session.notes.map(buildPayload);
  const localMarkdownById = new Map(payload.map((entry) => [entry.id, entry.markdown]));
  const visibilityTermsPayload = session.sharedVisibilityEmails
    ? Object.entries(session.sharedVisibilityEmails).map(([term, emails]) => ({
        term,
        emails: Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))),
      }))
    : [];

  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ notes: payload, visibilityTerms: visibilityTermsPayload }),
  });

  if (response.status === 401) {
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to sync notes");
  }

  const data = (await response.json()) as {
    notes?: RemoteNotePayload[];
    visibilityTerms?: RemoteVisibilityTerm[];
  };
  const remoteNotes = Array.isArray(data.notes) ? data.notes : [];
  const remoteVisibilityTerms = Array.isArray(data.visibilityTerms)
    ? data.visibilityTerms
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
  if (typeof fetch === "undefined") return;
  try {
    await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch (error) {
    console.warn("Failed to delete note on server", error);
  }
};
