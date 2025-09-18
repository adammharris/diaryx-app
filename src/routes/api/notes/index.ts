import type { RequestEvent, RequestHandler } from "@builder.io/qwik-city";
import { auth } from "~/lib/auth";
import {
  listNotesForUser,
  upsertNotesForUser,
  listVisibilityTermsForUser,
  updateVisibilityTermsForUser,
} from "~/lib/server/note-storage";

const respondUnauthorized = (event: RequestEvent): void => {
  event.json(401, { error: "UNAUTHORIZED" });
};

const parseUser = async (request: Request) => {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      asResponse: false,
    });
    return session?.user ?? null;
  } catch (error) {
    console.warn("Failed to resolve session", error);
    return null;
  }
};

export const onGet: RequestHandler = async (event) => {
  const { request } = event;
  const user = await parseUser(request);
  if (!user) {
    respondUnauthorized(event);
    return;
  }

  const rows = await listNotesForUser(user.id);
  const terms = await listVisibilityTermsForUser(user.id);
  event.json(200, {
    notes: rows.map((row) => ({
      id: row.id,
      markdown: row.markdown,
      sourceName: row.source_name,
      lastModified: Number(row.last_modified ?? Date.now()),
    })),
    visibilityTerms: terms,
  });
};

export const onPost: RequestHandler = async (event) => {
  const { request } = event;
  const user = await parseUser(request);
  if (!user) {
    respondUnauthorized(event);
    return;
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    event.json(400, { error: "INVALID_JSON" });
    return;
  }

  const notes = Array.isArray((payload as any)?.notes)
    ? (payload as any).notes
    : [];
  const visibilityTermsPayload = Array.isArray((payload as any)?.visibilityTerms)
    ? (payload as any).visibilityTerms
    : [];

  const validNotes = notes
    .filter((note: any) => note && typeof note.id === "string" && typeof note.markdown === "string")
    .map((note: any) => ({
      id: note.id as string,
      markdown: note.markdown as string,
      sourceName:
        typeof note.sourceName === "string"
          ? note.sourceName
          : note.sourceName === null
          ? null
          : undefined,
      lastModified:
        typeof note.lastModified === "number"
          ? note.lastModified
          : Number(note.lastModified ?? Date.now()),
    }));

  if (validNotes.length) {
    await upsertNotesForUser(user.id, validNotes);
  }

  const validTerms = visibilityTermsPayload
    .filter((item: any) => item && typeof item.term === "string")
    .map((item: any) => ({
      term: item.term.trim(),
      emails: Array.isArray(item.emails)
        ? item.emails
            .map((email: unknown) =>
              typeof email === "string" ? email.trim().toLowerCase() : ""
            )
            .filter((email: string) => email.includes("@"))
        : [],
    }))
    .filter((item: { term: string; emails: string[] }) => item.term.length > 0);

  if (validTerms.length) {
    await updateVisibilityTermsForUser(
      user.id,
      Object.fromEntries(
        validTerms.map(({ term, emails }: { term: string; emails: string[] }) => [
          term,
          emails,
        ])
      )
    );
  }

  const rows = await listNotesForUser(user.id);
  const terms = await listVisibilityTermsForUser(user.id);
  event.json(200, {
    notes: rows.map((row) => ({
      id: row.id,
      markdown: row.markdown,
      sourceName: row.source_name,
      lastModified: Number(row.last_modified ?? Date.now()),
    })),
    visibilityTerms: terms,
  });
};
