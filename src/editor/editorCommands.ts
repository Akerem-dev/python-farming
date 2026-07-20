import type { EditorView } from "@codemirror/view";

export function replaceEditorContent(view: EditorView, content: string) {
  const currentContent = view.state.doc.toString();

  if (currentContent === content) {
    return;
  }

  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content,
    },
    selection: { anchor: 0 },
  });
}

export function focusEditor(view: EditorView | null) {
  view?.focus();
}
