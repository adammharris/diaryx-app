import {
  component$,
  useSignal,
  type PropFunction,
  useVisibleTask$,
} from "@builder.io/qwik";

interface ProseMirrorEditorProps {
  value: string;
  readOnly?: boolean;
  onChange$: PropFunction<(next: string) => void>;
  onViewReady$?: PropFunction<(view: unknown) => void>;
  onDispose$?: PropFunction<() => void>;
  variant?: "default" | "live";
}

const CODE_FONT_STACK =
  'SFMono-Regular, "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

export const ProseMirrorEditor = component$(
  ({
    value,
    readOnly,
    onChange$,
    onViewReady$,
    onDispose$,
    variant = "default",
  }: ProseMirrorEditorProps) => {
    const containerRef = useSignal<HTMLDivElement>();
    const editorReady = useSignal(false);

    // Runtime-only resources
    const viewSignal = useSignal<any>();
    const stateCtorSignal = useSignal<any>();
    const schemaSignal = useSignal<any>();
    const parserSignal = useSignal<any>();
    const serializerSignal = useSignal<any>();

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track, cleanup }) => {
      const parent = track(() => containerRef.value);
      if (typeof window === "undefined" || typeof document === "undefined") {
        return;
      }
      if (!parent || viewSignal.value) return;

      // Lazy load ProseMirror modules in the browser only
      const [stateModule, viewModule, markdownModule, exampleSetupModule] =
        await Promise.all([
          import("prosemirror-state"),
          import("prosemirror-view"),
          import("prosemirror-markdown"),
          import("prosemirror-example-setup"),
        ]);

      const { EditorState } = stateModule as any;
      const { EditorView } = viewModule as any;
      const { schema, defaultMarkdownParser, defaultMarkdownSerializer } =
        markdownModule as any;
      const { exampleSetup } = exampleSetupModule as any;

      // Prepare state, schema, parser, serializer
      stateCtorSignal.value = EditorState;
      schemaSignal.value = schema;
      parserSignal.value = defaultMarkdownParser;
      serializerSignal.value = defaultMarkdownSerializer;

      // Ensure our live theme CSS is present once
      ensureProseMirrorLiveStyles();

      // Build initial state from Markdown
      const initialDoc = safeParseMarkdown(defaultMarkdownParser, value);
      const plugins = exampleSetup({
        schema,
        // We control toolbar outside; keep setup lean:
        menuBar: false,
        floatingMenu: false,
        history: true,
      });

      const state = EditorState.create({
        schema,
        doc: initialDoc,
        plugins,
      });

      // Create view with dispatch that serializes back to Markdown
      const view = new EditorView(parent, {
        state,
        editable: () => !readOnly,
        attributes: {
          class: `ProseMirror ProseMirror-root ${variant === "live" ? "pm-live" : "pm-default"}`,
          "aria-label": "Markdown editor",
        },
        dispatchTransaction: (tr: any) => {
          const newState = view.state.apply(tr);
          view.updateState(newState);
          if (tr.docChanged) {
            const nextMarkdown = defaultMarkdownSerializer.serialize(
              newState.doc,
            );
            // Emit to parent
            onChange$(nextMarkdown);
          }
        },
      });

      viewSignal.value = view;
      editorReady.value = true;

      // Notify consumer
      if (onViewReady$) await onViewReady$(view);

      // Cleanup
      cleanup(async () => {
        try {
          view.destroy();
        } catch {
          // ignore issues during teardown
        }
        viewSignal.value = undefined;
        stateCtorSignal.value = undefined;
        schemaSignal.value = undefined;
        parserSignal.value = undefined;
        serializerSignal.value = undefined;
        editorReady.value = false;
        if (onDispose$) await onDispose$();
      });
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      // Propagate external value changes by reparsing markdown
      const nextValue = track(() => value);
      if (typeof window === "undefined") return;

      const view = viewSignal.value;
      const parser = parserSignal.value;
      const serializer = serializerSignal.value;
      const EditorState = stateCtorSignal.value;
      if (!view || !parser || !serializer || !EditorState) return;

      const current = serializer.serialize(view.state.doc);
      if (current === nextValue) return;

      const nextDoc = safeParseMarkdown(parser, nextValue);
      const nextState = EditorState.create({
        schema: view.state.schema,
        doc: nextDoc,
        plugins: view.state.plugins,
      });
      // Let ProseMirror determine the nearest valid selection for the new doc
      view.updateState(nextState);
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      // Toggle readOnly without recreating the view
      const isReadOnly = !!track(() => readOnly);
      if (typeof window === "undefined") return;
      const view = viewSignal.value;
      if (!view) return;
      try {
        view.setProps({ editable: () => !isReadOnly });
      } catch {
        // ignored
      }
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track }) => {
      // Toggle variant classes
      const currentVariant = track(() => variant);
      if (typeof window === "undefined") return;
      const view = viewSignal.value;
      if (!view) return;
      const dom = view.dom as HTMLElement;
      dom.classList.toggle("pm-live", currentVariant === "live");
      dom.classList.toggle("pm-default", currentVariant !== "live");
    });

    return (
      <div class="prosemirror-container" ref={containerRef}>
        <pre
          class={{
            "prosemirror-fallback": true,
            "prosemirror-fallback--hidden": editorReady.value,
          }}
          aria-hidden="true"
          hidden={editorReady.value}
        >
          {value}
        </pre>
      </div>
    );
  },
);

function safeParseMarkdown(parser: any, value: string) {
  try {
    return parser.parse(value ?? "");
  } catch {
    // Fallback to empty doc if parse fails
    return parser.parse("");
  }
}

function ensureProseMirrorLiveStyles() {
  const STYLE_ID = "diaryx-prosemirror-live-theme";
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
/* Base container */
.prosemirror-container {
  height: 100%;
}
.prosemirror-container .ProseMirror-root {
  outline: none;
  height: 100%;
  box-sizing: border-box;
}
.prosemirror-container .ProseMirror {
  padding: 1.25rem 1.5rem;
  line-height: 1.55;
  font-size: 0.95rem;
}

/* Live variant */
.prosemirror-container .ProseMirror-root.pm-live {
  font-family: "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
  line-height: 1.5;
  font-size: 1.08rem;
  letter-spacing: -0.003em;
}
.prosemirror-container .ProseMirror-root.pm-live {
  padding: 1.65rem clamp(1.4rem, 4vw, 2.2rem);
  max-width: 68ch;
  margin: 0 auto;
  padding-bottom: 4rem;
}
.prosemirror-container .ProseMirror p {
  margin: 0.3rem 0;
}
.prosemirror-container .ProseMirror h1,
.prosemirror-container .ProseMirror h2,
.prosemirror-container .ProseMirror h3 {
  margin: 0.85em 0 0.35em 0;
  line-height: 1.25;
  font-weight: 700;
}
.prosemirror-container .ProseMirror h1 { font-size: 1.65em; }
.prosemirror-container .ProseMirror h2 { font-size: 1.35em; }
.prosemirror-container .ProseMirror h3 { font-size: 1.18em; }

.prosemirror-container .ProseMirror blockquote {
  border-left: 3px solid var(--surface-border-strong);
  margin: 0.5rem 0;
  padding-left: 0.75rem;
  color: var(--text-secondary);
}

.prosemirror-container .ProseMirror code {
  font-family: ${CODE_FONT_STACK};
  background-color: color-mix(in srgb, var(--surface-border) 35%, transparent);
  padding: 0.1rem 0.35rem;
  border-radius: 0.35rem;
}
.prosemirror-container .ProseMirror pre {
  background-color: color-mix(in srgb, var(--surface-border) 35%, transparent);
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  overflow: auto;
  font-family: ${CODE_FONT_STACK};
}
.prosemirror-container .ProseMirror a {
  color: var(--link, #2563eb);
  text-underline-offset: 0.15em;
}

/* Basic cursor/selection improvements */
.ProseMirror-gapcursor {
  display: none;
}
.ProseMirror-selectednode {
  outline: 2px solid var(--surface-border-strong);
}
`;
  document.head.appendChild(style);
}

export default ProseMirrorEditor;
