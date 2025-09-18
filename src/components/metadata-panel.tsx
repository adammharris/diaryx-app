import { component$, useSignal, useTask$, $ } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";
import yaml from "js-yaml";
import { stampNoteUpdated } from "../lib/diaryx/note-utils";
import {
  describeIssues,
  missingMetadataFields,
  normalizeDiaryxMetadata,
  REQUIRED_METADATA_FIELDS,
} from "../lib/diaryx/metadata-utils";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";
import type { DiaryxNote } from "../lib/diaryx/types";

const isEmptyMetadataValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const formatYaml = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, value]) => !isEmptyMetadataValue(value)
  );
  if (!entries.length) {
    return "";
  }
  return yaml.dump(Object.fromEntries(entries)).trimEnd();
};

const syncFrontmatter = (note: DiaryxNote, rawYaml: Signal<string>) => {
  const formatted = formatYaml(note.metadata);
  rawYaml.value = formatted;
  note.frontmatter = formatted || undefined;
};

const KNOWN_METADATA_KEYS = new Set<string>([
  ...REQUIRED_METADATA_FIELDS,
  "version",
  "copying",
  "contents",
  "part_of",
  "checksums",
  "banner",
  "language",
  "tags",
  "aliases",
  "this_file_is_root_index",
  "starred",
  "pinned",
  "visibility_emails",
]);

const VISIBILITY_SPECIAL_TERMS = new Set([
  "public",
  "private",
  "universal",
  "disposable",
]);

const toVisibilityArray = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const single = value.trim();
    return single ? [single] : [];
  }
  return [];
};

const formatExtraValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(", ");
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value == null ? "" : String(value);
};

const toList = (value: string | string[]): string =>
  Array.isArray(value) ? value.join("\n") : value;

const toValue = (value: string): string | string[] => {
  if (!value.includes("\n")) {
    return value.trim();
  }
  const parts = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length <= 1 ? (parts.at(0) ?? "") : parts;
};

const toInlineList = (value: string | string[] | undefined): string => {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean)
      .join(", ");
  }
  return value;
};

const normalizeEmailList = (emails: unknown): string[] => {
  if (!Array.isArray(emails)) {
    return [];
  }
  return Array.from(
    new Set(
      emails
        .map((email) =>
          typeof email === "string" ? email.trim().toLowerCase() : String(email || "").trim().toLowerCase()
        )
        .filter((email) => email.length > 0 && email.includes("@"))
    )
  );
};

const emailsMatch = (a: string[], b: string[]): boolean => {
  const normalizedA = Array.isArray(a) ? normalizeEmailList(a) : [];
  const normalizedB = Array.isArray(b) ? normalizeEmailList(b) : [];
  if (normalizedA.length !== normalizedB.length) {
    return false;
  }
  return normalizedA.every((email) => normalizedB.includes(email));
};

const setMetadataField = (
  note: DiaryxNote,
  key: keyof DiaryxNote["metadata"],
  value: unknown,
  rawYaml: Signal<string>,
  skipMetadataTimestamp = false
) => {
  const target = note.metadata as Record<string, unknown>;
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    delete target[key as string];
  } else {
    target[key as string] = value;
  }
  stampNoteUpdated(note, { skipMetadata: skipMetadataTimestamp });
  syncFrontmatter(note, rawYaml);
};

const applyRawYaml = (
  note: DiaryxNote,
  value: string,
  rawYaml: Signal<string>,
  yamlError: Signal<string | undefined>
) => {
  rawYaml.value = value;
  try {
    const parsed = yaml.load(value) ?? {};
    if (parsed && typeof parsed !== "object") {
      yamlError.value = "YAML must describe an object";
      return;
    }
    const { metadata, issues } = normalizeDiaryxMetadata(
      parsed as Record<string, unknown>
    );
    Object.assign(note.metadata, metadata);
    stampNoteUpdated(note, { skipMetadata: true });
    yamlError.value = describeIssues(issues);
    if (value.trim().length) {
      note.frontmatter = value;
      rawYaml.value = value;
    } else {
      note.frontmatter = undefined;
      syncFrontmatter(note, rawYaml);
    }
  } catch (error) {
    yamlError.value = error instanceof Error ? error.message : "Invalid YAML";
  }
};

const toDateTimeInputValue = (iso: string | undefined): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => input.toString().padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const fromDateTimeInputValue = (value: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
};

const isAutoUpdateEnabled = (note: DiaryxNote): boolean =>
  note.autoUpdateTimestamp !== false;

const toggleAutoUpdate = (
  note: DiaryxNote,
  enabled: boolean,
  rawYaml: Signal<string>
) => {
  note.autoUpdateTimestamp = enabled;
  if (enabled && !note.metadata.updated) {
    (note.metadata as Record<string, unknown>).updated = new Date().toISOString();
  }
  stampNoteUpdated(note, { skipMetadata: true });
  syncFrontmatter(note, rawYaml);
};

export const MetadataPanel = component$(() => {
  const session = useDiaryxSession();
  const libraryMode = session.ui.libraryMode;
  const note =
    libraryMode === "shared"
      ? session.sharedNotes.find((item) => item.id === session.sharedActiveNoteId)
      : session.notes.find((item) => item.id === session.activeNoteId);
  const isSharedView = libraryMode === "shared";
  const activeTab = useSignal<"details" | "raw">("details");
  const rawYaml = useSignal("");
  const yamlError = useSignal<string | undefined>(undefined);
  const openVisibilityTerm = useSignal<string | "__new__" | null>(null);
  const newVisibilityTerm = useSignal("");
  const newVisibilityEmail = useSignal("");

  if (!note) {
    return (
      <aside class="metadata-panel empty">
        <p>{isSharedView ? "No shared note selected." : "No note selected."}</p>
      </aside>
    );
  }

  const updateEmailsForTerm = $((term: string, emails: string[]) => {
    if (!note) return;
    const normalizedTerm = term.trim();
    if (!normalizedTerm) return;
    const uniqueEmails = normalizeEmailList(emails);
    const current = note.metadata.visibility_emails
      ? { ...(note.metadata.visibility_emails as Record<string, string[]>) }
      : {};
    if (uniqueEmails.length) {
      current[normalizedTerm] = uniqueEmails;
    } else {
      delete current[normalizedTerm];
    }
    if (Object.keys(current).length === 0) {
      setMetadataField(note, "visibility_emails", undefined, rawYaml, true);
    } else {
      setMetadataField(note, "visibility_emails", current, rawYaml, true);
    }

    const aggregated = new Map<string, Set<string>>();
    for (const item of session.notes) {
      const terms = toVisibilityArray(item.metadata.visibility);
      const emailsMap = (item.metadata.visibility_emails as Record<string, string[]>) ?? {};
      for (const itemTerm of terms) {
        const normalizedItemTerm = itemTerm.trim();
        if (!normalizedItemTerm) continue;
        const emailsForTerm = emailsMap[normalizedItemTerm] ?? [];
        if (!emailsForTerm.length) continue;
        const set = aggregated.get(normalizedItemTerm) ?? new Set<string>();
        for (const email of emailsForTerm) {
          const normalizedEmail = email.trim().toLowerCase();
          if (normalizedEmail) {
            set.add(normalizedEmail);
          }
        }
        aggregated.set(normalizedItemTerm, set);
      }
    }

    session.sharedVisibilityEmails = Object.fromEntries(
      Array.from(aggregated.entries()).map(([sharedTerm, set]) => [
        sharedTerm,
        Array.from(set.values()),
      ])
    );
  });

  useTask$(({ track }) => {
    const mode = track(() => session.ui.libraryMode);
    if (mode === "shared") {
      track(() => session.sharedActiveNoteId);
      track(() => session.sharedNotes.length);
      track(() => session.sharedNotesState.lastFetchedAt);
      const current = session.sharedNotes.find(
        (item) => item.id === session.sharedActiveNoteId
      );
      if (current) {
        rawYaml.value = current.frontmatter ?? formatYaml(current.metadata);
      } else {
        rawYaml.value = "";
      }
      yamlError.value = undefined;
      openVisibilityTerm.value = null;
      newVisibilityTerm.value = "";
      newVisibilityEmail.value = "";
      return;
    }

    track(() => session.activeNoteId);
    const current = session.notes.find((item) => item.id === session.activeNoteId);
    if (current) {
      syncFrontmatter(current, rawYaml);
      yamlError.value = undefined;
      openVisibilityTerm.value = null;
      newVisibilityTerm.value = "";
      newVisibilityEmail.value = "";

      const sharedEmailsMap = session.sharedVisibilityEmails;
      if (sharedEmailsMap) {
        const terms = toVisibilityArray(current.metadata.visibility);
        for (const term of terms) {
          const sharedEmails = sharedEmailsMap[term];
          if (!sharedEmails?.length) continue;
          const currentEmails =
            ((current.metadata.visibility_emails as Record<string, string[]>) ?? {})[
              term
            ] ?? [];
          if (!emailsMatch(currentEmails, sharedEmails)) {
            updateEmailsForTerm(term, sharedEmails);
          }
        }
      }
    }
  });

  useTask$(({ track }) => {
    track(() => session.ui.libraryMode);
    if (session.ui.libraryMode === "shared") {
      newVisibilityEmail.value = "";
      return;
    }
    track(() => openVisibilityTerm.value);
    newVisibilityEmail.value = "";
  });

  if (!note) {
    return (
      <aside class="metadata-panel empty">
        <p>No note selected.</p>
      </aside>
    );
  }

  if (isSharedView) {
    const visibilityList = toVisibilityArray(note.metadata.visibility);
    const visibilityEmailsMap =
      (note.metadata.visibility_emails as Record<string, string[]>) ?? {};
    const extraEntries = Object.entries(note.metadata).filter(
      ([key]) => !KNOWN_METADATA_KEYS.has(key)
    );
    const authorDisplay = toInlineList(note.metadata.author);
    const formatDisplay = toInlineList(note.metadata.format);
    const reachableDisplay = toInlineList(note.metadata.reachable);
    const tagsDisplay = Array.isArray(note.metadata.tags)
      ? note.metadata.tags.join(", ")
      : "";
    const aliasesDisplay = Array.isArray(note.metadata.aliases)
      ? note.metadata.aliases.join(", ")
      : "";

    return (
      <aside
        class={{ "metadata-panel": true, collapsed: !session.ui.showMetadata }}
        aria-hidden={session.ui.showMetadata ? "false" : "true"}
      >
        <header>
          <h2>Info</h2>
          <div class="tabs">
            <button
              type="button"
              class={{ active: activeTab.value === "details" }}
              onClick$={() => (activeTab.value = "details")}
            >
              Details
            </button>
            <button
              type="button"
              class={{ active: activeTab.value === "raw" }}
              onClick$={() => (activeTab.value = "raw")}
            >
              YAML
            </button>
          </div>
        </header>
        {activeTab.value === "details" ? (
          <div class="details readonly">
            <dl class="metadata-readonly">
              <div>
                <dt>Title</dt>
                <dd>{note.metadata.title}</dd>
              </div>
              <div>
                <dt>Author</dt>
                <dd>{authorDisplay || "—"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{note.metadata.created || "—"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{note.metadata.updated || "—"}</dd>
              </div>
              <div>
                <dt>Visibility</dt>
                <dd>
                  {visibilityList.length ? (
                    <ul class="readonly-visibility">
                      {visibilityList.map((term) => {
                        const emails = visibilityEmailsMap[term] ?? [];
                        return (
                          <li key={term}>
                            <span class="visibility-term">{term}</span>
                            {emails.length > 0 && (
                              <span class="visibility-emails">{emails.join(", ")}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <span>None</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{formatDisplay || "—"}</dd>
              </div>
              <div>
                <dt>Reachable</dt>
                <dd>{reachableDisplay || "—"}</dd>
              </div>
              <div>
                <dt>Tags</dt>
                <dd>{tagsDisplay || "—"}</dd>
              </div>
              <div>
                <dt>Aliases</dt>
                <dd>{aliasesDisplay || "—"}</dd>
              </div>
              {note.metadata.this_file_is_root_index !== undefined && (
                <div>
                  <dt>Root index</dt>
                  <dd>{note.metadata.this_file_is_root_index ? "Yes" : "No"}</dd>
                </div>
              )}
              {note.metadata.starred !== undefined && (
                <div>
                  <dt>Starred</dt>
                  <dd>{note.metadata.starred ? "Yes" : "No"}</dd>
                </div>
              )}
              {note.metadata.pinned !== undefined && (
                <div>
                  <dt>Pinned</dt>
                  <dd>{note.metadata.pinned ? "Yes" : "No"}</dd>
                </div>
              )}
            </dl>
            {extraEntries.length > 0 && (
              <section class="additional-properties readonly">
                <header>
                  <h3>Additional properties</h3>
                </header>
                <ul>
                  {extraEntries.map(([key, value]) => (
                    <li key={key}>
                      <span class="extra-key">{key}</span>
                      <span class="extra-value">{formatExtraValue(value)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div class="raw-editor readonly">
            <textarea value={rawYaml.value} readOnly />
          </div>
        )}
      </aside>
    );
  }

  const missingRequired = missingMetadataFields(note.metadata);
  const extraEntries = Object.entries(note.metadata).filter(
    ([key]) => !KNOWN_METADATA_KEYS.has(key)
  );
  const autoUpdate = isAutoUpdateEnabled(note);

  return (
    <aside
      class={{ "metadata-panel": true, collapsed: !session.ui.showMetadata }}
      aria-hidden={session.ui.showMetadata ? "false" : "true"}
    >
      <header>
        <h2>Info</h2>
        <div class="tabs">
          <button
            type="button"
            class={{ active: activeTab.value === "details" }}
            onClick$={() => (activeTab.value = "details")}
          >
            Details
          </button>
          <button
            type="button"
            class={{ active: activeTab.value === "raw" }}
            onClick$={() => (activeTab.value = "raw")}
          >
            YAML
          </button>
        </div>
      </header>
      {activeTab.value === "details" ? (
        <form class="details" preventdefault:submit>
          <label>
            <span class="field-heading">
              <span>Title</span>
              {missingRequired.has("title") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            <input
              value={note.metadata.title}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "title",
                  (event.target as HTMLInputElement).value,
                  rawYaml
                )
              }
            />
          </label>
          <label>
            <span class="field-heading">
              <span>Author</span>
              {missingRequired.has("author") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            <textarea
              value={toList(note.metadata.author)}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "author",
                  toValue((event.target as HTMLTextAreaElement).value),
                  rawYaml
                )
              }
            />
          </label>
          <label>
            <span class="field-heading">
              <span>Created</span>
              {missingRequired.has("created") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            <div class="timestamp-field">
              <input
                type="datetime-local"
                step="60"
                value={toDateTimeInputValue(note.metadata.created)}
                onInput$={(event) => {
                  const target = event.target as HTMLInputElement;
                  const iso = fromDateTimeInputValue(target.value);
                  setMetadataField(note, "created", iso, rawYaml, true);
                }}
              />
            </div>
          </label>
          <label>
            <span class="field-heading">
              <span>Updated</span>
              {missingRequired.has("updated") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            <div class="timestamp-field">
              <input
                type="datetime-local"
                step="60"
                value={toDateTimeInputValue(note.metadata.updated)}
                onInput$={(event) => {
                  const target = event.target as HTMLInputElement;
                  const iso = fromDateTimeInputValue(target.value);
                  setMetadataField(note, "updated", iso, rawYaml, true);
                }}
              />
              <label class={{ "auto-update-toggle": true, active: autoUpdate }}>
                <input
                  type="checkbox"
                  checked={autoUpdate}
                  onInput$={(event) =>
                    toggleAutoUpdate(
                      note,
                      (event.target as HTMLInputElement).checked,
                      rawYaml
                    )
                  }
                />
                <span>Auto update</span>
              </label>
            </div>
          </label>
          <div class="visibility-editor">
            <span class="field-heading">
              <span>Visibility</span>
              {missingRequired.has("visibility") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            {(() => {
              const visibilityList = toVisibilityArray(note.metadata.visibility);
              const visibilityEmailsMap =
                (note.metadata.visibility_emails as Record<string, string[]>) ?? {};
              const suggestionList = Array.from(
                new Set(
                  session.notes
                    .filter((item) => item.id !== note.id)
                    .flatMap((item) => toVisibilityArray(item.metadata.visibility))
                    .map((term) => term.trim())
                    .filter((term) => term.length > 0)
                )
              )
                .filter((term) => !visibilityList.includes(term))
                .slice(0, 8);

              const activeVisibilityTerm =
                openVisibilityTerm.value && openVisibilityTerm.value !== "__new__"
                  ? openVisibilityTerm.value
                  : null;
              const activeEmails = activeVisibilityTerm
                ? visibilityEmailsMap[activeVisibilityTerm] ?? []
                : [];
              const isActiveSpecial = activeVisibilityTerm
                ? VISIBILITY_SPECIAL_TERMS.has(activeVisibilityTerm.toLowerCase())
                : false;

              const applyVisibilityValues = $((values: string[]) => {
                if (!note) return;
                const unique = Array.from(
                  new Set(values.map((term) => term.trim()).filter(Boolean))
                );
                if (!unique.length) {
                  setMetadataField(note, "visibility", "", rawYaml);
                } else if (unique.length === 1) {
                  setMetadataField(note, "visibility", unique.at(0) ?? "", rawYaml);
                } else {
                  setMetadataField(note, "visibility", unique, rawYaml);
                }

                const emails = note.metadata.visibility_emails
                  ? { ...(note.metadata.visibility_emails as Record<string, string[]>) }
                  : undefined;
                if (emails) {
                  let changed = false;
                  for (const key of Object.keys(emails)) {
                    if (!unique.includes(key)) {
                      delete emails[key];
                      changed = true;
                    }
                  }
                  if (changed) {
                    if (Object.keys(emails).length === 0) {
                      setMetadataField(note, "visibility_emails", undefined, rawYaml, true);
                    } else {
                      setMetadataField(note, "visibility_emails", emails, rawYaml, true);
                    }
                  }
                }

                if (
                  openVisibilityTerm.value &&
                  openVisibilityTerm.value !== "__new__" &&
                  !unique.includes(openVisibilityTerm.value)
                ) {
                  openVisibilityTerm.value = null;
                }

                const aggregated = new Map<string, Set<string>>();
                for (const item of session.notes) {
                  const terms = toVisibilityArray(item.metadata.visibility);
                  const emailsMap =
                    (item.metadata.visibility_emails as Record<string, string[]>) ?? {};
                  for (const term of terms) {
                    const normalizedTerm = term.trim();
                    if (!normalizedTerm) continue;
                    const termEmails = emailsMap[normalizedTerm] ?? [];
                    if (!termEmails.length) continue;
                    const set = aggregated.get(normalizedTerm) ?? new Set<string>();
                    for (const email of termEmails) {
                      const normalizedEmail = email.trim().toLowerCase();
                      if (normalizedEmail) {
                        set.add(normalizedEmail);
                      }
                    }
                    aggregated.set(normalizedTerm, set);
                  }
                }

                session.sharedVisibilityEmails = Object.fromEntries(
                  Array.from(aggregated.entries()).map(([term, set]) => [
                    term,
                    Array.from(set.values()),
                  ])
                );
              });

              return (
                <div class="visibility-controls">
                  <div class="visibility-badges">
                    {visibilityList.map((term) => {
                      const emailCount = visibilityEmailsMap[term]?.length ?? 0;
                      const isSpecial = VISIBILITY_SPECIAL_TERMS.has(term.toLowerCase());
                      return (
                        <div class="visibility-badge-wrapper" key={term}>
                          <button
                            type="button"
                            class="visibility-badge"
                            data-active={openVisibilityTerm.value === term ? "true" : undefined}
                            data-special={isSpecial ? "true" : undefined}
                            onClick$={() => {
                              openVisibilityTerm.value =
                                openVisibilityTerm.value === term ? null : term;
                            }}
                          >
                            <span class="badge-label">{term}</span>
                            {!isSpecial && emailCount > 0 && (
                              <span class="badge-count">{emailCount}</span>
                            )}
                          </button>
                          <button
                            type="button"
                            class="visibility-remove"
                            aria-label={`Remove visibility term ${term}`}
                            onClick$={$(() => {
                              const next = visibilityList.filter((value) => value !== term);
                              applyVisibilityValues(next);
                            })}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      class="visibility-add"
                      onClick$={() => {
                        openVisibilityTerm.value = "__new__";
                        newVisibilityTerm.value = "";
                      }}
                    >
                      + Add visibility
                    </button>
                  </div>
                  {openVisibilityTerm.value === "__new__" && (
                    <div class="visibility-new">
                      <div class="visibility-new-row">
                        <input
                          type="text"
                          placeholder="Enter visibility term"
                          value={newVisibilityTerm.value}
                          onInput$={(event) =>
                            (newVisibilityTerm.value = (
                              event.target as HTMLInputElement
                            ).value)
                          }
                        />
                        <button
                          type="button"
                          onClick$={$(() => {
                            const normalized = newVisibilityTerm.value.trim();
                            if (!normalized) return;
                            const sharedEmailsForTerm =
                              session.sharedVisibilityEmails[normalized];
                            if (visibilityList.includes(normalized)) {
                              openVisibilityTerm.value = normalized;
                              newVisibilityTerm.value = "";
                              if (sharedEmailsForTerm?.length) {
                                updateEmailsForTerm(normalized, sharedEmailsForTerm);
                              }
                              return;
                            }
                            const next = [...visibilityList, normalized];
                            applyVisibilityValues(next);
                            openVisibilityTerm.value = normalized;
                            newVisibilityTerm.value = "";
                            if (sharedEmailsForTerm?.length) {
                              updateEmailsForTerm(normalized, sharedEmailsForTerm);
                            }
                          })}
                        >
                          Add term
                        </button>
                      </div>
                      {suggestionList.length > 0 && (
                        <div class="visibility-suggestions">
                          <span>Suggestions:</span>
                          <div class="visibility-suggestion-list">
                            {suggestionList.map((term) => (
                              <button
                                key={term}
                                type="button"
                                onClick$={$(() => {
                                  const normalized = term.trim();
                                  if (!normalized) return;
                                  const sharedEmailsForTerm =
                                    session.sharedVisibilityEmails[normalized];
                                  if (visibilityList.includes(normalized)) {
                                    openVisibilityTerm.value = normalized;
                                    if (sharedEmailsForTerm?.length) {
                                      updateEmailsForTerm(normalized, sharedEmailsForTerm);
                                    }
                                    return;
                                  }
                                  const next = [...visibilityList, normalized];
                                  applyVisibilityValues(next);
                                  openVisibilityTerm.value = normalized;
                                  if (sharedEmailsForTerm?.length) {
                                    updateEmailsForTerm(normalized, sharedEmailsForTerm);
                                  }
                                })}
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {activeVisibilityTerm && (
                    <div class="visibility-term-panel">
                      <header>
                        <span class="term-title">{activeVisibilityTerm}</span>
                        {!isActiveSpecial && (
                          <span class="term-description">
                            {activeEmails.length} recipient
                            {activeEmails.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </header>
                      {isActiveSpecial ? (
                        <p class="visibility-term-info">
                          This is a special Diaryx visibility setting managed by the
                          platform.
                        </p>
                      ) : (
                        <div class="visibility-term-editor">
                          <div class="visibility-email-chips">
                            {activeEmails.length ? (
                              activeEmails.map((email) => (
                                <span key={email} class="email-chip">
                                  {email}
                                  <button
                                    type="button"
                                    aria-label={`Remove ${email}`}
                                    onClick$={$(() => {
                                      const current =
                                        (note.metadata.visibility_emails?.[
                                          activeVisibilityTerm
                                        ] as string[] | undefined) ?? [];
                                      updateEmailsForTerm(
                                        activeVisibilityTerm,
                                        current.filter((value) => value !== email)
                                      );
                                    })}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                            ) : (
                              <p class="visibility-term-hint">No recipients yet.</p>
                            )}
                          </div>
                          <div class="visibility-email-add">
                            <input
                              type="email"
                              placeholder="Add email"
                              value={newVisibilityEmail.value}
                              onInput$={(event) =>
                                (newVisibilityEmail.value = (
                                  event.target as HTMLInputElement
                                ).value)
                              }
                              onKeyDown$={(event) => {
                                if ((event as KeyboardEvent).key === "Enter") {
                                  event.preventDefault();
                                  const normalizedEmail = normalizeEmailList([
                                    newVisibilityEmail.value,
                                  ]).at(0);
                                  if (!normalizedEmail) {
                                    return;
                                  }
                                  const current =
                                    (note.metadata.visibility_emails?.[
                                      activeVisibilityTerm
                                    ] as string[] | undefined) ?? [];
                                  if (current.includes(normalizedEmail)) {
                                    newVisibilityEmail.value = "";
                                    return;
                                  }
                                  updateEmailsForTerm(
                                    activeVisibilityTerm,
                                    [...current, normalizedEmail]
                                  );
                                  newVisibilityEmail.value = "";
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick$={$(() => {
                                const normalizedEmail = normalizeEmailList([
                                  newVisibilityEmail.value,
                                ]).at(0);
                                if (!normalizedEmail) return;
                                const current =
                                  (note.metadata.visibility_emails?.[
                                    activeVisibilityTerm
                                  ] as string[] | undefined) ?? [];
                                if (current.includes(normalizedEmail)) {
                                  newVisibilityEmail.value = "";
                                  return;
                                }
                                updateEmailsForTerm(activeVisibilityTerm, [
                                  ...current,
                                  normalizedEmail,
                                ]);
                                newVisibilityEmail.value = "";
                              })}
                            >
                              Add email
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <label>
            <span class="field-heading">
              <span>Format</span>
              {missingRequired.has("format") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            <textarea
              value={toList(note.metadata.format)}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "format",
                  toValue((event.target as HTMLTextAreaElement).value),
                  rawYaml
                )
              }
            />
          </label>
          <label>
            <span class="field-heading">
              <span>Reachable</span>
              {missingRequired.has("reachable") && (
                <span
                  class="field-warning"
                  role="img"
                  aria-label="Missing required metadata"
                  title="Missing required metadata"
                >
                  ⚠︎
                </span>
              )}
            </span>
            <textarea
              value={toList(note.metadata.reachable)}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "reachable",
                  toValue((event.target as HTMLTextAreaElement).value),
                  rawYaml
                )
              }
            />
          </label>
          <label>
            <span>Tags</span>
            <input
              value={(note.metadata.tags ?? []).join(", ")}
              placeholder="Comma separated"
              onInput$={(event) => {
                const value = (event.target as HTMLInputElement).value;
                setMetadataField(
                  note,
                  "tags",
                  value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  rawYaml
                );
              }}
            />
          </label>
          <label>
            <span>Aliases</span>
            <input
              value={(note.metadata.aliases ?? []).join(", ")}
              placeholder="Comma separated"
              onInput$={(event) => {
                const value = (event.target as HTMLInputElement).value;
                setMetadataField(
                  note,
                  "aliases",
                  value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                  rawYaml
                );
              }}
            />
          </label>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={note.metadata.this_file_is_root_index === true}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "this_file_is_root_index",
                  (event.target as HTMLInputElement).checked,
                  rawYaml
                )
              }
            />
            <span>Root index</span>
          </label>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={note.metadata.starred === true}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "starred",
                  (event.target as HTMLInputElement).checked,
                  rawYaml
                )
              }
            />
            <span>Starred</span>
          </label>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={note.metadata.pinned === true}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "pinned",
                  (event.target as HTMLInputElement).checked,
                  rawYaml
                )
              }
            />
            <span>Pinned</span>
          </label>
          {extraEntries.length > 0 && (
            <section class="additional-properties">
              <header>
                <h3>Additional properties</h3>
                <p>Edit in the YAML tab</p>
              </header>
              <ul>
                {extraEntries.map(([key, value]) => (
                  <li key={key}>
                    <span class="extra-key">{key}</span>
                    <span class="extra-value">{formatExtraValue(value)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </form>
      ) : (
        <div class="raw-editor">
          <textarea
            value={rawYaml.value}
            onInput$={(event) =>
              applyRawYaml(
                note,
                (event.target as HTMLTextAreaElement).value,
                rawYaml,
                yamlError
              )
            }
          />
          {yamlError.value && <p class="error">{yamlError.value}</p>}
        </div>
      )}
    </aside>
  );
});
