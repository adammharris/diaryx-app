import { server$ } from "@builder.io/qwik-city";
import type { RequestEvent } from "@builder.io/qwik-city";
import type {
  RemoteNotePayload,
  RemoteVisibilityTerm,
  SyncRequestPayload,
} from "../sync/note-sync-types";
import { getAuth } from "../auth";
import {
  listNotesForUser,
  upsertNotesForUser,
  listVisibilityTermsForUser,
  updateVisibilityTermsForUser,
  deleteNoteForUser,
} from "./note-storage";

const mapDbNotes = (rows: Awaited<ReturnType<typeof listNotesForUser>>) =>
  rows.map((row) => ({
    id: row.id,
    markdown: row.markdown,
    sourceName: row.source_name,
    lastModified: Number(row.last_modified ?? Date.now()),
  }));

export const syncNotesOnServer = server$(
  async function (payload: SyncRequestPayload) {
    const event = this as RequestEvent;
    try {
      const auth = getAuth(event);
      const session = await auth.api.getSession({
        headers: event.request.headers,
        asResponse: false,
      });
      if (!session?.user) {
        return { status: 401 as const };
      }

      const validNotes = payload.notes
        .filter((note) => note && typeof note.id === "string" && typeof note.markdown === "string")
        .map((note) => ({
          id: note.id,
          markdown: note.markdown,
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
        await upsertNotesForUser(event, session.user.id, validNotes);
      }

      const validTerms = payload.visibilityTerms
        .filter((item) => item && typeof item.term === "string")
        .map((item) => ({
          term: item.term.trim(),
          emails: Array.isArray(item.emails)
            ? item.emails
                .map((email) =>
                  typeof email === "string" ? email.trim().toLowerCase() : ""
                )
                .filter((email) => email.includes("@"))
            : [],
        }))
        .filter((item) => item.term.length > 0);

      if (validTerms.length) {
        await updateVisibilityTermsForUser(
          event,
          session.user.id,
          Object.fromEntries(validTerms.map(({ term, emails }) => [term, emails]))
        );
      }

      const rows = await listNotesForUser(event, session.user.id);
      const terms = await listVisibilityTermsForUser(event, session.user.id);

      return {
        status: 200 as const,
        data: {
          notes: mapDbNotes(rows),
          visibilityTerms: terms,
        },
      };
    } catch (error) {
      console.error("Failed to sync notes on server", error);
      return {
        status: 500 as const,
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected error while syncing notes",
        },
      };
    }
  }
);

export const deleteNoteOnServerRpc = server$(
  async function (noteId: string) {
    const event = this as RequestEvent;
    try {
      const auth = getAuth(event);
      const session = await auth.api.getSession({
        headers: event.request.headers,
        asResponse: false,
      });
      if (!session?.user) {
        return { status: 401 as const };
      }

      await deleteNoteForUser(event, session.user.id, noteId);
      return { status: 204 as const };
    } catch (error) {
      console.error(`Failed to delete note ${noteId} on server`, error);
      return {
        status: 500 as const,
        error: {
          message:
            error instanceof Error ? error.message : "Unexpected error while deleting note",
        },
      };
    }
  }
);
