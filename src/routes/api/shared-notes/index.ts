import type { RequestEvent, RequestHandler } from "@builder.io/qwik-city";
import { getAuth } from "~/lib/auth";
import { listNotesSharedWithEmail } from "~/lib/server/note-storage";
import { parseDiaryxString } from "~/lib/diaryx/parser";
import type { DiaryxNote } from "~/lib/diaryx/types";

const respondUnauthorized = (event: RequestEvent) => {
  event.json(401, { error: "UNAUTHORIZED" });
};

const respondBadRequest = (event: RequestEvent, message: string) => {
  event.json(400, { error: message });
};

const parseUser = async (event: RequestEvent) => {
  try {
    const auth = getAuth(event);
    const session = await auth.api.getSession({
      headers: event.request.headers,
      asResponse: false,
    });
    return session?.user ?? null;
  } catch (error) {
    console.warn("Failed to resolve session", error);
    return null;
  }
};

const toVisibilityArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }
  return [];
};

const hasSharedAccess = (note: DiaryxNote, email: string): boolean => {
  const terms = toVisibilityArray(note.metadata.visibility);
  if (!terms.length) return false;
  const map = (note.metadata.visibility_emails as Record<string, string[]>) ?? {};
  const lowerEmail = email.trim().toLowerCase();
  for (const term of terms) {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) continue;
    const directList = map[trimmedTerm];
    if (Array.isArray(directList) && directList.some((entry) => entry.toLowerCase() === lowerEmail)) {
      return true;
    }
    for (const [key, list] of Object.entries(map)) {
      if (key.trim().toLowerCase() !== trimmedTerm.toLowerCase()) continue;
      if (list.some((entry) => entry.toLowerCase() === lowerEmail)) {
        return true;
      }
    }
  }
  return false;
};

export const onGet: RequestHandler = async (event) => {
  const user = await parseUser(event);
  if (!user) {
    respondUnauthorized(event);
    return;
  }

  const userEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!userEmail) {
    respondBadRequest(event, "EMAIL_REQUIRED");
    return;
  }

  const rows = await listNotesSharedWithEmail(event, userEmail);
  const notes: DiaryxNote[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    try {
      const { note } = parseDiaryxString(row.markdown, {
        id: row.id,
        sourceName: row.source_name ?? undefined,
      });
      const lastModified = Number(row.last_modified ?? Date.now());
      note.lastModified = Number.isFinite(lastModified) ? lastModified : Date.now();
      note.sourceName = row.source_name ?? undefined;
      if (!hasSharedAccess(note, userEmail)) {
        continue;
      }
      if (seen.has(note.id)) {
        continue;
      }
      seen.add(note.id);
      notes.push(note);
    } catch (error) {
      console.warn(`Failed to parse shared note ${row.id}`, error);
    }
  }

  notes.sort((a, b) => {
    const diff = (b.lastModified ?? 0) - (a.lastModified ?? 0);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  event.json(200, { notes });
};

export const config = {
  runtime: "nodejs22.x",
};
