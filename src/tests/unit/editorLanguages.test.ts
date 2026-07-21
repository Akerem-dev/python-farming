import { describe, expect, it } from "vitest";
import { inferEditorLanguage } from "../../editor/editorStore";

describe("editor project file languages", () => {
  it("detects Python, JSON and plain text project files", () => {
    expect(inferEditorLanguage("main.py")).toBe("python");
    expect(inferEditorLanguage("data/urunler.json")).toBe("json");
    expect(inferEditorLanguage("notlar.txt")).toBe("text");
    expect(inferEditorLanguage("rapor.csv")).toBe("text");
  });
});
