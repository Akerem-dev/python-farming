import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCurriculumCatalog } from "../../features/curriculum/services/curriculumService";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf-8"));
}

describe("published curriculum package loading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates and merges every package from the published index", async () => {
    const responses = new Map<string, unknown>();
    const index = readJson("public/content/module-packages.json") as { files: string[] };

    responses.set("/content/curriculum.json", readJson("public/content/curriculum.json"));
    responses.set("/content/module-packages.json", index);
    for (const file of index.files) {
      responses.set(file, readJson(`public${file}`));
    }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const path = String(url);
        const payload = responses.get(path);
        return {
          ok: payload !== undefined,
          status: payload === undefined ? 404 : 200,
          json: async () => payload,
        } as Response;
      }),
    );

    const catalog = await loadCurriculumCatalog();

    expect(catalog.lessons.some((lesson) => lesson.id === "intermediate.oop.store-domain-project")).toBe(true);
    expect(catalog.levels.find((level) => level.id === "intermediate")?.modules).toHaveLength(10);
  });
});
