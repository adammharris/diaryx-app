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

const baseExtensions = [
  history(),
  keymap.of([indentWithTab]),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  EditorState.allowMultipleSelections.of(true),
];

const lightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "inherit",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "SFMono-Regular, JetBrains Mono, ui-monospace, monospace",
      lineHeight: "1.6",
      fontSize: "0.98rem",
    },
    ".cm-content": {
      padding: "1.25rem 1.5rem",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(59, 130, 246, 0.08)",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(59, 130, 246, 0.18)",
    },
  },
  { dark: false }
);

export const CodeMirrorEditor = component$(
  ({
    value,
    readOnly,
    onChange$,
  }: {
    value: string;
    readOnly?: boolean;
    onChange$: PropFunction<(next: string) => void>;
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
          themeCompartment.of(lightTheme),
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

      return () => {
        view.destroy();
        viewRef.value = undefined;
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

    return <div class="codemirror-container" ref={containerRef} />;
  }
);
