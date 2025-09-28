import { parseDiaryxFile } from "../diaryx/parser";
import type { DiaryxNote } from "../diaryx/types";
import { normalizeMetadataList, parseDiaryxLink } from "../diaryx/note-tree";

export interface BatchImportInput {
  file: File;
  relativePath: string;
}

export interface BatchImportResult {
  notes: DiaryxNote[];
  roots: string[];
  errors: string[];
  unresolved: Array<{ parent: string; target: string }>;
  skipped: string[];
}

interface ParsedEntry {
  note: DiaryxNote;
  relativePath: string;
  normalizedPath: string;
  contentTargets: string[];
}

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

const stripAngles = (value: string): string =>
  value.startsWith("<") && value.endsWith(">")
    ? value.slice(1, value.length - 1)
    : value;

const collapsePath = (path: string): string => {
  const parts = path.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join("/");
};

export const normalizePath = (input: string): string =>
  collapsePath(input.replace(/\\/g, "/").replace(/^\.\//, "")).toLowerCase();

const hasPartOf = (note: DiaryxNote): boolean => {
  const value = note.metadata.part_of as string | string[] | undefined;
  return normalizeMetadataList(value).length > 0;
};

const ensureExtension = (target: string): string[] => {
  if (/\.[a-z0-9]+$/i.test(target)) {
    return [target];
  }
  return [target, `${target}.md`, `${target}.markdown`];
};

const resolveTargets = (target: string, relativePath: string): string[] => {
  const cleaned = collapsePath(stripAngles(target.trim()));
  if (!cleaned) return [];
  if (/^[a-z]+:\/\//i.test(cleaned) || cleaned.startsWith("#")) {
    return [];
  }

  const candidates = new Set<string>();
  const relativeDir = relativePath.includes("/")
    ? relativePath.slice(0, relativePath.lastIndexOf("/"))
    : "";

  const variations = new Set<string>();
  variations.add(cleaned);
  try {
    const decoded = decodeURIComponent(cleaned);
    variations.add(decoded);
  } catch {
    // ignore decoding errors
  }

  for (const variant of variations) {
    for (const candidate of ensureExtension(variant)) {
      candidates.add(candidate);
      if (!candidate.startsWith("/")) {
        const combined = relativeDir ? `${relativeDir}/${candidate}` : candidate;
        candidates.add(combined);
      }
    }
  }

  return Array.from(candidates).map(normalizePath);
};

export const importBatchNotes = async (
  inputs: BatchImportInput[]
): Promise<BatchImportResult> => {
  const map = new Map<string, ParsedEntry>();
  const errors: string[] = [];
  const skipped: string[] = [];
  const unresolved: Array<{ parent: string; target: string }> = [];

  for (const { file, relativePath } of inputs) {
    const lower = relativePath.toLowerCase();
    const extension = lower.slice(lower.lastIndexOf("."));
    if (!MARKDOWN_EXTENSIONS.has(extension)) {
      skipped.push(`${relativePath} (not markdown)`);
      continue;
    }

    const normalizedPath = normalizePath(relativePath);
    if (map.has(normalizedPath)) {
      skipped.push(`${relativePath} (duplicate in folder)`);
      continue;
    }

    try {
      const { note } = await parseDiaryxFile(file, { id: undefined });
      note.sourceName = relativePath;
      const contents = normalizeMetadataList(
        note.metadata.contents as string | string[] | undefined
      );
      const contentTargets = contents
        .map((raw) => parseDiaryxLink(raw).target)
        .filter((value) => value && typeof value === "string");

      map.set(normalizedPath, {
        note,
        relativePath,
        normalizedPath,
        contentTargets,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to parse file.";
      errors.push(`${relativePath}: ${message}`);
    }
  }

  const childMap = new Map<string, Set<string>>();

  for (const entry of map.values()) {
    if (!entry.contentTargets.length) continue;
    const childSet = new Set<string>();
    for (const target of entry.contentTargets) {
      const resolvedCandidates = resolveTargets(target, entry.relativePath);
      const match = resolvedCandidates.find((candidate) => map.has(candidate));
      if (match) {
        childSet.add(match);
      } else {
        unresolved.push({ parent: entry.relativePath, target });
      }
    }
    if (childSet.size) {
      childMap.set(entry.normalizedPath, childSet);
    }
  }

  const visited = new Set<string>();
  const orderedPaths: string[] = [];
  const rootCandidates = new Set<string>();

  for (const entry of map.values()) {
    const contents = normalizeMetadataList(
      entry.note.metadata.contents as string | string[] | undefined
    );
    if (contents.length && !hasPartOf(entry.note)) {
      rootCandidates.add(entry.normalizedPath);
    }
  }

  const visit = (path: string) => {
    if (visited.has(path)) return;
    visited.add(path);
    orderedPaths.push(path);
    const children = childMap.get(path);
    if (!children) return;
    for (const child of children) {
      visit(child);
    }
  };

  for (const root of rootCandidates) {
    visit(root);
  }

  for (const path of map.keys()) {
    if (!visited.has(path)) {
      visit(path);
    }
  }

  const notes = orderedPaths
    .map((path) => map.get(path))
    .filter((entry): entry is ParsedEntry => Boolean(entry))
    .map((entry) => entry.note);

  const roots = Array.from(rootCandidates).map((path) => {
    const entry = map.get(path);
    return entry ? entry.relativePath : path;
  });

  return {
    notes,
    roots,
    errors,
    unresolved,
    skipped,
  };
};
