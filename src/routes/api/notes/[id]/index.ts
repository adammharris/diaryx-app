import type { RequestEvent, RequestHandler } from "@builder.io/qwik-city";
import { getAuth } from "~/lib/auth";
import { deleteNoteForUser } from "~/lib/server/note-storage";

const parseUser = async (event: RequestEvent) => {
  const auth = getAuth(event);
  const session = await auth.api.getSession({
    headers: event.request.headers,
    asResponse: false,
  });
  return session?.user ?? null;
};

export const onDelete: RequestHandler = async (event) => {
  try {
    const { params } = event;
    const user = await parseUser(event);
    if (!user) {
      event.json(401, { error: "UNAUTHORIZED" });
      return;
    }

    const noteId = params.id;
    if (!noteId) {
      event.json(400, { error: "MISSING_NOTE_ID" });
      return;
    }

    await deleteNoteForUser(event, user.id, noteId);
    event.json(200, { status: "deleted" });
  } catch (error) {
    console.error("Failed to delete note", error);
    event.json(500, {
      error: {
        message:
          error instanceof Error ? error.message : "Unexpected error while deleting note.",
      },
    });
  }
};

export const config = {
  runtime: "nodejs22.x",
};
