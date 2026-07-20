import { beforeEach, describe, expect, it } from "vitest";
import { beginnerStarterCode, useEditorStore } from "../../editor/editorStore";

const initialSnapshot = useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState({
    activeDocumentId: initialSnapshot.activeDocumentId,
    documents: initialSnapshot.documents.map((document) => ({ ...document })),
  });
});

describe("editorStore", () => {
  it("marks a document as dirty when its content changes", () => {
    useEditorStore.getState().updateDocumentContent("main-python", 'print("Merhaba")');

    const document = useEditorStore.getState().documents[0];
    expect(document?.content).toBe('print("Merhaba")');
    expect(document?.saveStatus).toBe("dirty");
  });

  it("stores cursor position", () => {
    useEditorStore.getState().updateCursor("main-python", { line: 4, column: 9 });

    expect(useEditorStore.getState().documents[0]?.cursor).toEqual({ line: 4, column: 9 });
  });

  it("restores the starter code", () => {
    const store = useEditorStore.getState();
    store.updateDocumentContent("main-python", 'print("Geçici")');
    useEditorStore.getState().resetDocument("main-python");

    expect(useEditorStore.getState().documents[0]?.content).toBe(beginnerStarterCode);
  });
});
