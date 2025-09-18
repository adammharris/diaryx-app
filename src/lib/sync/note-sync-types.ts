export interface RemoteNotePayload {
  id: string;
  markdown: string;
  sourceName?: string | null;
  lastModified?: number;
}

export interface RemoteVisibilityTerm {
  term: string;
  emails: string[];
}

export interface SyncRequestPayload {
  notes: RemoteNotePayload[];
  visibilityTerms: RemoteVisibilityTerm[];
}

