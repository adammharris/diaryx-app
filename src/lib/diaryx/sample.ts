import type { DiaryxNote } from "./types";
import yaml from "js-yaml";

const baseBody = `# Welcome to Diaryx

Begin capturing your thoughts with full control over metadata. Select this note to explore the editor and metadata drawer.`;

const baseMetadata = {
  title: "Welcome to Diaryx",
  author: "Diaryx",
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
  visibility: ["Digital journal users", "Markdown users"],
  format: "[CommonMark (Markdown)](https://spec.commonmark.org/0.31.2/)",
  reachable: "support@diaryx.net",
  tags: ["guide", "onboarding"],
};

const randomId = () => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    console.warn("Welcome note randomUUID fallback", error);
  }
  return `${Date.now()}-welcome-${Math.random().toString(36).slice(2, 8)}`;
};

export const createWelcomeNote = (): DiaryxNote => ({
  id: randomId(),
  body: baseBody,
  metadata: baseMetadata,
  frontmatter: yaml.dump(baseMetadata).trimEnd(),
  autoUpdateTimestamp: true,
  lastModified: Date.now(),
});

export const createBlankNote = (overrides: Partial<DiaryxNote> = {}): DiaryxNote => {
  const now = new Date().toISOString();
  const blankMetadata = {
    title: "Untitled note",
    author: "Author",
    created: now,
    updated: now,
    visibility: ["Private"],
    format: "[CommonMark (Markdown)](https://spec.commonmark.org/0.31.2/)",
    reachable: "This device",
  };

  const note: DiaryxNote = {
    id: randomId(),
    body: "# Untitled\n",
    metadata: blankMetadata,
    frontmatter: yaml.dump(blankMetadata).trimEnd(),
    autoUpdateTimestamp: true,
    lastModified: Date.now(),
  };

  return {
    ...note,
    ...overrides,
    metadata: {
      ...blankMetadata,
      ...(overrides.metadata ?? {}),
    },
  };
};
