import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { replaceEditorContent } from "./editorCommands";
import { createEditorExtensions } from "./editorExtensions";
import { useEditorStore } from "./editorStore";

interface CodeEditorProps {
  documentId: string;
  ariaLabel?: string;
  className?: string;
}

export function CodeEditor({
  documentId,
  ariaLabel = "Python kod editörü",
  className = "",
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const document = useEditorStore((state) =>
    state.documents.find((candidate) => candidate.id === documentId),
  );
  const updateDocumentContent = useEditorStore((state) => state.updateDocumentContent);
  const updateCursor = useEditorStore((state) => state.updateCursor);

  useEffect(() => {
    if (!hostRef.current || !document) {
      return;
    }

    const state = EditorState.create({
      doc: document.content,
      extensions: createEditorExtensions({
        onContentChange: (content) => updateDocumentContent(document.id, content),
        onCursorChange: (line, column) => updateCursor(document.id, { line, column }),
      }),
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [document?.id, updateCursor, updateDocumentContent]);

  useEffect(() => {
    if (!document || !viewRef.current) {
      return;
    }

    replaceEditorContent(viewRef.current, document.content);
  }, [document?.content, document?.revision]);

  return <div ref={hostRef} className={className} aria-label={ariaLabel} />;
}
