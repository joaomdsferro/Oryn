import { onMount, onCleanup, createEffect } from "solid-js";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { placeholder as placeholderExt, keymap } from "@codemirror/view";
import { insertTab, indentLess } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

type Language = "json" | "none";

type Props = {
  value: string;
  onChange: (value: string) => void;
  language?: Language;
  placeholder?: string;
  minHeight?: string;
  wrap?: boolean;
};

const themeOverride = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily: '"MPLUS1Code", ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: "1.55",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.25)",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  ".cm-focused": { outline: "none" },
  ".cm-content": { caretColor: "#6b9eff" },
  ".cm-placeholder": {
    fontStyle: "italic",
    color: "rgba(255,255,255,0.25)",
  },
});

function languageExt(lang: Language | undefined) {
  return lang === "json" ? json() : [];
}

export default function CodeEditor(props: Props) {
  let container!: HTMLDivElement;
  let view: EditorView | undefined;
  const languageCompartment = new Compartment();
  const placeholderCompartment = new Compartment();
  const wrapCompartment = new Compartment();

  const wrapExt = (on: boolean | undefined) => (on === false ? [] : EditorView.lineWrapping);

  onMount(() => {
    const state = EditorState.create({
      doc: props.value ?? "",
      extensions: [
        basicSetup,
        keymap.of([
          { key: "Tab", run: insertTab },
          { key: "Shift-Tab", run: indentLess },
        ]),
        languageCompartment.of(languageExt(props.language)),
        placeholderCompartment.of(placeholderExt(props.placeholder ?? "")),
        oneDark,
        themeOverride,
        wrapCompartment.of(wrapExt(props.wrap)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            props.onChange(update.state.doc.toString());
          }
        }),
      ],
    });
    view = new EditorView({ state, parent: container });
  });

  // External value changes (e.g. loadRequest) — only patch if it doesn't match.
  createEffect(() => {
    const incoming = props.value ?? "";
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === incoming) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: incoming },
    });
  });

  createEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: languageCompartment.reconfigure(languageExt(props.language)),
    });
  });

  createEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.reconfigure(placeholderExt(props.placeholder ?? "")),
    });
  });

  createEffect(() => {
    if (!view) return;
    view.dispatch({
      effects: wrapCompartment.reconfigure(wrapExt(props.wrap)),
    });
  });

  onCleanup(() => view?.destroy());

  return (
    <div
      ref={container}
      class="rounded-lg border border-edge bg-surface-2 overflow-hidden
             focus-within:border-edge-bright transition-colors"
      style={{ "min-height": props.minHeight ?? "7rem" }}
    />
  );
}
