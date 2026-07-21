import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../../editor/editorStore";

const workspace = {
  filename: "main.py",
  starterCode: "print('main')",
  entrypoint: "main.py",
  files: [
    { path: "main.py", starterCode: "from paket import mesaj", readOnly: true },
    { path: "paket/__init__.py", starterCode: "from .yardimci import mesaj" },
    { path: "paket/yardimci.py", starterCode: "def mesaj():\n    return 'hazır'" },
  ],
};

describe("editor multi-file workspace", () => {
  beforeEach(() => {
    useEditorStore.getState().loadLessonWorkspace("test.project", workspace);
  });

  it("loads all files and activates the entrypoint", () => {
    const state = useEditorStore.getState();
    expect(state.entrypoint).toBe("main.py");
    expect(state.documents.map((document) => document.path)).toEqual([
      "main.py",
      "paket/__init__.py",
      "paket/yardimci.py",
    ]);
    expect(state.documents.find((document) => document.id === state.activeDocumentId)?.path).toBe(
      "main.py",
    );
  });

  it("does not change read-only support files", () => {
    const main = useEditorStore.getState().documents.find((document) => document.path === "main.py");
    expect(main).toBeDefined();
    useEditorStore.getState().updateDocumentContent(main!.id, "print('changed')");
    expect(useEditorStore.getState().documents.find((document) => document.id === main!.id)?.content).toBe(
      "from paket import mesaj",
    );
  });

  it("switches files and resets the complete project", () => {
    const helper = useEditorStore
      .getState()
      .documents.find((document) => document.path === "paket/yardimci.py");
    expect(helper).toBeDefined();

    useEditorStore.getState().setActiveDocument(helper!.id);
    useEditorStore.getState().updateDocumentContent(helper!.id, "def mesaj():\n    return 'değişti'");
    expect(useEditorStore.getState().activeDocumentId).toBe(helper!.id);

    useEditorStore.getState().resetWorkspace();
    const resetHelper = useEditorStore
      .getState()
      .documents.find((document) => document.path === "paket/yardimci.py");
    expect(resetHelper?.content).toBe("def mesaj():\n    return 'hazır'");
  });
});
