import type {
  DiaryxMetadata,
  DiaryxMetadataRequired,
  DiaryxValidationIssue,
} from "./types";
import { validateDiaryxMetadata } from "./validation";

const REQUIRED_FIELDS: Array<keyof DiaryxMetadataRequired> = [
  "title",
  "author",
  "created",
  "updated",
  "visibility",
  "format",
  "reachable",
];

const ensureString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value == null) {
    return "";
  }
  return String(value);
};

const ensureStringOrArray = (value: unknown): string | string[] => {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => ensureString(item))
      .filter((item) => item.length > 0);
    return normalized.length ? normalized : "";
  }
  return ensureString(value);
};

export const isValuePresent = (value: unknown): boolean => {
  if (value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => ensureString(item).trim().length > 0);
  }
  return ensureString(value).trim().length > 0;
};

export const normalizeDiaryxMetadata = (
  input: Record<string, unknown> | undefined | null
): { metadata: DiaryxMetadata; issues: DiaryxValidationIssue[] } => {
  const base: Record<string, unknown> =
    input && typeof input === "object" ? { ...input } : {};

  base.title = ensureString(base.title);
  base.author = ensureStringOrArray(base.author);
  base.created = ensureString(base.created);
  base.updated = ensureString(base.updated);
  base.visibility = ensureStringOrArray(base.visibility);
  base.format = ensureStringOrArray(base.format);
  base.reachable = ensureStringOrArray(base.reachable);

  const { success, metadata, issues } = validateDiaryxMetadata(base);

  return {
    metadata: (success && metadata ? metadata : (base as DiaryxMetadata)),
    issues,
  };
};

export const missingMetadataFields = (
  metadata: DiaryxMetadata
): Set<keyof DiaryxMetadataRequired> => {
  const missing = new Set<keyof DiaryxMetadataRequired>();
  for (const key of REQUIRED_FIELDS) {
    if (!isValuePresent(metadata[key])) {
      missing.add(key);
    }
  }
  return missing;
};

export const isMetadataFieldPresent = (
  metadata: DiaryxMetadata,
  key: keyof DiaryxMetadataRequired
): boolean => !missingMetadataFields(metadata).has(key);

export const REQUIRED_METADATA_FIELDS = REQUIRED_FIELDS;

export const describeIssues = (
  issues: DiaryxValidationIssue[]
): string | undefined => {
  if (!issues.length) return undefined;
  const unique = new Map<string, string>();
  for (const issue of issues) {
    const key = issue.path || issue.message;
    if (!unique.has(key)) {
      unique.set(key, issue.message);
    }
  }
  return Array.from(unique.values()).join("; ");
};

export const hasMetadataContent = (metadata: DiaryxMetadata): boolean =>
  Object.entries(metadata).some(([key, value]) => {
    if ((REQUIRED_FIELDS as string[]).includes(key)) {
      return isValuePresent(value);
    }
    return value !== undefined && value !== null && isValuePresent(value);
  });
