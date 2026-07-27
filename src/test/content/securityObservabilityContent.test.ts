import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CurriculumModulePackage,
  CurriculumModulePackageIndex,
} from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/security-observability.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

function loadIndex() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/module-packages.json"), "utf-8"),
  ) as CurriculumModulePackageIndex;
}

describe("expert security and observability content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons and 1400 XP", () => {
    expect(modulePackage.moduleId).toBe("security-observability");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1400);
  });

  it("registers the package after distributed systems and resilience", () => {
    const files = loadIndex().files;
    const distributedIndex = files.indexOf("/content/modules/distributed-resilience.json");
    expect(distributedIndex).toBeGreaterThanOrEqual(0);
    expect(files[distributedIndex + 1]).toBe("/content/modules/security-observability.json");
  });

  it("covers telemetry boundaries, redaction, tracing, SLO and tamper evidence", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of [
      "authorization",
      "redacted",
      "correlation",
      "structured",
      "slo",
      "sha-256",
      "audit",
    ]) {
      expect(text).toContain(keyword);
    }
  });

  it("requires hidden behavior cases for every executable lesson", () => {
    const executableLessons = modulePackage.lessons.filter(
      (lesson) => lesson.mode !== "output-prediction",
    );
    for (const lesson of executableLessons) {
      expect(lesson.validation.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "function_cases",
            visibility: "hidden",
          }),
        ]),
      );
    }
  });

  it("keeps the final project compatible with the multi-file validator", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    const supportedKinds = new Set([
      "file_exists",
      "file_content_regex",
      "json_file_equals",
      "file_unchanged",
      "import_statement",
      "assignment",
      "call",
      "call_count",
      "node_count",
      "function_definition",
      "function_cases",
      "variable_type",
      "variable_non_empty",
      "variable_positive",
      "stdout_regex",
    ]);
    expect(finalLesson?.validation.checks.every((check) => supportedKinds.has(check.kind))).toBe(
      true,
    );
  });

  it("ships an eight-file final observability center with structural and hidden checks", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.id).toBe("expert.security.final");
    expect(finalLesson?.mode).toBe("data-transformation");
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(finalLesson?.editor.files).toHaveLength(8);
    expect(finalLesson?.dataTransformation?.workflow).toHaveLength(4);
    expect(finalLesson?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file_content_regex",
          path: "gozlem_merkezi/models.py",
          pattern: expect.stringContaining("dataclass"),
        }),
        expect.objectContaining({
          kind: "node_count",
          nodeName: "For",
          file: "gozlem_merkezi/report.py",
          visibility: "visible",
        }),
        expect.objectContaining({
          kind: "call",
          name: "yapilandirilmis_kayit",
          file: "gozlem_merkezi/report.py",
        }),
        expect.objectContaining({
          kind: "function_cases",
          name: "gozlem_raporu",
          module: "gozlem_merkezi",
          visibility: "hidden",
        }),
      ]),
    );
  });

  it("never presents raw secrets as an expected final output", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.task.sampleOutput).toContain("[REDACTED]");
    expect(finalLesson?.task.sampleOutput).not.toContain("Bearer x");
    expect(finalLesson?.task.sampleOutput).not.toContain("'token': 'abc'");
  });
});
