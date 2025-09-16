import { component$, useSignal, useTask$ } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";
import yaml from "js-yaml";
import { stampNoteUpdated } from "../lib/diaryx/note-utils";
import { validateDiaryxMetadata } from "../lib/diaryx/validation";
import { useDiaryxSession } from "../lib/state/use-diaryx-session";
import type { DiaryxNote } from "../lib/diaryx/types";

const formatYaml = (data: unknown): string => yaml.dump(data).trimEnd();

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
  rawYaml.value = formatYaml(note.metadata);
  note.frontmatter = rawYaml.value;
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
    const result = validateDiaryxMetadata(parsed);
    if (!result.success || !result.metadata) {
      yamlError.value = result.issues.map((issue) => issue.message).join("; ");
      return;
    }
    Object.assign(note.metadata, result.metadata);
    stampNoteUpdated(note, { skipMetadata: true });
    yamlError.value = undefined;
    note.frontmatter = formatYaml(note.metadata);
  } catch (error) {
    yamlError.value = error instanceof Error ? error.message : "Invalid YAML";
  }
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
      rawYaml.value = formatYaml(current.metadata);
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
            <span>Title</span>
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
            <span>Author</span>
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
            <span>Created</span>
            <input
              value={note.metadata.created}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "created",
                  (event.target as HTMLInputElement).value,
                  rawYaml,
                  true
                )
              }
            />
          </label>
          <label>
            <span>Updated</span>
            <input
              value={note.metadata.updated}
              onInput$={(event) =>
                setMetadataField(
                  note,
                  "updated",
                  (event.target as HTMLInputElement).value,
                  rawYaml,
                  true
                )
              }
            />
          </label>
          <label>
            <span>Visibility</span>
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
            <span>Format</span>
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
            <span>Reachable</span>
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
