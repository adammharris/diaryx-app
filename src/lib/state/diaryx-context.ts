import { createContextId } from "@builder.io/qwik";
import type { DiaryxNote } from "../diaryx/types";

export type ThemePreference = "system" | "light" | "dark";
export type ColorAccent = "violet" | "blue" | "teal" | "amber";

export interface DiaryxUiState {
  theme: ThemePreference;
  accent: ColorAccent;
  leftPanelWidth: number;
  rightPanelWidth: number;
  showMetadata: boolean;
  showLibrary: boolean;
  showPreview: boolean;
  showCommandPalette: boolean;
  editorMode: "split" | "source" | "preview" | "live";
  showSettings: boolean;
}

export interface DiaryxSessionState {
  notes: DiaryxNote[];
  activeNoteId?: string;
  filters: {
    query: string;
    tag?: string;
  };
  ui: DiaryxUiState;
  importState: {
    isImporting: boolean;
    lastError?: string;
  };
  exportState: {
    isExporting: boolean;
    lastSuccessAt?: number;
  };
  sharedVisibilityEmails: Record<string, string[]>;
}

export const DiaryxSessionContext = createContextId<DiaryxSessionState>(
  "diaryx.session"
);
