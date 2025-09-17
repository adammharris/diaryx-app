import type { ZodIssue } from "zod";

export type DiaryxVisibilityAudience = string;

export interface DiaryxMetadataRequired {
  title: string;
  author: string | string[];
  created: string;
  updated: string;
  visibility: DiaryxVisibilityAudience | DiaryxVisibilityAudience[];
  format: string | string[];
  reachable: string | string[];
}

export interface DiaryxMetadataOptional {
  version?: string | string[];
  copying?: string | string[];
  contents?: string | string[];
  part_of?: string | string[];
  checksums?: string | string[];
  banner?: string;
  language?: string;
  tags?: string[];
  aliases?: string[];
  this_file_is_root_index?: boolean;
  starred?: boolean;
  pinned?: boolean;
  /**
   * Provides compatibility with Appendix optional properties while allowing unknown key passthrough.
   */
  [key: string]: unknown;
}

export type DiaryxMetadata = DiaryxMetadataRequired & DiaryxMetadataOptional;

export interface DiaryxNote {
  id: string;
  body: string;
  metadata: DiaryxMetadata;
  /** Cached YAML frontmatter string, without leading/ending separators. */
  frontmatter?: string;
  /** Whether the `updated` timestamp should refresh automatically. */
  autoUpdateTimestamp?: boolean;
  /**
   * When import/export operations supply original filename this keeps reference for display.
   */
  sourceName?: string;
  /** Timestamp used for optimistic UI updates */
  lastModified: number;
}

export interface DiaryxValidationIssue {
  path: string;
  message: string;
  issue?: ZodIssue;
}

export interface DiaryxParseResult {
  note: DiaryxNote;
  warnings: DiaryxValidationIssue[];
}

export interface DiaryxSerializeOptions {
  includeFrontmatter?: boolean;
  mode?: "markdown" | "html";
}

export interface DiaryxHtmlExportOptions {
  theme?: "light" | "dark";
  includeMetadataPanel?: boolean;
}

export interface DiaryxImportSummary {
  imported: DiaryxParseResult[];
  failures: Array<{ fileName: string; error: string }>; 
}
