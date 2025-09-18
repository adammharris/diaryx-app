import type { Pool } from "@neondatabase/serverless";
import { dbPool } from "../auth";

interface SyncInputNote {
  id: string;
  markdown: string;
  sourceName?: string | null;
  lastModified?: number;
}

export interface DbNote {
  id: string;
  markdown: string;
  source_name: string | null;
  last_modified: string | number;
}

export interface DbSharedNote extends DbNote {
  user_id: string;
}

let tableEnsured = false;

const ensureNotesTable = async (pool: Pool) => {
  if (tableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS diaryx_note (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      markdown TEXT NOT NULL,
      source_name TEXT,
      last_modified BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX IF NOT EXISTS diaryx_note_user_updated_idx
      ON diaryx_note (user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS diaryx_visibility_term (
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      emails TEXT[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, term)
    );
  `);
  tableEnsured = true;
};

export const listNotesForUser = async (userId: string): Promise<DbNote[]> => {
  await ensureNotesTable(dbPool);
  const result = await dbPool.query<DbNote>(
    `SELECT id, markdown, source_name, last_modified
       FROM diaryx_note
      WHERE user_id = $1
      ORDER BY last_modified DESC, updated_at DESC` ,
    [userId]
  );
  return result.rows;
};

export const listVisibilityTermsForUser = async (userId: string) => {
  await ensureNotesTable(dbPool);
  const result = await dbPool.query<{ term: string; emails: string[] }>(
    `SELECT term, emails
       FROM diaryx_visibility_term
      WHERE user_id = $1
      ORDER BY term ASC`,
    [userId]
  );
  return result.rows;
};

export const upsertNotesForUser = async (userId: string, notes: SyncInputNote[]) => {
  if (!notes.length) return;
  await ensureNotesTable(dbPool);
  const queries = notes.map((note) => {
    const lastModified = Number.isFinite(note.lastModified)
      ? Number(note.lastModified)
      : Date.now();
    return dbPool.query(
      `INSERT INTO diaryx_note (user_id, id, markdown, source_name, last_modified, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, id) DO UPDATE
           SET markdown = EXCLUDED.markdown,
               source_name = EXCLUDED.source_name,
               last_modified = EXCLUDED.last_modified,
               updated_at = NOW()
         WHERE EXCLUDED.last_modified >= diaryx_note.last_modified;`,
      [userId, note.id, note.markdown, note.sourceName ?? null, lastModified]
    );
  });
  await Promise.all(queries);
};

export const deleteAllNotesForUser = async (userId: string) => {
  await ensureNotesTable(dbPool);
  await dbPool.query(`DELETE FROM diaryx_note WHERE user_id = $1`, [userId]);
  await dbPool.query(`DELETE FROM diaryx_visibility_term WHERE user_id = $1`, [userId]);
};

export const deleteNoteForUser = async (userId: string, noteId: string) => {
  await ensureNotesTable(dbPool);
  await dbPool.query(`DELETE FROM diaryx_note WHERE user_id = $1 AND id = $2`, [userId, noteId]);
};

export const updateVisibilityTermsForUser = async (
  userId: string,
  terms: Record<string, string[]>
) => {
  await ensureNotesTable(dbPool);
  const client = dbPool;
  const termEntries = Object.entries(terms).map(([term, emails]) => ({
    term,
    emails: Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))),
  }));

  await client.query(`DELETE FROM diaryx_visibility_term WHERE user_id = $1`, [userId]);
  if (!termEntries.length) return;

  const insertPromises = termEntries.map(({ term, emails }) =>
    client.query(
      `INSERT INTO diaryx_visibility_term (user_id, term, emails, updated_at)
         VALUES ($1, $2, $3::text[], NOW())`,
      [userId, term, emails]
    )
  );
  await Promise.all(insertPromises);
};

export const listNotesSharedWithEmail = async (
  email: string
): Promise<DbSharedNote[]> => {
  await ensureNotesTable(dbPool);
  const result = await dbPool.query<DbSharedNote>(
    `SELECT user_id, id, markdown, source_name, last_modified
       FROM diaryx_note
      WHERE markdown ILIKE '%' || $1 || '%'
      ORDER BY updated_at DESC` ,
    [email]
  );
  return result.rows;
};
