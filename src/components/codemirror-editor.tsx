import {
  component$,
  useVisibleTask$,
  useSignal,
  type PropFunction,
} from "@builder.io/qwik";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { history } from "@codemirror/commands";
import {
  keymap,
  EditorView,
  ViewPlugin,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { RangeSetBuilder } from "@codemirror/state";
import { tags } from "@lezer/highlight";

const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const presentationCompartment = new Compartment();

const CODE_FONT_STACK =
  'SFMono-Regular, "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
const PROSE_FONT_STACK =
  '"SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif';

const baseExtensions = [
  history(),
  keymap.of([indentWithTab]),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  EditorState.allowMultipleSelections.of(true),
  presentationCompartment.of([]),
];

const defaultTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: CODE_FONT_STACK,
      lineHeight: "1.55",
      fontSize: "0.95rem",
    },
    ".cm-content": {
      padding: "1.25rem 1.5rem",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(148, 163, 184, 0.15)",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(59, 130, 246, 0.18)",
    },
  },
  { dark: false }
);

const livePreviewTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: PROSE_FONT_STACK,
      lineHeight: "1.5",
      fontSize: "1.05rem",
      paddingBottom: "4rem",
    },
    ".cm-content": {
      padding: "1.5rem 2rem",
      maxWidth: "72ch",
    },
    ".cm-line": {
      padding: "0.18rem 0",
      position: "relative",
    },
    "&.cm-focused .cm-cursor": {
      borderLeft: "2px solid var(--text-primary)",
    },
    ".cm-header, .cm-heading": {
      fontFamily: PROSE_FONT_STACK,
      fontWeight: "700",
      letterSpacing: "-0.015em",
      display: "block",
      textDecoration: "none",
      color: "inherit",
    },
    ".cm-header *, .cm-heading *": {
      textDecoration: "none",
    },
    ".cm-header.cm-header-1, .cm-heading.cm-heading1": {
      fontSize: "2.4rem",
      lineHeight: "1.2",
      marginTop: "2.6rem",
      marginBottom: "1.25rem",
    },
    ".cm-header.cm-header-2, .cm-heading.cm-heading2": {
      fontSize: "1.9rem",
      lineHeight: "1.25",
      marginTop: "2.2rem",
      marginBottom: "1rem",
    },
    ".cm-header.cm-header-3, .cm-heading.cm-heading3": {
      fontSize: "1.5rem",
      lineHeight: "1.3",
      marginTop: "1.8rem",
      marginBottom: "0.85rem",
    },
    ".cm-header.cm-header-4, .cm-heading.cm-heading4": {
      fontSize: "1.3rem",
      lineHeight: "1.35",
      marginTop: "1.5rem",
      marginBottom: "0.7rem",
    },
    ".cm-header.cm-header-5, .cm-heading.cm-heading5": {
      fontSize: "1.2rem",
      fontWeight: "600",
      marginTop: "1.4rem",
      marginBottom: "0.6rem",
    },
    ".cm-header.cm-header-6, .cm-heading.cm-heading6": {
      fontSize: "1.1rem",
      fontWeight: "600",
      marginTop: "1.3rem",
      marginBottom: "0.6rem",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
    },
    ".cm-strong": {
      fontWeight: "600",
    },
    ".cm-em": {
      fontStyle: "italic",
    },
    ".cm-quote": {
      borderLeft: "4px solid rgba(148, 163, 184, 0.45)",
      paddingLeft: "0.85rem",
      fontStyle: "italic",
      color: "rgba(71, 85, 105, 0.95)",
    },
    ".cm-list": {
      paddingLeft: "1.5rem",
    },
    ".cm-list .cm-line::marker": {
      color: "rgba(71, 85, 105, 0.8)",
    },
    ".cm-listBullet::before": {
      content: '"•"',
      marginRight: "0.75rem",
    },
    ".cm-taskMarker": {
      marginRight: "0.75rem",
    },
    ".cm-codeBlock": {
      fontFamily: CODE_FONT_STACK,
      borderRadius: "14px",
      background: "rgba(15, 23, 42, 0.08)",
      padding: "1rem 1.25rem",
      boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.05)",
    },
    ".cm-inlineCode": {
      fontFamily: CODE_FONT_STACK,
      background: "rgba(148, 163, 184, 0.2)",
      padding: "0.2rem 0.4rem",
      borderRadius: "8px",
      fontSize: "0.95rem",
    },
    ".cm-hr": {
      border: "none",
      borderTop: "1px solid rgba(148, 163, 184, 0.5)",
      margin: "2rem 0",
    },
    ".cm-frontmatter": {
      fontFamily: CODE_FONT_STACK,
      background: "rgba(15, 23, 42, 0.05)",
      padding: "1rem 1.25rem",
      borderRadius: "16px",
      marginBottom: "1.5rem",
    },
    ".cm-markdownMarker": {
      opacity: 0,
      transition: "opacity 120ms ease",
    },
    ".cm-activeLine .cm-markdownMarker": {
      opacity: 1,
    },
  },
  { dark: false }
);

const hiddenMarkerDecoration = Decoration.replace({});

const headingLineDecorations = Array.from({ length: 6 }, (_, index) =>
  Decoration.line({ class: `cm-header cm-header-${index + 1}` })
);

const livePreviewHighlightStyle = HighlightStyle.define([
  {
    tag: [
      tags.heading,
      tags.heading1,
      tags.heading2,
      tags.heading3,
      tags.heading4,
      tags.heading5,
      tags.heading6,
    ],
    textDecoration: "none",
  },
]);

const inlineMarkerRegex = /(`{1,3}|\*\*|__|~~|\*|_)/g;

class BulletWidget extends WidgetType {
  constructor(private char = "•") {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.char;
    span.style.marginRight = "0.75rem";
    span.style.color = "rgba(71, 85, 105, 0.8)";
    return span;
  }
}

class OrderedWidget extends WidgetType {
  constructor(private label: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.label;
    span.style.marginRight = "0.75rem";
    span.style.color = "rgba(71, 85, 105, 0.8)";
    return span;
  }
}

class TaskWidget extends WidgetType {
  constructor(private checked: boolean) {
    super();
  }

  toDOM() {
    const box = document.createElement("span");
    box.textContent = this.checked ? "☑" : "☐";
    box.style.marginRight = "0.75rem";
    box.style.fontSize = "0.95rem";
    box.style.color = "rgba(71, 85, 105, 0.9)";
    return box;
  }
}

const hideMarkdownMarkersPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: { view: EditorView; docChanged: boolean; selectionSet: boolean; viewportChanged: boolean }) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const doc = view.state.doc;
      const activeLines = new Set<number>();

      for (const range of view.state.selection.ranges) {
        const fromLine = doc.lineAt(range.from).number;
        const toLine = doc.lineAt(range.to).number;
        for (let line = fromLine; line <= toLine; line++) {
          activeLines.add(line);
        }
      }

      const visible = view.visibleRanges;

      for (const { from, to } of visible) {
        let line = doc.lineAt(from);
        while (line.from <= to) {
          const text = line.text;
          const base = line.from;

          const headingMatch = /^\s{0,3}(#{1,6})(?=\s)/.exec(text);
          let headingWhitespaceLength = 0;
          if (headingMatch) {
            const level = Math.min(headingMatch[1].length, 6);
            builder.add(base, base, headingLineDecorations[level - 1]);
            const afterHashes = text.slice(
              headingMatch.index + headingMatch[1].length
            );
            const whitespaceMatch = /^(\s+)/.exec(afterHashes);
            if (whitespaceMatch) {
              headingWhitespaceLength = whitespaceMatch[1].length;
            }
          }

          if (!activeLines.has(line.number)) {
            const blockquoteMatch = /^\s{0,3}(>\s?)/.exec(text);
            if (blockquoteMatch) {
              builder.add(
                base + blockquoteMatch.index,
                base + blockquoteMatch.index + blockquoteMatch[1].length,
                hiddenMarkerDecoration
              );
            }

            const taskMatch = /^\s{0,3}[*+-]\s+(\[[xX\s]\])/.exec(text);
            if (taskMatch) {
              const markerStart = text.indexOf(taskMatch[1]);
              builder.add(
                base + markerStart,
                base + markerStart + taskMatch[1].length,
                Decoration.replace({ widget: new TaskWidget(/x/i.test(taskMatch[1])) })
              );
            }

            const orderedMatch = /^\s{0,3}(\d+[.)])\s+/.exec(text);
            if (orderedMatch) {
              builder.add(
                base + orderedMatch.index,
                base + orderedMatch.index + orderedMatch[0].length,
                Decoration.replace({ widget: new OrderedWidget(orderedMatch[1]) })
              );
            }

            const bulletMatch = /^\s{0,3}([*+-])\s+/.exec(text);
            if (bulletMatch) {
              builder.add(
                base + bulletMatch.index,
                base + bulletMatch.index + bulletMatch[0].length,
                Decoration.replace({ widget: new BulletWidget() })
              );
            }

            const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(text);
            if (fenceMatch) {
              builder.add(
                base + fenceMatch.index,
                base + fenceMatch.index + fenceMatch[1].length,
                hiddenMarkerDecoration
              );
            }

            const frontMatterMatch = /^\s{0,3}(---|\+\+\+)(\s.*)?$/.exec(text);
            if (frontMatterMatch) {
              builder.add(
                base + frontMatterMatch.index,
                base + frontMatterMatch.index + frontMatterMatch[1].length,
                hiddenMarkerDecoration
              );
            }

            if (headingMatch) {
              builder.add(
                base + headingMatch.index,
                base + headingMatch.index + headingMatch[1].length,
                hiddenMarkerDecoration
              );
              if (headingWhitespaceLength > 0) {
                builder.add(
                  base + headingMatch.index + headingMatch[1].length,
                  base +
                    headingMatch.index +
                    headingMatch[1].length +
                    headingWhitespaceLength,
                  hiddenMarkerDecoration
                );
              }
            }

            inlineMarkerRegex.lastIndex = 0;
            let match;
            while ((match = inlineMarkerRegex.exec(text)) !== null) {
              const fromPos = base + match.index;
              builder.add(
                fromPos,
                fromPos + match[0].length,
                hiddenMarkerDecoration
              );
            }
          }

          if (line.to >= to) break;
          line = doc.line(line.number + 1);
        }
      }

      return builder.finish();
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  }
);

export const CodeMirrorEditor = component$(
  ({
    value,
    readOnly,
    onChange$,
    onViewReady$,
    onDispose$,
    variant = "default",
  }: {
    value: string;
    readOnly?: boolean;
    onChange$: PropFunction<(next: string) => void>;
    onViewReady$?: PropFunction<(view: EditorView) => void>;
    onDispose$?: PropFunction<() => void>;
    variant?: "default" | "live";
  }) => {
    const containerRef = useSignal<HTMLDivElement>();
    const viewRef = useSignal<EditorView>();

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      track(() => containerRef.value);
      track(() => variant);
      const parent = containerRef.value;
      if (!parent) return;

      const state = EditorState.create({
        doc: value,
        extensions: [
          ...baseExtensions,
          readOnlyCompartment.of(EditorState.readOnly.of(!!readOnly)),
          themeCompartment.of(defaultTheme),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const next = update.state.doc.toString();
              onChange$(next);
            }
          }),
          EditorView.lineWrapping,
          EditorView.editable.of(!readOnly),
          EditorState.tabSize.of(2),
          EditorView.theme({
            ".cm-gutters": {
              display: "none",
            },
            ".cm-line": {
              padding: "0",
            },
            ".cm-content": {
              caretColor: "var(--text-primary)",
            },
          }),
          syntaxHighlighting(defaultHighlightStyle),
        ],
      });

      const view = new EditorView({ state, parent });
      viewRef.value = view;
      if (onViewReady$) {
        onViewReady$(view);
      }
      if (variant === "live") {
        view.dispatch({
          effects: [
            themeCompartment.reconfigure(livePreviewTheme),
            presentationCompartment.reconfigure([
              hideMarkdownMarkersPlugin,
              syntaxHighlighting(livePreviewHighlightStyle),
            ]),
          ],
        });
      }

      return () => {
        view.destroy();
        viewRef.value = undefined;
        onDispose$?.();
      };
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      track(() => value);
      const view = viewRef.value;
      if (!view) return;
      const currentValue = view.state.doc.toString();
      if (currentValue !== value) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      }
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      const view = track(() => viewRef.value);
      const mode = track(() => variant);
      if (!view) return;
      view.dispatch({
        effects: [
          themeCompartment.reconfigure(
            mode === "live" ? livePreviewTheme : defaultTheme
          ),
          presentationCompartment.reconfigure(
            mode === "live"
              ? [
                  hideMarkdownMarkersPlugin,
                  syntaxHighlighting(livePreviewHighlightStyle),
                ]
              : []
          ),
        ],
      });
    });

    return <div class="codemirror-container" ref={containerRef} />;
  }
);
