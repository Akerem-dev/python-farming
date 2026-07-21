import type {
  CurriculumCatalog,
  CurriculumChoiceOption,
  CurriculumCodeBlock,
  CurriculumLesson,
  CurriculumLessonMode,
  CurriculumModulePackage,
  CurriculumModulePackageIndex,
} from "../types";

const curriculumUrl = "/content/curriculum.json";
const packageIndexUrl = "/content/module-packages.json";
const lessonModes = new Set<CurriculumLessonMode>([
  "code",
  "output-prediction",
  "code-completion",
  "debugging",
  "code-ordering",
  "refactoring",
]);

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

function assertPackageIndex(value: unknown): asserts value is CurriculumModulePackageIndex {
  if (!value || typeof value !== "object") {
    throw new Error("Modül paket dizini geçerli bir nesne değil.");
  }

  const candidate = value as Partial<CurriculumModulePackageIndex>;
  if (
    typeof candidate.version !== "number" ||
    !Array.isArray(candidate.files) ||
    candidate.files.some((file) => typeof file !== "string")
  ) {
    throw new Error("Modül paket dizini beklenen biçimde değil.");
  }
}

function assertChoiceOption(value: unknown): asserts value is CurriculumChoiceOption {
  if (!value || typeof value !== "object") {
    throw new Error("Tahmin görevinde geçersiz bir cevap seçeneği bulundu.");
  }

  const candidate = value as Partial<CurriculumChoiceOption>;
  if (typeof candidate.id !== "string" || typeof candidate.label !== "string") {
    throw new Error("Tahmin görevi seçenekleri beklenen biçimde değil.");
  }
}

function assertCodeBlock(value: unknown): asserts value is CurriculumCodeBlock {
  if (!value || typeof value !== "object") {
    throw new Error("Kod sıralama görevinde geçersiz bir blok bulundu.");
  }

  const candidate = value as Partial<CurriculumCodeBlock>;
  if (typeof candidate.id !== "string" || typeof candidate.code !== "string") {
    throw new Error("Kod sıralama blokları beklenen biçimde değil.");
  }
}

function assertLesson(value: unknown): asserts value is CurriculumLesson {
  if (!value || typeof value !== "object") {
    throw new Error("Modül paketinde geçersiz bir ders bulundu.");
  }

  const candidate = value as Partial<CurriculumLesson>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.moduleId !== "string" ||
    typeof candidate.order !== "number" ||
    typeof candidate.title !== "string" ||
    !candidate.task ||
    !candidate.editor ||
    !candidate.validation
  ) {
    throw new Error("Modül paketindeki ders yapısı beklenen biçimde değil.");
  }

  const mode = candidate.mode ?? "code";
  if (!lessonModes.has(mode)) {
    throw new Error(`${candidate.id} dersinde desteklenmeyen görev modu bulundu: ${mode}`);
  }

  if (mode === "output-prediction") {
    if (
      !candidate.choice ||
      typeof candidate.choice.prompt !== "string" ||
      !Array.isArray(candidate.choice.options) ||
      candidate.choice.options.length < 2
    ) {
      throw new Error(`${candidate.id} tahmin görevinin seçenekleri eksik.`);
    }

    candidate.choice.options.forEach(assertChoiceOption);
    const optionIds = candidate.choice.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      throw new Error(`${candidate.id} tahmin görevinde tekrar eden seçenek kimliği var.`);
    }

    const correctOptionId =
      candidate.validation.answer?.kind === "choice"
        ? candidate.validation.answer.correctOptionId
        : null;
    if (!correctOptionId || !optionIds.includes(correctOptionId)) {
      throw new Error(`${candidate.id} tahmin görevinin doğru cevabı seçenekler içinde değil.`);
    }
  }

  if (mode === "code-ordering") {
    if (
      !candidate.ordering ||
      typeof candidate.ordering.prompt !== "string" ||
      !Array.isArray(candidate.ordering.blocks) ||
      candidate.ordering.blocks.length < 2
    ) {
      throw new Error(`${candidate.id} kod sıralama blokları eksik.`);
    }

    candidate.ordering.blocks.forEach(assertCodeBlock);
    const blockIds = candidate.ordering.blocks.map((block) => block.id);
    if (new Set(blockIds).size !== blockIds.length) {
      throw new Error(`${candidate.id} kod sıralama görevinde tekrar eden blok kimliği var.`);
    }

    const correctBlockIds =
      candidate.validation.answer?.kind === "order"
        ? candidate.validation.answer.correctBlockIds
        : null;
    if (
      !correctBlockIds ||
      correctBlockIds.length !== blockIds.length ||
      new Set(correctBlockIds).size !== blockIds.length ||
      correctBlockIds.some((blockId) => !blockIds.includes(blockId))
    ) {
      throw new Error(`${candidate.id} kod sıralama görevinin doğru sıra verisi geçersiz.`);
    }
  }

  if (mode === "debugging") {
    if (
      !candidate.debugging ||
      typeof candidate.debugging.errorType !== "string" ||
      typeof candidate.debugging.symptom !== "string" ||
      !Array.isArray(candidate.debugging.workflow) ||
      candidate.debugging.workflow.length < 2 ||
      candidate.debugging.workflow.some((step) => typeof step !== "string")
    ) {
      throw new Error(`${candidate.id} hata ayıklama rehberi eksik.`);
    }
  }

  if (mode === "refactoring") {
    if (
      !candidate.refactoring ||
      typeof candidate.refactoring.problem !== "string" ||
      typeof candidate.refactoring.goal !== "string" ||
      !Array.isArray(candidate.refactoring.workflow) ||
      candidate.refactoring.workflow.length < 2 ||
      candidate.refactoring.workflow.some((step) => typeof step !== "string")
    ) {
      throw new Error(`${candidate.id} refactoring rehberi eksik.`);
    }

    const hasFunctionDefinitionCheck = candidate.validation.checks.some(
      (check) => check.kind === "function_definition",
    );
    const hasFunctionCasesCheck = candidate.validation.checks.some(
      (check) => check.kind === "function_cases",
    );
    if (!hasFunctionDefinitionCheck || !hasFunctionCasesCheck) {
      throw new Error(`${candidate.id} refactoring görevi fonksiyon kontrolleri içermiyor.`);
    }
  }
}

function assertModulePackage(value: unknown): asserts value is CurriculumModulePackage {
  if (!value || typeof value !== "object") {
    throw new Error("Müfredat modül paketi geçerli bir nesne değil.");
  }

  const candidate = value as Partial<CurriculumModulePackage>;
  if (typeof candidate.moduleId !== "string" || !Array.isArray(candidate.lessons)) {
    throw new Error("Müfredat modül paketi beklenen biçimde değil.");
  }

  candidate.lessons.forEach(assertLesson);
}

function isSafePackagePath(path: string) {
  return path.startsWith("/content/modules/") && !path.includes("..") && path.endsWith(".json");
}

export function mergeModulePackages(
  baseCatalog: CurriculumCatalog,
  packages: CurriculumModulePackage[],
): CurriculumCatalog {
  const modules = baseCatalog.levels.flatMap((level) => level.modules);
  const moduleIds = new Set(modules.map((module) => module.id));
  const packagedModuleIds = new Set<string>();
  const packagedLessons: CurriculumLesson[] = [];

  for (const packageData of packages) {
    if (!moduleIds.has(packageData.moduleId)) {
      throw new Error(`Bilinmeyen modül için içerik paketi bulundu: ${packageData.moduleId}`);
    }
    if (packagedModuleIds.has(packageData.moduleId)) {
      throw new Error(`Aynı modül için birden fazla içerik paketi bulundu: ${packageData.moduleId}`);
    }
    packagedModuleIds.add(packageData.moduleId);

    const lessonIds = new Set<string>();
    const orderedLessons = [...packageData.lessons].sort((left, right) => left.order - right.order);
    for (const lesson of orderedLessons) {
      if (lesson.moduleId !== packageData.moduleId) {
        throw new Error(`${lesson.id} dersi yanlış modül kimliği taşıyor.`);
      }
      if (lessonIds.has(lesson.id)) {
        throw new Error(`Modül paketinde tekrar eden ders kimliği bulundu: ${lesson.id}`);
      }
      lessonIds.add(lesson.id);
      packagedLessons.push(lesson);
    }
  }

  const baseLessons = baseCatalog.lessons.filter(
    (lesson) => !packagedModuleIds.has(lesson.moduleId),
  );
  const lessons = [...baseLessons, ...packagedLessons];
  const allLessonIds = new Set<string>();
  for (const lesson of lessons) {
    if (allLessonIds.has(lesson.id)) {
      throw new Error(`Müfredatta tekrar eden ders kimliği bulundu: ${lesson.id}`);
    }
    allLessonIds.add(lesson.id);
  }

  const levels = baseCatalog.levels.map((level) => ({
    ...level,
    modules: level.modules.map((module) => {
      const packageData = packages.find((item) => item.moduleId === module.id);
      if (!packageData) {
        return { ...module, lessonIds: [...module.lessonIds] };
      }

      return {
        ...module,
        lessonIds: [...packageData.lessons]
          .sort((left, right) => left.order - right.order)
          .map((lesson) => lesson.id),
      };
    }),
  }));

  return {
    version: baseCatalog.version,
    levels,
    lessons,
  };
}

async function readJson(url: string, label: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${label} yüklenemedi (${response.status}).`);
  }
  return response.json();
}

export async function loadCurriculumCatalog() {
  const [catalogValue, packageIndexValue] = await Promise.all([
    readJson(curriculumUrl, "Müfredat"),
    readJson(packageIndexUrl, "Modül paket dizini"),
  ]);

  assertCatalog(catalogValue);
  assertPackageIndex(packageIndexValue);

  for (const file of packageIndexValue.files) {
    if (!isSafePackagePath(file)) {
      throw new Error(`Güvenli olmayan modül paket yolu reddedildi: ${file}`);
    }
  }

  const packageValues = await Promise.all(
    packageIndexValue.files.map((file) => readJson(file, "Modül paketi")),
  );
  const packages = packageValues.map((value) => {
    assertModulePackage(value);
    return value;
  });

  return mergeModulePackages(catalogValue, packages);
}
