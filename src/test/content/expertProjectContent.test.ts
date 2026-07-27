import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CurriculumModulePackage,
  CurriculumModulePackageIndex,
} from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/modules/expert-project.json"), "utf-8"),
  ) as CurriculumModulePackage;
}

function loadIndex() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/module-packages.json"), "utf-8"),
  ) as CurriculumModulePackageIndex;
}

describe("expert capstone project content", () => {
  const modulePackage = loadPackage();
  const lesson = modulePackage.lessons[0]!;

  it("publishes one 500 XP graduation project", () => {
    expect(modulePackage.moduleId).toBe("expert-project");
    expect(modulePackage.lessons).toHaveLength(1);
    expect(lesson.id).toBe("expert.project.reliable-code-platform");
    expect(lesson.validation.xpReward).toBe(500);
    expect(lesson.mode).toBe("data-transformation");
  });

  it("registers the capstone after security and observability", () => {
    const files = loadIndex().files;
    const securityIndex = files.indexOf("/content/modules/security-observability.json");
    expect(securityIndex).toBeGreaterThanOrEqual(0);
    expect(files[securityIndex + 1]).toBe("/content/modules/expert-project.json");
  });

  it("combines every expert module in a single product", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of [
      "ast",
      "decorator",
      "threadpoolexecutor",
      "circuit breaker",
      "duplicate",
      "secret",
      "slo",
      "sha-256",
    ]) {
      expect(text).toContain(keyword);
    }
  });

  it("ships a ten-file project workspace", () => {
    expect(lesson.editor.entrypoint).toBe("main.py");
    expect(lesson.editor.files).toHaveLength(10);
    expect(lesson.editor.files?.map((file) => file.path)).toEqual([
      "main.py",
      "kod_platformu/__init__.py",
      "kod_platformu/models.py",
      "kod_platformu/registry.py",
      "kod_platformu/security.py",
      "kod_platformu/analyzer.py",
      "kod_platformu/parallel.py",
      "kod_platformu/resilience.py",
      "kod_platformu/observability.py",
      "kod_platformu/report.py",
    ]);
  });

  it("uses only checks supported by the multi-file validator", () => {
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
    expect(lesson.validation.checks.every((check) => supportedKinds.has(check.kind))).toBe(true);
  });

  it("requires structural orchestration and hidden behavior cases", () => {
    expect(lesson.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "function_definition",
          name: "analiz_raporu",
          file: "kod_platformu/report.py",
        }),
        expect.objectContaining({
          kind: "node_count",
          nodeName: "For",
          file: "kod_platformu/report.py",
          visibility: "visible",
        }),
        expect.objectContaining({
          kind: "import_statement",
          module: "concurrent.futures",
          name: "ThreadPoolExecutor",
        }),
        expect.objectContaining({
          kind: "function_cases",
          name: "analiz_raporu",
          module: "kod_platformu",
          visibility: "hidden",
        }),
      ]),
    );
  });

  it("never includes secret values or full source in the expected report", () => {
    expect(lesson.task.sampleOutput).not.toContain("abc");
    expect(lesson.task.sampleOutput).not.toContain("result = eval");
    expect(lesson.task.sampleOutput).toContain("secret_assignment");
  });
});
