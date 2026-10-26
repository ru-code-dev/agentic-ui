import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { lintGutter, linter, type Diagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { editorTheme } from "./editor-theme.ts";
import { parseMessages } from "./parse-messages.ts";
import { offsetAt } from "./source-position.ts";
import { validateSource } from "./validation.ts";

export interface JsonEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onFormat: () => void;
  readonly onForceRender: () => void;
}

/** Parse and schema diagnostics for the editor, from the same analysis as the Errors tab. */
function diagnostics(view: EditorView): Diagnostic[] {
  const source = view.state.doc.toString();
  const parse = parseMessages(source);
  const issue = parse.ok ? validateSource(source, parse.messages) : parse.error;
  if (issue === undefined) return [];
  const from = Math.min(offsetAt(source, issue), source.length);
  const lineEnd = view.state.doc.lineAt(from).to;
  return [
    {
      from,
      to: Math.max(from + 1, Math.min(lineEnd, source.length)),
      severity: "error",
      message: issue.message,
    },
  ];
}

/** CodeMirror 6 JSON editor (PG-03): highlighting, lint with line/col, format and re-render keys. */
export function JsonEditor({ value, onChange, onFormat, onForceRender }: JsonEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const handlers = useRef({ onChange, onFormat, onForceRender });
  handlers.current = { onChange, onFormat, onForceRender };

  useEffect(() => {
    if (host.current === null) return;
    const created = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          indentOnInput(),
          bracketMatching(),
          json(),
          linter(diagnostics, { delay: 300 }),
          lintGutter(),
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (handlers.current.onFormat(), true) },
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => (handlers.current.onForceRender(), true),
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
          editorTheme,
        ],
      }),
    });
    view.current = created;
    return () => created.destroy();
    // The editor is created once; later `value` changes are synced by the effect below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- creating the view per value would lose cursor and history
  }, []);

  useEffect(() => {
    const current = view.current;
    if (current === undefined || current.state.doc.toString() === value) return;
    current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      data-testid="json-editor"
      className="h-full min-h-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-editor]:outline-none"
    />
  );
}
