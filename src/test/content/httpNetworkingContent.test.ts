import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { CurriculumModulePackage } from "../../features/curriculum/types";

function loadPackage() {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/content/modules/networking-http.json"),
      "utf-8",
    ),
  ) as CurriculumModulePackage;
}

describe("HTTP and networking module content", () => {
  const modulePackage = loadPackage();

  it("publishes seven ordered advanced lessons", () => {
    expect(modulePackage.moduleId).toBe("networking-http");
    expect(modulePackage.lessons).toHaveLength(7);
    expect(modulePackage.lessons.map((lesson) => lesson.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("awards 930 XP", () => {
    const total = modulePackage.lessons.reduce(
      (sum, lesson) => sum + lesson.validation.xpReward,
      0,
    );
    expect(total).toBe(930);
  });

  it("covers URL, Request, HTTP errors, retry and pagination", () => {
    const checks = modulePackage.lessons.flatMap(
      (lesson) => lesson.validation.checks,
    );
    expect(
      checks.some(
        (check) => check.kind === "import_statement" && check.module === "urllib.request",
      ),
    ).toBe(true);
    expect(checks.some((check) => check.kind === "exception_handling")).toBe(true);
    expect(
      checks.some(
        (check) => check.kind === "node_count" && check.nodeName === "While",
      ),
    ).toBe(true);
    expect(
      checks.some(
        (check) => check.kind === "call" && check.name === "urljoin",
      ),
    ).toBe(true);
  });

  it("keeps network access offline through read-only fake transports", () => {
    const transportLessons = modulePackage.lessons.slice(4);
    expect(
      transportLessons.every((lesson) =>
        lesson.editor.files?.some(
          (file) => file.path === "transport.py" && file.readOnly === true,
        ),
      ),
    ).toBe(true);
  });

  it("ships a layered five-file final project with hidden scenarios", () => {
    const finalLesson = modulePackage.lessons.at(-1);
    expect(finalLesson?.editor.files?.map((file) => file.path)).toEqual([
      "main.py",
      "request_builder.py",
      "client.py",
      "service.py",
      "transport.py",
    ]);
    const hiddenCases = finalLesson?.validation.checks.find(
      (check) => check.kind === "function_cases" && check.name === "api_raporu",
    );
    expect(hiddenCases?.kind).toBe("function_cases");
    if (hiddenCases?.kind === "function_cases") {
      expect(hiddenCases.cases).toHaveLength(3);
    }
  });
});
