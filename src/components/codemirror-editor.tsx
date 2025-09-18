import {
  component$,
  useSignal,
  type PropFunction,
  useVisibleTask$,
} from "@builder.io/qwik";

const CODE_FONT_STACK =
  'SFMono-Regular, "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

interface CodeMirrorEditorProps {
  value: string;
  readOnly?: boolean;
  onChange$: PropFunction<(next: string) => void>;
  onViewReady$?: PropFunction<(view: unknown) => void>;
  onDispose$?: PropFunction<() => void>;
  variant?: "default" | "live";
}

export const CodeMirrorEditor = component$(
  ({
    value,
    readOnly,
    onChange$,
    onViewReady$,
    onDispose$,
    variant = "default",
  }: CodeMirrorEditorProps) => {
    const containerRef = useSignal<HTMLDivElement>();
    const editorReady = useSignal(false);
    const editorViewSignal = useSignal<any>();
    const editorStateSignal = useSignal<any>();
    const themeCompartmentSignal = useSignal<any>();
    const readOnlyCompartmentSignal = useSignal<any>();
    const editableCompartmentSignal = useSignal<any>();
    const editorViewCtorSignal = useSignal<any>();

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track, cleanup }) => {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return;
      }
      const parent = track(() => containerRef.value);
      if (!parent) return;
      if (editorViewSignal.value) return;

      const [stateModule, markdownModule, languageModule, commandsModule, viewModule] =
        await Promise.all([
          import("@codemirror/state"),
          import("@codemirror/lang-markdown"),
          import("@codemirror/language"),
          import("@codemirror/commands"),
          import("@codemirror/view"),
        ]);

      const { EditorState, Compartment } = stateModule;
      const { markdown, markdownLanguage } = markdownModule;
      const { syntaxHighlighting, defaultHighlightStyle } = languageModule;
      const { history } = commandsModule;
      const { EditorView } = viewModule;

      const themeCompartment = new Compartment();
      const readOnlyCompartment = new Compartment();
      const editableCompartment = new Compartment();

      editorStateSignal.value = EditorState;
      editorViewCtorSignal.value = EditorView;
      themeCompartmentSignal.value = themeCompartment;
      readOnlyCompartmentSignal.value = readOnlyCompartment;
      editableCompartmentSignal.value = editableCompartment;

      const baseExtensions = [
        history(),
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        EditorState.allowMultipleSelections.of(true),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        readOnlyCompartment.of(EditorState.readOnly.of(!!readOnly)),
        themeCompartment.of(defaultTheme(EditorView)),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange$(update.state.doc.toString());
          }
        }),
      ];

      const state = EditorState.create({
        doc: value,
        extensions: baseExtensions,
      });

      const view = new EditorView({ state, parent });
      editorViewSignal.value = view;
      editorReady.value = true;
      if (onViewReady$) await onViewReady$(view);

      if (variant === "live") {
        view.dispatch({
          effects: [themeCompartment.reconfigure(livePreviewTheme(EditorView))],
        });
      }

      cleanup(async () => {
        editorReady.value = false;
        editorViewSignal.value = undefined;
        editorStateSignal.value = undefined;
        themeCompartmentSignal.value = undefined;
        readOnlyCompartmentSignal.value = undefined;
        editableCompartmentSignal.value = undefined;
        editorViewCtorSignal.value = undefined;
        view.destroy();
        if (onDispose$) await onDispose$();
      });
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      const nextValue = track(() => value);
      const view = editorViewSignal.value;
      if (!view) return;
      const current = view.state.doc.toString();
      if (nextValue === current) return;
      view.dispatch({
        changes: {
          from: 0,
          to: current.length,
          insert: nextValue,
        },
      });
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      const currentVariant = track(() => variant);
      const view = editorViewSignal.value;
      const themeCompartment = themeCompartmentSignal.value;
      const EditorView = editorViewCtorSignal.value;
      if (!view || !themeCompartment || !EditorView) return;
      const theme =
        currentVariant === "live"
          ? livePreviewTheme(EditorView)
          : defaultTheme(EditorView);
      view.dispatch({ effects: [themeCompartment.reconfigure(theme)] });
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      const isReadOnly = !!track(() => readOnly);
      const view = editorViewSignal.value;
      const EditorState = editorStateSignal.value;
      const readOnlyCompartment = readOnlyCompartmentSignal.value;
      const editableCompartment = editableCompartmentSignal.value;
      const EditorView = editorViewCtorSignal.value;
      if (
        !view ||
        !EditorState ||
        !readOnlyCompartment ||
        !editableCompartment ||
        !EditorView
      ) {
        return;
      }
      view.dispatch({
        effects: [
          readOnlyCompartment.reconfigure(EditorState.readOnly.of(isReadOnly)),
          editableCompartment.reconfigure(EditorView.editable.of(!isReadOnly)),
        ],
      });
    });

    return (
      <div
        class="codemirror-container"
        ref={containerRef}
        style={{ fontFamily: CODE_FONT_STACK }}
      >
        {!editorReady.value && (
          <pre class="codemirror-fallback" aria-hidden="true">
            {value}
          </pre>
        )}
      </div>
    );
  }
);

const defaultTheme = (EditorView: any) =>
  EditorView.theme(
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
    },
    { dark: false }
  );

const livePreviewTheme = (EditorView: any) =>
  EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: "inherit",
        height: "100%",
      },
      ".cm-scroller": {
        lineHeight: "1.5",
        fontSize: "1.05rem",
        paddingBottom: "4rem",
      },
      ".cm-content": {
        padding: "1.5rem 2rem",
        maxWidth: "72ch",
      },
    },
    { dark: false }
  );
