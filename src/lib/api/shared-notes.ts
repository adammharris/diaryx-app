import type { DiaryxNote } from "../diaryx/types";

export interface SharedNotesResponse {
  notes: DiaryxNote[];
}

export class SharedNotesError extends Error {
  status?: number;
}

export const fetchSharedNotes = async (): Promise<DiaryxNote[]> => {
  const response = await fetch("/api/shared-notes", {
    method: "GET",
    credentials: "include",
    headers: {
      "Accept": "application/json",
    },
  });

  if (response.status === 401) {
    const error = new SharedNotesError("UNAUTHORIZED");
    error.status = 401;
    throw error;
  }

  if (response.status === 400) {
    const error = new SharedNotesError("EMAIL_REQUIRED");
    error.status = 400;
    throw error;
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "Unable to load shared notes");
    const error = new SharedNotesError(message || "Unable to load shared notes");
    error.status = response.status;
    throw error;
  }

  const data = (await response.json()) as SharedNotesResponse;
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  return notes.map((note) => ({
    ...note,
    metadata: note.metadata ?? {},
    frontmatter: note.frontmatter ?? undefined,
    autoUpdateTimestamp: note.autoUpdateTimestamp,
    lastModified: Number.isFinite(note.lastModified)
      ? (note.lastModified as number)
      : Number(note.lastModified ?? Date.now()),
  }));
};
