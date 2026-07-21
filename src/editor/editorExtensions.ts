import { indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import type { EditorLanguage } from "./editorModels";
import { pythonFarmingEditorTheme } from "./editorTheme";

interface CreateEditorExtensionsOptions {
  language: EditorLanguage;
  onContentChange: (content: string) => void;
  onCursorChange: (line: number, column: number) => void;
  readOnly?: boolean;
}

export function createEditorExtensions({
  language,
  onContentChange,
  onCursorChange,
  readOnly = false,
}: CreateEditorExtensionsOptions): Extension[] {
  const languageExtensions: Extension[] = language === "python" ? [python()] : [];

  return [
    basicSetup,
    ...languageExtensions,
    pythonFarmingEditorTheme,
    keymap.of([indentWithTab]),
    EditorState.tabSize.of(4),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !readOnly) {
        onContentChange(update.state.doc.toString());
      }

      if (update.selectionSet || update.docChanged) {
        const position = update.state.selection.main.head;
        const line = update.state.doc.lineAt(position);
        onCursorChange(line.number, position - line.from + 1);
      }
    }),
  ];
}
