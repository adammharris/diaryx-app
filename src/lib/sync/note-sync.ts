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

  const response = await fetch("/api/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ notes: payload }),
  });

  if (response.status === 401) {
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to sync notes");
  }

  const data = (await response.json()) as { notes?: RemoteNotePayload[] };
  const remoteNotes = Array.isArray(data.notes) ? data.notes : [];

  const parsed: DiaryxNote[] = [];
  for (const remote of remoteNotes) {
    const note = parseRemoteNote(remote);
    if (note) parsed.push(note);
  }

  const repo = createDiaryxRepository();

  if (!parsed.length) {
    session.notes.splice(0, session.notes.length);
    session.activeNoteId = undefined;
    persistMarkdownNotes([]);
    await repo.clear();
    return;
  }

  session.notes.splice(0, session.notes.length, ...parsed);
  if (!session.activeNoteId || !parsed.find((note) => note.id === session.activeNoteId)) {
    session.activeNoteId = parsed[0].id;
  }

  persistMarkdownNotes(parsed);
  await repo.clear();
  await Promise.all(parsed.map((note) => repo.save(note)));
};
