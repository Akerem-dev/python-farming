import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  const path = resolve(process.cwd(), "public/content/modules/intermediate-project.json");
  return JSON.parse(readFileSync(path, "utf-8")) as CurriculumModulePackage;
}

describe("intermediate capstone content", () => {
  const modulePackage = loadPackage();
  const lesson = modulePackage.lessons[0]!;

  it("publishes a single 300 XP graduation project", () => {
    expect(modulePackage.moduleId).toBe("intermediate-project");
    expect(modulePackage.lessons).toHaveLength(1);
    expect(lesson.id).toBe("intermediate.project.final-capstone");
    expect(lesson.validation.xpReward).toBe(300);
    expect(lesson.graduation?.nextLevel).toBe("İleri Seviye");
  });

  it("ships a multi-file domain, persistence, reporting and testing workspace", () => {
    const paths = lesson.editor.files?.map((file) => file.path) ?? [];

    expect(paths).toEqual(
      expect.arrayContaining([
        "main.py",
        "models.py",
        "errors.py",
        "repository.py",
        "service.py",
        "reporting.py",
        "data/siparisler.json",
        "output/siparisler.json",
        "output/rapor.json",
        "tests/test_service.py",
        "tests/test_reporting.py",
      ]),
    );
    expect(lesson.mode).toBe("file-processing");
    expect(lesson.fileSystem?.workflow).toHaveLength(6);
  });

  it("requires the capstone quality gate and persistent JSON outputs", () => {
    const capstone = lesson.validation.checks.find(
      (check) => check.kind === "capstone_project",
    );

    expect(capstone?.kind).toBe("capstone_project");
    if (capstone?.kind === "capstone_project") {
      expect(capstone.testFiles).toEqual([
        "tests/test_service.py",
        "tests/test_reporting.py",
      ]);
      expect(capstone.minTests).toBe(6);
      expect(capstone.minAssertions).toBe(8);
      expect(capstone.requiredFiles).toHaveLength(9);
    }

    expect(
      lesson.validation.checks.filter((check) => check.kind === "json_file_equals"),
    ).toHaveLength(2);
    expect(
      lesson.validation.checks.some(
        (check) => check.kind === "file_unchanged" && check.path === "data/siparisler.json",
      ),
    ).toBe(true);
  });
});
