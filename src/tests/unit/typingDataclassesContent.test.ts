import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadTypingPackage() {
  const filePath = resolve(
    process.cwd(),
    "public/content/modules/typing-dataclasses.json",
  );
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("typing and dataclasses module content", () => {
  const modulePackage = loadTypingPackage();

  it("publishes seven ordered lessons", () => {
    expect(modulePackage.moduleId).toBe("typing-dataclasses");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("covers prediction, completion, debugging and multi-file practice", () => {
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "output-prediction")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "code-completion")).toBe(true);
    expect(modulePackage.lessons.some((lesson) => lesson.mode === "debugging")).toBe(true);

    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files).toHaveLength(3);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
  });

  it("requires real annotation, dataclass and protocol checks", () => {
    const checks = modulePackage.lessons.flatMap((lesson) => lesson.validation.checks);
    expect(checks.some((check) => check.kind === "function_annotations")).toBe(true);
    expect(checks.some((check) => check.kind === "dataclass_definition")).toBe(true);
    expect(checks.some((check) => check.kind === "protocol_definition")).toBe(true);
  });

  it("teaches safe mutable defaults and frozen models", () => {
    const mutableLesson = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.typing.mutable-default-debug",
    );
    const frozenLesson = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.typing.frozen-dataclass",
    );

    expect(mutableLesson?.editor.starterCode).toContain("urunler: list[str] = []");
    const mutableCheck = mutableLesson?.validation.checks.find(
      (check) => check.kind === "dataclass_definition",
    );
    expect(mutableCheck?.kind).toBe("dataclass_definition");
    if (mutableCheck?.kind === "dataclass_definition") {
      expect(mutableCheck.fields[0]?.defaultKind).toBe("factory");
      expect(mutableCheck.fields[0]?.factory).toBe("list");
    }

    const frozenCheck = frozenLesson?.validation.checks.find(
      (check) => check.kind === "dataclass_definition",
    );
    expect(frozenCheck?.kind).toBe("dataclass_definition");
    if (frozenCheck?.kind === "dataclass_definition") {
      expect(frozenCheck.frozen).toBe(true);
    }
  });

  it("publishes a strict typed order model final", () => {
    const finalLesson = modulePackage.lessons.find(
      (lesson) => lesson.id === "intermediate.typing.final-order-model",
    );
    expect(finalLesson?.validation.checks.filter(
      (check) => check.kind === "dataclass_definition",
    )).toHaveLength(2);
    expect(finalLesson?.validation.checks.some(
      (check) => check.kind === "protocol_definition",
    )).toBe(true);
    expect(finalLesson?.validation.checks.some(
      (check) => check.kind === "function_cases",
    )).toBe(true);
    expect(finalLesson?.editor.files?.some((file) => file.path === "models.py")).toBe(true);
    expect(finalLesson?.editor.files?.some((file) => file.path === "service.py")).toBe(true);
  });

  it("awards 750 XP across the module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(750);
  });
});
