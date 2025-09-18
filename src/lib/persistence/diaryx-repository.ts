import type { DiaryxNote } from "../diaryx/types";

const NOTES_INDEX_KEY = "diaryx.notes.index";

const isBrowserStorageAvailable = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readIndex = async (): Promise<string[]> => {
  if (!isBrowserStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(NOTES_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch (error) {
    console.warn("Failed to read note index", error);
    return [];
  }
};

const writeIndex = async (ids: string[]): Promise<void> => {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(NOTES_INDEX_KEY, JSON.stringify(ids));
  } catch (error) {
    console.warn("Failed to persist note index", error);
  }
};

const noteKey = (id: string) => `diaryx.note:${id}`;

const readNote = async (id: string): Promise<DiaryxNote | undefined> => {
  if (!isBrowserStorageAvailable()) return undefined;
  try {
    const raw = window.localStorage.getItem(noteKey(id));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as DiaryxNote;
  } catch (error) {
    console.warn(`Failed to read note ${id}`, error);
    return undefined;
  }
};

const writeNote = async (note: DiaryxNote): Promise<void> => {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.setItem(noteKey(note.id), JSON.stringify(note));
  } catch (error) {
    console.warn(`Failed to persist note ${note.id}`, error);
  }
};

const deleteNote = async (id: string): Promise<void> => {
  if (!isBrowserStorageAvailable()) return;
  try {
    window.localStorage.removeItem(noteKey(id));
  } catch (error) {
    console.warn(`Failed to remove note ${id}`, error);
  }
};

export interface DiaryxRepository {
  loadAll(): Promise<DiaryxNote[]>;
  save(note: DiaryxNote): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  listIds(): Promise<string[]>;
}

export const createDiaryxRepository = (): DiaryxRepository => ({
  async loadAll() {
    const ids = await readIndex();
    const notes: DiaryxNote[] = [];
    for (const id of ids) {
      const note = await readNote(id);
      if (note) {
        notes.push(note);
      }
    }
    return notes;
  },
  async save(note) {
    const ids = await readIndex();
    if (!ids.includes(note.id)) {
      ids.push(note.id);
      await writeIndex(ids);
    }
    await writeNote(note);
  },
  async remove(id) {
    const ids = await readIndex();
    await deleteNote(id);
    await writeIndex(ids.filter((value) => value !== id));
  },
  async clear() {
    const ids = await readIndex();
    await Promise.all(ids.map((id) => deleteNote(id)));
    await writeIndex([]);
  },
  async listIds() {
    return readIndex();
  },
});
