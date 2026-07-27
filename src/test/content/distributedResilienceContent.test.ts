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
      resolve(process.cwd(), "public/content/modules/distributed-resilience.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

function loadIndex() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/module-packages.json"), "utf-8"),
  ) as CurriculumModulePackageIndex;
}

describe("expert distributed systems and resilience content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons and 1370 XP", () => {
    expect(modulePackage.moduleId).toBe("distributed-resilience");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1370);
  });

  it("registers the package immediately after compilers and metaprogramming", () => {
    const files = loadIndex().files;
    const compilerIndex = files.indexOf("/content/modules/compilers-metaprogramming.json");
    expect(compilerIndex).toBeGreaterThanOrEqual(0);
    expect(files[compilerIndex + 1]).toBe("/content/modules/distributed-resilience.json");
  });

  it("covers CAP, retry, idempotency, circuit breaker, health and event ordering", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of [
      "partition",
      "retry",
      "backoff",
      "idempotency",
      "circuit breaker",
      "health",
      "sürüm",
    ]) {
      expect(text).toContain(keyword);
    }
  });

  it("keeps retry simulations deterministic and free from real sleeping", () => {
    const retryLessons = modulePackage.lessons.filter((lesson) =>
      ["expert.distributed.retry-backoff", "expert.distributed.final"].includes(lesson.id),
    );
    const source = retryLessons
      .flatMap((lesson) => [
        lesson.editor.starterCode,
        ...(lesson.editor.files?.map((file) => file.starterCode) ?? []),
      ])
      .join("\n");

    expect(source).not.toMatch(/\btime\.sleep\s*\(/);
    expect(source).not.toMatch(/\basyncio\.sleep\s*\(/);
    expect(retryLessons.flatMap((lesson) => lesson.validation.checks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file_content_regex",
          pattern: expect.stringContaining("sleep"),
        }),
      ]),
    );
  });

  it("requires real idempotency and per-entity version guards", () => {
    const idempotency = modulePackage.lessons.find(
      (lesson) => lesson.id === "expert.distributed.idempotency",
    );
    const ordering = modulePackage.lessons.find(
      (lesson) => lesson.id === "expert.distributed.event-order",
    );

    expect(idempotency?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "call", name: "set" }),
        expect.objectContaining({ kind: "function_cases", name: "benzersiz_uygula" }),
      ]),
    );
    expect(ordering?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "node_count", nodeName: "If", min: 2 }),
        expect.objectContaining({ kind: "function_cases", name: "sirali_uygula" }),
      ]),
    );
  });

  it("uses only project-validator-supported checks in the final lesson", () => {
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

  it("ships a seven-file final resilience project with hidden behavior cases", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.id).toBe("expert.distributed.final");
    expect(finalLesson?.mode).toBe("data-transformation");
    expect(finalLesson?.dataTransformation?.workflow).toHaveLength(4);
    expect(finalLesson?.editor.files).toHaveLength(7);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(finalLesson?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file_content_regex",
          path: "dayanikli_sistem/models.py",
          pattern: expect.stringContaining("dataclass"),
        }),
        expect.objectContaining({
          kind: "file_content_regex",
          path: "dayanikli_sistem/retry.py",
        }),
        expect.objectContaining({
          kind: "file_content_regex",
          path: "dayanikli_sistem/breaker.py",
        }),
        expect.objectContaining({
          kind: "function_cases",
          name: "dayaniklilik_raporu",
          module: "dayanikli_sistem",
          visibility: "hidden",
        }),
      ]),
    );
  });
});
