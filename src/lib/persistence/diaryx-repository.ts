import { get, set, del } from "idb-keyval";
import type { DiaryxNote } from "../diaryx/types";

const NOTES_INDEX_KEY = "diaryx.notes.index";

export interface DiaryxRepository {
  loadAll(): Promise<DiaryxNote[]>;
  save(note: DiaryxNote): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  listIds(): Promise<string[]>;
}

const loadIndex = async (): Promise<string[]> => {
  const index = await get<string[]>(NOTES_INDEX_KEY);
  return index ?? [];
};

const persistIndex = async (ids: string[]) => {
  await set(NOTES_INDEX_KEY, ids);
};

const noteKey = (id: string) => `diaryx.note:${id}`;

export const createDiaryxRepository = (): DiaryxRepository => ({
  async loadAll() {
    const ids = await loadIndex();
    const notes: DiaryxNote[] = [];
    for (const id of ids) {
      const note = await get<DiaryxNote>(noteKey(id));
      if (note) {
        notes.push(note);
      }
    }
    return notes;
  },
  async save(note) {
    const ids = await loadIndex();
    if (!ids.includes(note.id)) {
      ids.push(note.id);
      await persistIndex(ids);
    }
    await set(noteKey(note.id), note);
  },
  async remove(id) {
    const ids = await loadIndex();
    await del(noteKey(id));
    await persistIndex(ids.filter((value) => value !== id));
  },
  async clear() {
    const ids = await loadIndex();
    await Promise.all(ids.map((id) => del(noteKey(id))));
    await persistIndex([]);
  },
  async listIds() {
    return loadIndex();
  },
});
