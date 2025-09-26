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
  onFocus$?: PropFunction<() => void>;
  onBlur$?: PropFunction<() => void>;
  variant?: "default" | "live";
}

export const CodeMirrorEditor = component$(
  ({
    value,
    readOnly,
    onChange$,
    onViewReady$,
    onDispose$,
    onFocus$,
    onBlur$,
    variant = "default",
  }: CodeMirrorEditorProps) => {
    const containerRef = useSignal<HTMLDivElement>();
    const editorReady = useSignal(false);
    const editorViewSignal = useSignal<any>();
    const editorStateSignal = useSignal<any>();
    const themeCompartmentSignal = useSignal<any>();
    const readOnlyCompartmentSignal = useSignal<any>();
    const editableCompartmentSignal = useSignal<any>();
    const formattingCompartmentSignal = useSignal<any>();
    const formattingPluginBuilderSignal = useSignal<any>();
    const editorViewCtorSignal = useSignal<any>();
    const isApplyingExternalChange = useSignal(false);

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(
      async ({ track, cleanup }) => {
        const parent = track(() => containerRef.value);
        if (typeof window === "undefined" || typeof document === "undefined") {
          return;
        }
        if (!parent || editorViewSignal.value) {
          return;
        }

        // Initialize CodeMirror immediately; ResizeObserver will trigger measurement as needed.

        const [
          stateModule,
          markdownModule,
          languageModule,
          commandsModule,
          viewModule,
          highlightModule,
        ] = await Promise.all([
          import("@codemirror/state"),
          import("@codemirror/lang-markdown"),
          import("@codemirror/language"),
          import("@codemirror/commands"),
          import("@codemirror/view"),
          import("@lezer/highlight"),
        ]);

        const { EditorState, Compartment } = stateModule;
        const { markdown, markdownLanguage, markdownKeymap } = markdownModule;
        const { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } =
          languageModule;
        const { history, defaultKeymap, historyKeymap } = commandsModule;
        const { EditorView, keymap } = viewModule;
        const Decoration = (viewModule as any).Decoration;
        const ViewPlugin = (viewModule as any).ViewPlugin;
        const { tags } = highlightModule;

        const classHighlight = HighlightStyle.define([
          { tag: tags.heading1, class: "cm-header cm-header-1" },
          { tag: tags.heading2, class: "cm-header cm-header-2" },
          { tag: tags.heading3, class: "cm-header cm-header-3" },
          { tag: tags.heading, class: "cm-header" },
          { tag: tags.monospace, class: "cm-inline-code" },
          { tag: tags.strong, class: "cm-strong" },
          { tag: tags.emphasis, class: "cm-em" },
          { tag: tags.quote, class: "cm-quote" },
          { tag: tags.processingInstruction, class: "cm-formatting" },
        ]);

        const themeCompartment = new Compartment();
        const readOnlyCompartment = new Compartment();
        const editableCompartment = new Compartment();
        const formattingCompartment = new Compartment();

        editorStateSignal.value = EditorState;
        editorViewCtorSignal.value = EditorView;
        themeCompartmentSignal.value = themeCompartment;
        readOnlyCompartmentSignal.value = readOnlyCompartment;
        editableCompartmentSignal.value = editableCompartment;
        formattingCompartmentSignal.value = formattingCompartment;

        // Decoration-based plugin: replace formatting tokens unless selection intersects them
        const buildFormattingReplacePlugin = () => {
          const build = (view: any) => {
            const ranges: any[] = [];
            const selRanges = view.state.selection.ranges;
            const intersects = (from: number, to: number) =>
              selRanges.some((r: any) => r.from < to && r.to > from);
            const doc = view.state.doc;

            for (let i = 1; i <= doc.lines; i++) {
              const line = doc.line(i);
              const text = line.text;
              const from = line.from;

              // Headings: #... + space(s) — replace marker and space(s) when not selected
              let m = text.match(/^(#{1,6})([ \t]+)/);
              if (m) {
                const hlen = m[1].length;
                const slen = m[2].length;
                if (!intersects(from, from + hlen)) {
                  ranges.push(Decoration.replace({}).range(from, from + hlen));
                }
                if (slen && !intersects(from + hlen, from + hlen + slen)) {
                  ranges.push(
                    Decoration.replace({}).range(
                      from + hlen,
                      from + hlen + slen,
                    ),
                  );
                }
              }

              // Blockquote: > plus optional space — replace marker and space when not selected
              m = text.match(/^>([ \t]?)/);
              if (m) {
                if (!intersects(from, from + 1)) {
                  ranges.push(Decoration.replace({}).range(from, from + 1));
                }
                if (m[1] && !intersects(from + 1, from + 2)) {
                  ranges.push(Decoration.replace({}).range(from + 1, from + 2));
                }
              }

              // Lists: -, *, + or ordered markers with trailing spaces — replace marker and spaces when not selected
              m = text.match(/^(\s*)([-*+]|[0-9]+[.)])([ \t]+)/);
              if (m) {
                const pre = m[1].length;
                const mark = m[2].length;
                const space = m[3].length;
                if (!intersects(from + pre, from + pre + mark)) {
                  ranges.push(
                    Decoration.replace({}).range(from + pre, from + pre + mark),
                  );
                }
                if (
                  space &&
                  !intersects(from + pre + mark, from + pre + mark + space)
                ) {
                  ranges.push(
                    Decoration.replace({}).range(
                      from + pre + mark,
                      from + pre + mark + space,
                    ),
                  );
                }
              }
              // (padding)
              // (padding)

              // Inline markers are not replaced; visibility handled via CSS (.cm-formatting)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
              // (padding)
            }

            return Decoration.set(ranges, true);
          };

          return ViewPlugin.fromClass(
            class {
              decorations: any;
              constructor(view: any) {
                this.decorations = build(view);
              }
              update(update: any) {
                if (
                  update.docChanged ||
                  update.selectionSet ||
                  update.viewportChanged
                ) {
                  this.decorations = build(update.view);
                  try {
                    const view = update.view;
                    const container = view.dom as HTMLElement;
                    const ranges = view.state.selection.ranges.filter(
                      (r: any) => !r.empty,
                    );
                    if (ranges.length === 0) {
                      const revealed = container.querySelectorAll(
                        ".cm-formatting.cm-formatting--reveal",
                      );
                      for (let i = 0; i < revealed.length; i++) {
                        (revealed[i] as HTMLElement).classList.remove(
                          "cm-formatting--reveal",
                        );
                      }
                    } else {
                      const ySpans: Array<{ top: number; bottom: number }> = [];
                      for (const r of ranges) {
                        const a = view.coordsAtPos(r.from);
                        const b = view.coordsAtPos(r.to);
                        if (a && b)
                          ySpans.push({
                            top: Math.min(a.top, b.top),
                            bottom: Math.max(a.bottom, b.bottom),
                          });
                      }
                      const lines = container.querySelectorAll(".cm-line");
                      for (let i = 0; i < lines.length; i++) {
                        const lineEl = lines[i] as HTMLElement;
                        const rect = lineEl.getBoundingClientRect();
                        const inter = ySpans.some(
                          (ys) => rect.bottom > ys.top && rect.top < ys.bottom,
                        );
                        const tokens =
                          lineEl.querySelectorAll(".cm-formatting");
                        for (let j = 0; j < tokens.length; j++) {
                          (tokens[j] as HTMLElement).classList.toggle(
                            "cm-formatting--reveal",
                            inter,
                          );
                        }
                      }
                    }
                  } catch {
                    /* ignore */
                  }
                }
              }
              // (padding)
              // (padding)
            },
            { decorations: (v: any) => v.decorations },
          );
        };

        formattingPluginBuilderSignal.value = buildFormattingReplacePlugin;
        const baseExtensions = [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...markdownKeymap]),
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          EditorState.allowMultipleSelections.of(true),
          syntaxHighlighting(classHighlight),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          readOnlyCompartment.of(EditorState.readOnly.of(!!readOnly)),
          themeCompartment.of(defaultTheme(EditorView)),
          editableCompartment.of(EditorView.editable.of(!readOnly)),
          // Slot for formatting visibility plugin (configured per-variant)
          formattingCompartment.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isApplyingExternalChange.value) {
              onChange$(update.state.doc.toString());
            }
          }),
          // Formatting visibility handled by decoration plugin.
        ];

        const state = EditorState.create({
          doc: value,
          extensions: baseExtensions,
        });

        const view = new EditorView({ state, parent });
        editorViewSignal.value = view;
        editorReady.value = true;

        const focusListener = onFocus$
          ? () => {
              void onFocus$();
            }
          : undefined;
        const blurListener = onBlur$
          ? () => {
              void onBlur$();
            }
          : undefined;

        if (focusListener) {
          view.dom.addEventListener("focus", focusListener, true);
        }
        if (blurListener) {
          view.dom.addEventListener("blur", blurListener, true);
        }

        // Formatting visibility is handled by the decoration plugin (no DOM selection listeners needed)

        requestAnimationFrame(() => {
          try {
            (view as any).requestMeasure?.({
              read: () => null,
              write: () => {},
            });
          } catch {
            void 0;
          }
        });

        // Keep editor measured when container resizes
        let __ro: ResizeObserver | undefined;
        if (typeof ResizeObserver !== "undefined") {
          __ro = new ResizeObserver(() => {
            try {
              (view as any).requestMeasure?.({
                read: () => null,
                write: () => {},
              });
            } catch {
              void 0;
            }
          });
          __ro.observe(parent);
        } else {
          const onWinResize = () => {
            try {
              (view as any).requestMeasure?.({
                read: () => null,
                write: () => {},
              });
            } catch {
              void 0;
            }
          };
          window.addEventListener("resize", onWinResize);
          (view as any).__onWinResize = onWinResize;
        }

        if (onViewReady$) await onViewReady$(view);

        if (variant === "live") {
          view.dispatch({
            effects: [
              themeCompartment.reconfigure(livePreviewTheme(EditorView)),
              formattingCompartment.reconfigure(buildFormattingReplacePlugin()),
            ],
          });
        }

        cleanup(async () => {
          try {
            if (typeof __ro !== "undefined") {
              __ro.disconnect();
            } else if ((view as any).__onWinResize) {
              window.removeEventListener("resize", (view as any).__onWinResize);
            }
          } catch {
            void 0;
          }
          editorReady.value = false;
          if (focusListener) {
            view.dom.removeEventListener("focus", focusListener, true);
          }
          if (blurListener) {
            view.dom.removeEventListener("blur", blurListener, true);
          }
          editorViewSignal.value = undefined;
          editorStateSignal.value = undefined;
          themeCompartmentSignal.value = undefined;
          readOnlyCompartmentSignal.value = undefined;
          editableCompartmentSignal.value = undefined;
          formattingCompartmentSignal.value = undefined;
          editorViewCtorSignal.value = undefined;
          // No selectionchange listeners to clean up (plugin-based visibility)
          view.destroy();
          if (onDispose$) await onDispose$();
        });
      },
      { strategy: "document-ready" },
    );

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(
      ({ track }) => {
        const nextValue = track(() => value);
        if (typeof window === "undefined") {
          return;
        }
        const view = editorViewSignal.value;
        if (!view) return;
        const current = view.state.doc.toString();
        if (nextValue === current) return;
        // Apply external value without losing selection/focus
        const sel = view.state.selection.main;
        isApplyingExternalChange.value = true;
        view.dispatch({
          changes: { from: 0, to: current.length, insert: nextValue },
          selection: {
            anchor: Math.min(sel.anchor, nextValue.length),
            head: Math.min(sel.head, nextValue.length),
          },
          scrollIntoView: true,
        });
        isApplyingExternalChange.value = false;
      },
      { strategy: "document-ready" },
    );

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(
      ({ track }) => {
        const currentVariant = track(() => variant);
        if (typeof window === "undefined") {
          return;
        }
        const view = editorViewSignal.value;
        const themeCompartment = themeCompartmentSignal.value;
        const formattingCompartment = formattingCompartmentSignal.value;
        const buildFmt = formattingPluginBuilderSignal.value as
          | undefined
          | (() => any);
        const EditorView = editorViewCtorSignal.value;
        if (!view || !themeCompartment || !EditorView || !formattingCompartment)
          return;
        const isLive = currentVariant === "live";
        const theme = isLive
          ? livePreviewTheme(EditorView)
          : defaultTheme(EditorView);
        const fmtExt = isLive && buildFmt ? buildFmt() : [];
        view.dispatch({
          effects: [
            themeCompartment.reconfigure(theme),
            formattingCompartment.reconfigure(fmtExt),
          ],
        });
      },
      { strategy: "document-ready" },
    );

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(
      ({ track }) => {
        const isReadOnly = !!track(() => readOnly);
        if (typeof window === "undefined") {
          return;
        }
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
            readOnlyCompartment.reconfigure(
              EditorState.readOnly.of(isReadOnly),
            ),
            editableCompartment.reconfigure(
              EditorView.editable.of(!isReadOnly),
            ),
          ],
        });
      },
      { strategy: "document-ready" },
    );

    return (
      <div
        class="codemirror-container"
        ref={containerRef}
        style={{ fontFamily: CODE_FONT_STACK }}
      >
        <pre
          class={{
            "codemirror-fallback": true,
            "codemirror-fallback--hidden": editorReady.value,
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
    { dark: false },
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
        fontFamily:
          '"SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif',
        lineHeight: "1.5",
        fontSize: "1.08rem",
        paddingBottom: "4rem",
        letterSpacing: "-0.003em",
      },
      ".cm-content": {
        padding: "1.65rem clamp(1.4rem, 4vw, 2.2rem)",
        maxWidth: "68ch",
        margin: "0 auto",
      },
      /* Live styling enhancements */
      ".cm-line": {
        padding: "0.1rem 0",
      },
      ".cm-header, .cm-header-1, .cm-header-2, .cm-header-3": {
        display: "inline",
        margin: "0",
        padding: "0",
        lineHeight: "inherit",
      },
      ".cm-strong": {
        fontWeight: "700",
      },
      ".cm-em": {
        fontStyle: "italic",
      },
      ".cm-inline-code": {
        fontFamily: CODE_FONT_STACK,
        backgroundColor:
          "color-mix(in srgb, var(--surface-border) 35%, transparent)",
        padding: "0.1rem 0.35rem",
        borderRadius: "0.35rem",
      },
      ".cm-quote": {
        borderLeft: "3px solid var(--surface-border-strong)",
        paddingLeft: "0.75rem",
        color: "var(--text-secondary)",
      },
      ".cm-formatting": {
        color: "transparent",
        textDecoration: "none",
        fontSize: "0",
        letterSpacing: "0",
        whiteSpace: "inherit",
        verticalAlign: "baseline",
      },
      ".cm-formatting.cm-formatting--reveal": {
        color: "inherit",
        textDecoration: "inherit",
        fontSize: "inherit",
        letterSpacing: "inherit",
        whiteSpace: "inherit",
        verticalAlign: "baseline",
      },
    },
    { dark: false },
  );
