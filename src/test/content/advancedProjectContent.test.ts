import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/advanced-project.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

describe("advanced capstone module content", () => {
  const modulePackage = loadPackage();

  it("publishes the final advanced platform lesson", () => {
    expect(modulePackage.moduleId).toBe("advanced-project");
    expect(modulePackage.lessons).toHaveLength(1);
    expect(modulePackage.lessons[0]?.id).toBe("advanced.project.final-platform");
    expect(modulePackage.lessons[0]?.validation.xpReward).toBe(500);
  });

  it("ships an eleven-file production workspace", () => {
    const lesson = modulePackage.lessons[0];
    expect(lesson?.editor.files).toHaveLength(11);
    expect(lesson?.editor.entrypoint).toBe("main.py");
    expect(lesson?.editor.files?.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "farming_platform/models.py",
        "farming_platform/ports.py",
        "farming_platform/repository.py",
        "farming_platform/collector.py",
        "farming_platform/profiling.py",
        "tests/test_platform.py",
      ]),
    );
  });

  it("uses the dedicated advanced capstone quality gate", () => {
    const lesson = modulePackage.lessons[0];
    const check = lesson?.validation.checks.find(
      (candidate) => candidate.kind === "advanced_capstone",
    );
    expect(check?.kind).toBe("advanced_capstone");
    if (check?.kind === "advanced_capstone") {
      expect(check.requiredFiles).toHaveLength(11);
      expect(check.testFiles).toEqual(["tests/test_platform.py"]);
      expect(check.minTests).toBe(6);
      expect(check.minAssertions).toBe(8);
    }
  });

  it("keeps external networking disabled through FakeTransport", () => {
    const text = JSON.stringify(modulePackage);
    expect(text).toContain("FakeTransport");
    expect(text).toContain("Semaphore");
    expect(text).toContain("SQLiteEventRepository");
    expect(text).toContain("tracemalloc");
    expect(text).not.toContain("urlopen(");
  });
});
