import matter from "gray-matter";
import yaml from "js-yaml";
import { validateDiaryxMetadata } from "./validation";
import type { DiaryxParseResult, DiaryxNote } from "./types";

type MinimalBuffer = {
  from: (input: unknown) => unknown;
  isBuffer?: (value: unknown) => boolean;
};

const globalWithBuffer = globalThis as { Buffer?: MinimalBuffer };

if (typeof globalWithBuffer.Buffer === "undefined") {
  globalWithBuffer.Buffer = {
    from: (input: unknown) => input,
    isBuffer: () => false,
  } satisfies MinimalBuffer;
}

export class DiaryxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiaryxParseError";
  }
}

const randomId = (): string => {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    console.warn("DiaryxNote randomUUID fallback", error);
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

interface ParseOptions {
  id?: string;
  sourceName?: string;
}

export const parseDiaryxString = (
  fileContents: string,
  options: ParseOptions = {}
): DiaryxParseResult => {
  const parsed = matter(fileContents, {
    engines: {
      yaml: (s) =>
        (yaml.load(s, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>) ??
        {},
    },
    excerpt: false,
  });

  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    throw new DiaryxParseError("Diaryx files require YAML frontmatter");
  }

  const { success, metadata, issues } = validateDiaryxMetadata(parsed.data);
  if (!success || !metadata) {
    throw new DiaryxParseError(
      `Invalid Diaryx metadata: ${issues
        .map((issue) => issue.message)
        .join(", ") || "unknown"}`
    );
  }

  const note: DiaryxNote = {
    id: options.id ?? randomId(),
    body: parsed.content.trimStart(),
    metadata,
    frontmatter: parsed.matter,
    sourceName: options.sourceName,
    lastModified: Date.now(),
  };

  return {
    note,
    warnings: issues,
  };
};

export const parseDiaryxFile = async (
  file: File,
  options: Omit<ParseOptions, "sourceName"> = {}
): Promise<DiaryxParseResult> => {
  const text = await file.text();
  return parseDiaryxString(text, { ...options, sourceName: file.name });
};
