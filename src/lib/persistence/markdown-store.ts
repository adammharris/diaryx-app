import { parseDiaryxString } from "../diaryx/parser";
import { exportDiaryxNoteToMarkdown } from "../diaryx/serializer";
import type { DiaryxNote } from "../diaryx/types";

const STORAGE_KEY = "diaryx.notes.markdown";

type StoredMarkdownNote = {
  id: string;
  markdown: string;
  sourceName?: string | null;
};

const isBrowser = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const loadMarkdownNotes = (): DiaryxNote[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const payload = JSON.parse(raw) as StoredMarkdownNote[];
    if (!Array.isArray(payload) || !payload.length) return [];

    const notes: DiaryxNote[] = [];
    for (const entry of payload) {
      if (!entry || typeof entry.markdown !== "string") continue;
      try {
        const { note } = parseDiaryxString(entry.markdown, { id: entry.id });
        if (entry.sourceName) {
          note.sourceName = entry.sourceName ?? undefined;
        }
        notes.push(note);
      } catch (error) {
        console.warn("Failed to parse cached note", error);
      }
    }
    return notes;
  } catch (error) {
    console.warn("Unable to load cached notes", error);
    return [];
  }
};

export const persistMarkdownNotes = (notes: DiaryxNote[]) => {
  if (!isBrowser()) return;
  try {
    if (!notes.length) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: StoredMarkdownNote[] = notes.map((note) => ({
      id: note.id,
      markdown: exportDiaryxNoteToMarkdown(note, { includeFrontmatter: true }),
      sourceName: note.sourceName ?? null,
    }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist notes", error);
  }
};

export const clearMarkdownNotes = () => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};
