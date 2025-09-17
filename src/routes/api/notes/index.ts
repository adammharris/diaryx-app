import type { RequestEvent, RequestHandler } from "@builder.io/qwik-city";
import { auth } from "~/lib/auth";
import { listNotesForUser, upsertNotesForUser } from "~/lib/server/note-storage";

const respondUnauthorized = (event: RequestEvent) =>
  event.json(401, { error: "UNAUTHORIZED" });

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
  if (!user) return respondUnauthorized(event);

  const rows = await listNotesForUser(user.id);
  return event.json(200, {
    notes: rows.map((row) => ({
      id: row.id,
      markdown: row.markdown,
      sourceName: row.source_name,
      lastModified: Number(row.last_modified ?? Date.now()),
    })),
  });
};

export const onPost: RequestHandler = async (event) => {
  const { request } = event;
  const user = await parseUser(request);
  if (!user) return respondUnauthorized(event);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return event.json(400, { error: "INVALID_JSON" });
  }

  const notes = Array.isArray((payload as any)?.notes)
    ? (payload as any).notes
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

  const rows = await listNotesForUser(user.id);
  return event.json(200, {
    notes: rows.map((row) => ({
      id: row.id,
      markdown: row.markdown,
      sourceName: row.source_name,
      lastModified: Number(row.last_modified ?? Date.now()),
    })),
  });
};
