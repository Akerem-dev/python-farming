import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  const filePath = resolve(process.cwd(), "public/content/modules/files-paths.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as CurriculumModulePackage;
}

describe("files and pathlib content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered intermediate lessons", () => {
    expect(modulePackage.moduleId).toBe("files-paths");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(modulePackage.lessons.every((lesson) => lesson.id.startsWith("intermediate."))).toBe(true);
  });

  it("contains five dedicated file processing laboratories", () => {
    const fileLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode === "file-processing",
    );

    expect(fileLessons).toHaveLength(5);
    for (const lesson of fileLessons) {
      expect(lesson.fileSystem?.workflow.length).toBeGreaterThanOrEqual(2);
      expect(lesson.fileSystem?.rules.length).toBeGreaterThanOrEqual(2);
      expect(lesson.editor.files?.some((file) => !file.path.endsWith(".py"))).toBe(true);
      expect(
        lesson.validation.checks.some((check) =>
          ["file_exists", "file_content_regex", "json_file_equals", "file_unchanged"].includes(
            check.kind,
          ),
        ),
      ).toBe(true);
    }
  });

  it("ships text and json fixtures with Python entrypoints", () => {
    const projectLessons = modulePackage.lessons.filter(
      (lesson) => (lesson.editor.files?.length ?? 0) > 1,
    );

    expect(projectLessons.length).toBeGreaterThanOrEqual(6);
    for (const lesson of projectLessons) {
      const paths = lesson.editor.files?.map((file) => file.path) ?? [];
      expect(lesson.editor.entrypoint?.endsWith(".py")).toBe(true);
      expect(paths).toContain(lesson.editor.entrypoint);
      expect(
        paths.every((path) => ["py", "txt", "json", "csv"].includes(path.split(".").at(-1) ?? "")),
      ).toBe(true);
    }
  });

  it("protects source data and validates generated outputs", () => {
    const writingLessons = modulePackage.lessons.filter(
      (lesson) => (lesson.fileSystem?.outputFiles.length ?? 0) > 0,
    );

    expect(writingLessons).toHaveLength(3);
    for (const lesson of writingLessons) {
      expect(
        lesson.validation.checks.some((check) => check.kind === "file_unchanged"),
      ).toBe(true);
      expect(
        lesson.validation.checks.some((check) =>
          ["file_content_regex", "json_file_equals"].includes(check.kind),
        ),
      ).toBe(true);
    }
  });

  it("ends with a four-file persistent order archive", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const paths = finalLesson?.editor.files?.map((file) => file.path) ?? [];

    expect(finalLesson?.id).toBe("intermediate.files-paths.final-project");
    expect(finalLesson?.fileSystem?.projectTitle).toBe("Sipariş Arşivi v1");
    expect(paths).toEqual([
      "main.py",
      "arsiv.py",
      "data/siparisler.json",
      "output/rapor.json",
    ]);
    expect(
      finalLesson?.validation.checks.some(
        (check) => check.kind === "json_file_equals" && check.path === "output/rapor.json",
      ),
    ).toBe(true);
  });

  it("awards 520 XP across the module", () => {
    const totalXp = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(totalXp).toBe(520);
  });
});
