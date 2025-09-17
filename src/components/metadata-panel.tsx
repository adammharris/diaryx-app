import { component$, useSignal, useTask$ } from "@builder.io/qwik";
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
]);

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
  return parts.length <= 1 ? (parts[0] ?? "") : parts;
};

const setMetadataField = (
  note: DiaryxNote,
  key: keyof DiaryxNote["metadata"],
  value: unknown,
  rawYaml: Signal<string>,
  skipMetadataTimestamp = false
) => {
  (note.metadata as Record<string, unknown>)[key] = value;
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
  const note = session.notes.find((item) => item.id === session.activeNoteId);
  const activeTab = useSignal<"details" | "raw">("details");
  const rawYaml = useSignal("");
  const yamlError = useSignal<string | undefined>(undefined);

  useTask$(({ track }) => {
    track(() => session.activeNoteId);
    const current = session.notes.find((item) => item.id === session.activeNoteId);
    if (current) {
      syncFrontmatter(current, rawYaml);
      yamlError.value = undefined;
    }
  });

  if (!note) {
    return (
      <aside class="metadata-panel empty">
        <p>No note selected.</p>
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
          <label>
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
            <textarea
              value={toList(note.metadata.visibility)}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "visibility",
                  toValue((event.target as HTMLTextAreaElement).value),
                  rawYaml
                )
              }
            />
          </label>
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
