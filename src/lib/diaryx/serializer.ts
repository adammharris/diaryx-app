import yaml from "js-yaml";
import MarkdownIt from "markdown-it";
import type {
  DiaryxHtmlExportOptions,
  DiaryxNote,
  DiaryxSerializeOptions,
} from "./types";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const toYaml = (metadata: Record<string, unknown>): string =>
  yaml
    .dump(metadata, {
      lineWidth: 1000,
      skipInvalid: true,
      quotingType: '"',
    })
    .trimEnd();

export const stringifyDiaryxNote = (
  note: DiaryxNote,
  options: DiaryxSerializeOptions = {}
): string => {
  const includeFrontmatter = options.includeFrontmatter ?? true;
  if (!includeFrontmatter) {
    return note.body;
  }

  const yamlString = toYaml(note.metadata);
  const fmWrapped = `---\n${yamlString}\n---\n\n`;
  return `${fmWrapped}${note.body}`;
};

const formatMetadataValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
};

export const exportDiaryxNoteToHtml = (
  note: DiaryxNote,
  options: DiaryxHtmlExportOptions = {}
): string => {
  const theme = options.theme ?? "light";
  const includeMetadataPanel = options.includeMetadataPanel ?? true;

  const bodyHtml = md.render(note.body);
  const metadata = includeMetadataPanel
    ? Object.entries(note.metadata)
    : [];

  const metadataTable = includeMetadataPanel
    ? `<section class="metadata">${metadata
        .map(
          ([key, value]) => `
            <div class="metadata-row">
              <dt>${key}</dt>
              <dd>${formatMetadataValue(value)}</dd>
            </div>
          `
        )
        .join("")}
      </section>`
    : "";

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${note.metadata.title}</title>
    <style>
      :root {
        color-scheme: ${theme === "dark" ? "dark" : "light"};
        font-family: "SF Pro", "Inter", "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 2rem;
        background: ${theme === "dark" ? "#050505" : "#f3f4f6"};
        color: ${theme === "dark" ? "#f5f5f5" : "#111"};
        display: grid;
        gap: 2rem;
        justify-content: center;
      }
      main {
        max-width: 680px;
        padding: 2.5rem;
        border-radius: 24px;
        background: rgba(${theme === "dark" ? "17, 17, 17, 0.75" : "255, 255, 255, 0.8"});
        backdrop-filter: blur(24px);
        box-shadow: 0 30px 60px -45px rgba(15, 23, 42, 0.6);
      }
      h1, h2, h3, h4, h5, h6 {
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      section.metadata {
        display: grid;
        gap: 0.75rem;
        padding: 1.5rem;
        border-radius: 18px;
        background: rgba(${theme === "dark" ? "40, 40, 40, 0.5" : "248, 250, 252, 0.75"});
      }
      section.metadata .metadata-row {
        display: flex;
        gap: 1rem;
        align-items: baseline;
      }
      section.metadata dt {
        font-weight: 600;
        width: 160px;
        text-transform: capitalize;
      }
      section.metadata dd {
        margin: 0;
        color: inherit;
        flex: 1;
        white-space: pre-wrap;
      }
      article {
        line-height: 1.65;
        font-size: 1.05rem;
      }
      a {
        color: ${theme === "dark" ? "#93c5fd" : "#2563eb"};
      }
      code {
        background: rgba(${theme === "dark" ? "255, 255, 255, 0.08" : "15, 23, 42, 0.08"});
        padding: 0.25rem 0.5rem;
        border-radius: 8px;
        font-size: 0.92rem;
      }
      pre {
        padding: 1rem;
        border-radius: 16px;
        background: rgba(${theme === "dark" ? "15, 23, 42, 0.9" : "15, 23, 42, 0.12"});
        overflow-x: auto;
      }
    </style>
  </head>
  <body>
    ${metadataTable}
    <main>
      <article>
        ${bodyHtml}
      </article>
    </main>
  </body>
</html>`;
};
