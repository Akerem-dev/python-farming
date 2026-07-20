import type { CurriculumCatalog } from "../types";

const curriculumUrl = "/content/curriculum.json";

function assertCatalog(value: unknown): asserts value is CurriculumCatalog {
  if (!value || typeof value !== "object") {
    throw new Error("Müfredat verisi geçerli bir nesne değil.");
  }

  const candidate = value as Partial<CurriculumCatalog>;
  if (
    typeof candidate.version !== "number" ||
    !Array.isArray(candidate.levels) ||
    !Array.isArray(candidate.lessons) ||
    candidate.lessons.length === 0
  ) {
    throw new Error("Müfredat JSON yapısı beklenen biçimde değil.");
  }
}

export async function loadCurriculumCatalog() {
  const response = await fetch(curriculumUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Müfredat yüklenemedi (${response.status}).`);
  }

  const catalog: unknown = await response.json();
  assertCatalog(catalog);
  return catalog;
}
