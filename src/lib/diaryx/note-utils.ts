import yaml from "js-yaml";
import type { DiaryxNote } from "./types";
import { hasMetadataContent } from "./metadata-utils";

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

export const syncNoteFrontmatter = (note: DiaryxNote) => {
  if (!hasMetadataContent(note.metadata)) {
    note.frontmatter = undefined;
    return;
  }

  try {
    const yamlString = yaml
      .dump(note.metadata, {
        lineWidth: 1000,
        skipInvalid: true,
        quotingType: '"',
      })
      .trimEnd();
    note.frontmatter = yamlString || undefined;
  } catch (error) {
    console.warn("Unable to update note frontmatter", error);
  }
};
