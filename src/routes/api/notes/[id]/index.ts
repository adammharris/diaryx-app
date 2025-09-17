import type { RequestHandler } from "@builder.io/qwik-city";
import { auth } from "~/lib/auth";
import { deleteNoteForUser } from "~/lib/server/note-storage";

const parseUser = async (request: Request) => {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      asResponse: false,
    });
    return session?.user ?? null;
  } catch (error) {
    console.warn("Failed to resolve session for delete", error);
    return null;
  }
};

export const onDelete: RequestHandler = async (event) => {
  const { request, params } = event;
  const user = await parseUser(request);
  if (!user) {
    return event.json(401, { error: "UNAUTHORIZED" });
  }

  const noteId = params.id;
  if (!noteId) {
    return event.json(400, { error: "MISSING_NOTE_ID" });
  }

  await deleteNoteForUser(user.id, noteId);
  return event.json(200, { status: "deleted" });
};
