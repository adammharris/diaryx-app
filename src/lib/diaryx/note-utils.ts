import type { DiaryxNote } from "./types";

export const stampNoteUpdated = (
  note: DiaryxNote,
  options: { skipMetadata?: boolean } = {}
) => {
  if (!options.skipMetadata && note.autoUpdateTimestamp !== false) {
    note.metadata.updated = new Date().toISOString();
  }
  note.lastModified = Date.now();
};

export const ensureCreated = (note: DiaryxNote) => {
  if (!note.metadata.created) {
    note.metadata.created = new Date().toISOString();
  }
};
