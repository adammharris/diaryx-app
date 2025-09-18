import { describe, it, expect, beforeEach } from "vitest";
import { createDiaryxRepository } from "../diaryx-repository";

// Minimal localStorage mock
const makeLocalStorageMock = () => {
  const store = new Map<string, string>();
  const api = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    // For test introspection if needed
    __dump: () => Object.fromEntries(store.entries()),
  } as unknown as Storage & { __dump: () => Record<string, string> };

  return api;
};

const NOTES_INDEX_KEY = "diaryx.notes.index";
const noteKey = (id: string) => `diaryx.note:${id}`;

beforeEach(() => {
  // Reset window + localStorage before each test
  // @ts-expect-error: test environment shim
  globalThis.window = { localStorage: makeLocalStorageMock() };
});

describe("diaryx-repository (localStorage)", () => {
  it("returns empty list when no notes are stored", async () => {
    const repo = createDiaryxRepository();
    const all = await repo.loadAll();
    expect(all).toEqual([]);
    const ids = await repo.listIds();
    expect(ids).toEqual([]);
  });

  it("saves a note and loads it back", async () => {
    const repo = createDiaryxRepository();
    const note = {
      id: "note-1",
      body: "# Hello",
      metadata: { title: "Hello" },
      lastModified: Date.now(),
    } as any;

    await repo.save(note);
    const ids = await repo.listIds();
    expect(ids).toEqual(["note-1"]);

    const all = await repo.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("note-1");
    expect(all[0].body).toBe("# Hello");
    expect(all[0].metadata?.title).toBe("Hello");
  });

  it("preserves insertion order for multiple notes", async () => {
    const repo = createDiaryxRepository();

    const a = { id: "a", body: "A", metadata: {}, lastModified: 1 } as any;
    const b = { id: "b", body: "B", metadata: {}, lastModified: 2 } as any;
    const c = { id: "c", body: "C", metadata: {}, lastModified: 3 } as any;

    await repo.save(a);
    await repo.save(b);
    await repo.save(c);

    const ids = await repo.listIds();
    expect(ids).toEqual(["a", "b", "c"]);

    const all = await repo.loadAll();
    expect(all.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("does not duplicate ids when saving the same note again", async () => {
    const repo = createDiaryxRepository();

    const note = { id: "dup", body: "once", metadata: {}, lastModified: 1 } as any;
    await repo.save(note);
    note.body = "twice";
    note.lastModified = 2;
    await repo.save(note);

    const ids = await repo.listIds();
    expect(ids).toEqual(["dup"]);

    const all = await repo.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].body).toBe("twice");
    expect(all[0].lastModified).toBe(2);
  });

  it("remove() deletes a note and updates the index", async () => {
    const repo = createDiaryxRepository();

    const a = { id: "a", body: "A", metadata: {}, lastModified: 1 } as any;
    const b = { id: "b", body: "B", metadata: {}, lastModified: 2 } as any;
    await repo.save(a);
    await repo.save(b);

    await repo.remove("a");

    const ids = await repo.listIds();
    expect(ids).toEqual(["b"]);

    const all = await repo.loadAll();
    expect(all.map((n) => n.id)).toEqual(["b"]);
  });

  it("clear() deletes all notes and resets the index", async () => {
    const repo = createDiaryxRepository();

    await repo.save({ id: "x", body: "X", metadata: {}, lastModified: 1 } as any);
    await repo.save({ id: "y", body: "Y", metadata: {}, lastModified: 2 } as any);

    await repo.clear();

    const ids = await repo.listIds();
    expect(ids).toEqual([]);

    const all = await repo.loadAll();
    expect(all).toEqual([]);
  });

  it("skips invalid note entries referenced by the index", async () => {
    const repo = createDiaryxRepository();
    const ls = window.localStorage as any;

    // Write an index with a good and a bad id
    ls.setItem(
      NOTES_INDEX_KEY,
      JSON.stringify(["good", "bad"])
    );

    // Good note payload
    ls.setItem(
      noteKey("good"),
      JSON.stringify({ id: "good", body: "ok", metadata: {}, lastModified: 1 })
    );

    // Bad note payload (invalid JSON or non-object)
    ls.setItem(noteKey("bad"), "not-json"); // readNote will catch and return undefined

    const all = await repo.loadAll();
    expect(all.map((n: any) => n.id)).toEqual(["good"]);
  });
});
