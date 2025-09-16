import {
  component$,
  useVisibleTask$,
  useSignal,
  type PropFunction,
} from "@builder.io/qwik";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { history } from "@codemirror/commands";
import { keymap, EditorView } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";

const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

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
      lineHeight: "1.65",
      fontSize: "1.05rem",
    },
    ".cm-content": {
      padding: "1.5rem 2rem",
    },
    ".cm-line": {
      padding: "0.2rem 0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeft: "2px solid var(--text-primary)",
    },
    ".cm-heading": {
      fontWeight: "600",
      letterSpacing: "-0.01em",
    },
    ".cm-heading.cm-heading1": {
      fontSize: "1.6rem",
      marginTop: "1.6rem",
    },
    ".cm-heading.cm-heading2": {
      fontSize: "1.35rem",
      marginTop: "1.4rem",
    },
    ".cm-heading.cm-heading3": {
      fontSize: "1.2rem",
      marginTop: "1.2rem",
    },
    ".cm-strong": {
      fontWeight: "600",
    },
    ".cm-em": {
      fontStyle: "italic",
    },
    ".cm-quote": {
      borderLeft: "3px solid rgba(148, 163, 184, 0.45)",
      paddingLeft: "0.75rem",
      fontStyle: "italic",
    },
    ".cm-list": {
      paddingLeft: "0.75rem",
    },
  },
  { dark: false }
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
        effects: themeCompartment.reconfigure(
          mode === "live" ? livePreviewTheme : defaultTheme
        ),
      });
    });

    return <div class="codemirror-container" ref={containerRef} />;
  }
);
