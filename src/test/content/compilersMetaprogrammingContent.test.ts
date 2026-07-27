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
      resolve(process.cwd(), "public/content/modules/compilers-metaprogramming.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

function loadIndex() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "public/content/module-packages.json"), "utf-8"),
  ) as CurriculumModulePackageIndex;
}

describe("expert compilers and metaprogramming content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered lessons and 1340 XP", () => {
    expect(modulePackage.moduleId).toBe("compilers-metaprogramming");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      modulePackage.lessons.reduce((sum, lesson) => sum + lesson.validation.xpReward, 0),
    ).toBe(1340);
  });

  it("registers the package immediately after parallelism and systems", () => {
    const files = loadIndex().files;
    const parallelismIndex = files.indexOf("/content/modules/parallelism-systems.json");
    expect(parallelismIndex).toBeGreaterThanOrEqual(0);
    expect(files[parallelismIndex + 1]).toBe(
      "/content/modules/compilers-metaprogramming.json",
    );
  });

  it("covers tokenization, visitors, transformers, decorators, descriptors and metaclasses", () => {
    const text = JSON.stringify(modulePackage).toLowerCase();
    for (const keyword of [
      "token",
      "ast.nodevisitor",
      "ast.nodetransformer",
      "fix_missing_locations",
      "functools.wraps",
      "descriptor",
      "metaclass",
    ]) {
      expect(text).toContain(keyword);
    }
  });

  it("keeps static-analysis lessons free from runtime source execution", () => {
    const analysisLessons = modulePackage.lessons.filter((lesson) =>
      ["expert.compilers.safe-analysis", "expert.compilers.final"].includes(lesson.id),
    );
    const source = analysisLessons
      .flatMap((lesson) => [
        lesson.editor.starterCode,
        ...(lesson.editor.files?.map((file) => file.starterCode) ?? []),
      ])
      .join("\n");
    const checks = analysisLessons.flatMap((lesson) => lesson.validation.checks);

    expect(source).not.toMatch(/\bexec\s*\(\s*kaynak/);
    expect(source).not.toMatch(/\beval\s*\(\s*kaynak/);
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "call", name: "parse" }),
        expect.objectContaining({
          kind: "file_content_regex",
          pattern: expect.stringContaining("ast\\.parse"),
        }),
      ]),
    );
  });

  it("ships a real NodeTransformer contract instead of text replacement", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "expert.compilers.node-transformer",
    );
    expect(lesson?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file_content_regex",
          path: "main.py",
          pattern: expect.stringContaining("PrintDonusturucu"),
        }),
        expect.objectContaining({ kind: "call", name: "fix_missing_locations" }),
        expect.objectContaining({ kind: "call", name: "unparse" }),
        expect.objectContaining({ kind: "function_cases", name: "printleri_logla" }),
      ]),
    );
  });

  it("requires metadata-preserving decorator registration", () => {
    const lesson = modulePackage.lessons.find(
      (candidate) => candidate.id === "expert.compilers.decorator-registry",
    );
    expect(lesson?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "import_statement",
          module: "functools",
          name: "wraps",
        }),
        expect.objectContaining({ kind: "function_definition", name: "komut" }),
        expect.objectContaining({ kind: "call", name: "wraps" }),
        expect.objectContaining({
          kind: "file_content_regex",
          path: "main.py",
          pattern: expect.stringContaining("ValueError"),
        }),
      ]),
    );
  });

  it("routes executable lessons through the multi-file project validator", () => {
    const specializedKinds = new Set([
      "dataclass_definition",
      "protocol_definition",
      "class_definition",
      "class_cases",
      "raise_exception",
      "function_raises",
      "exception_handling",
      "exception_class",
      "stdlib_function_cases",
      "enum_definition",
      "decorator_usage",
    ]);

    const remaining = modulePackage.lessons.flatMap((lesson) =>
      lesson.validation.checks
        .filter((check) => specializedKinds.has(check.kind))
        .map((check) => `${lesson.id}:${check.kind}`),
    );

    expect(remaining).toEqual([]);
  });

  it("uses a six-file final static-analysis project with hidden reports", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.id).toBe("expert.compilers.final");
    expect(finalLesson?.mode).toBe("data-transformation");
    expect(finalLesson?.dataTransformation?.workflow).toHaveLength(3);
    expect(finalLesson?.editor.files).toHaveLength(6);
    expect(finalLesson?.editor.entrypoint).toBe("main.py");
    expect(finalLesson?.validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file_content_regex",
          path: "statik_analiz/models.py",
          pattern: expect.stringContaining("dataclass"),
        }),
        expect.objectContaining({
          kind: "file_content_regex",
          path: "statik_analiz/visitor.py",
          pattern: expect.stringContaining("DenetimZiyaretcisi"),
        }),
        expect.objectContaining({
          kind: "node_count",
          nodeName: "ListComp",
          file: "statik_analiz/report.py",
        }),
        expect.objectContaining({
          kind: "function_cases",
          name: "denetim_raporu",
          module: "statik_analiz",
        }),
      ]),
    );
  });
});
