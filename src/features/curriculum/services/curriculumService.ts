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
  "data-transformation",
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

function assertEditorWorkspace(lesson: CurriculumLesson) {
  const editor = lesson.editor;
  if (typeof editor.filename !== "string" || typeof editor.starterCode !== "string") {
    throw new Error(`${lesson.id} dersinin editör başlangıç dosyası geçersiz.`);
  }

  if (editor.files === undefined) {
    return;
  }
  if (!Array.isArray(editor.files) || editor.files.length === 0) {
    throw new Error(`${lesson.id} çok dosyalı çalışma alanında dosya bulunmuyor.`);
  }

  const paths = editor.files.map((file) => file.path);
  if (
    editor.files.some(
      (file) =>
        typeof file.path !== "string" ||
        !file.path.endsWith(".py") ||
        file.path.startsWith("/") ||
        file.path.includes("\\") ||
        file.path.split("/").includes("..") ||
        typeof file.starterCode !== "string" ||
        (file.readOnly !== undefined && typeof file.readOnly !== "boolean"),
    )
  ) {
    throw new Error(`${lesson.id} çok dosyalı çalışma alanında geçersiz Python dosyası var.`);
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error(`${lesson.id} çalışma alanında tekrar eden dosya yolu var.`);
  }

  const entrypoint = editor.entrypoint ?? editor.filename;
  if (!paths.includes(entrypoint)) {
    throw new Error(`${lesson.id} giriş dosyası çalışma alanında bulunmuyor: ${entrypoint}`);
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

  const lesson = candidate as CurriculumLesson;
  const validation = lesson.validation;
  const mode = lesson.mode ?? "code";
  assertEditorWorkspace(lesson);

  if (!lessonModes.has(mode)) {
    throw new Error(`${lesson.id} dersinde desteklenmeyen görev modu bulundu: ${mode}`);
  }

  if (mode === "output-prediction") {
    if (
      !lesson.choice ||
      typeof lesson.choice.prompt !== "string" ||
      !Array.isArray(lesson.choice.options) ||
      lesson.choice.options.length < 2
    ) {
      throw new Error(`${lesson.id} tahmin görevinin seçenekleri eksik.`);
    }

    lesson.choice.options.forEach(assertChoiceOption);
    const optionIds = lesson.choice.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      throw new Error(`${lesson.id} tahmin görevinde tekrar eden seçenek kimliği var.`);
    }

    const correctOptionId =
      validation.answer?.kind === "choice"
        ? validation.answer.correctOptionId
        : null;
    if (!correctOptionId || !optionIds.includes(correctOptionId)) {
      throw new Error(`${lesson.id} tahmin görevinin doğru cevabı seçenekler içinde değil.`);
    }
  }

  if (mode === "code-ordering") {
    if (
      !lesson.ordering ||
      typeof lesson.ordering.prompt !== "string" ||
      !Array.isArray(lesson.ordering.blocks) ||
      lesson.ordering.blocks.length < 2
    ) {
      throw new Error(`${lesson.id} kod sıralama blokları eksik.`);
    }

    lesson.ordering.blocks.forEach(assertCodeBlock);
    const blockIds = lesson.ordering.blocks.map((block) => block.id);
    if (new Set(blockIds).size !== blockIds.length) {
      throw new Error(`${lesson.id} kod sıralama görevinde tekrar eden blok kimliği var.`);
    }

    const correctBlockIds =
      validation.answer?.kind === "order"
        ? validation.answer.correctBlockIds
        : null;
    if (
      !correctBlockIds ||
      correctBlockIds.length !== blockIds.length ||
      new Set(correctBlockIds).size !== blockIds.length ||
      correctBlockIds.some((blockId) => !blockIds.includes(blockId))
    ) {
      throw new Error(`${lesson.id} kod sıralama görevinin doğru sıra verisi geçersiz.`);
    }
  }

  if (mode === "debugging") {
    if (
      !lesson.debugging ||
      typeof lesson.debugging.errorType !== "string" ||
      typeof lesson.debugging.symptom !== "string" ||
      !Array.isArray(lesson.debugging.workflow) ||
      lesson.debugging.workflow.length < 2 ||
      lesson.debugging.workflow.some((step) => typeof step !== "string")
    ) {
      throw new Error(`${lesson.id} hata ayıklama rehberi eksik.`);
    }
  }

  if (mode === "refactoring") {
    if (
      !lesson.refactoring ||
      typeof lesson.refactoring.problem !== "string" ||
      typeof lesson.refactoring.goal !== "string" ||
      !Array.isArray(lesson.refactoring.workflow) ||
      lesson.refactoring.workflow.length < 2 ||
      lesson.refactoring.workflow.some((step) => typeof step !== "string")
    ) {
      throw new Error(`${lesson.id} refactoring rehberi eksik.`);
    }

    const hasFunctionDefinitionCheck = validation.checks.some(
      (check) => check.kind === "function_definition",
    );
    const hasFunctionCasesCheck = validation.checks.some(
      (check) => check.kind === "function_cases",
    );
    if (!hasFunctionDefinitionCheck || !hasFunctionCasesCheck) {
      throw new Error(`${lesson.id} refactoring görevi fonksiyon kontrolleri içermiyor.`);
    }
  }

  if (mode === "data-transformation") {
    if (
      !lesson.dataTransformation ||
      typeof lesson.dataTransformation.sourceShape !== "string" ||
      typeof lesson.dataTransformation.targetShape !== "string" ||
      !Array.isArray(lesson.dataTransformation.rules) ||
      lesson.dataTransformation.rules.length < 2 ||
      lesson.dataTransformation.rules.some((rule) => typeof rule !== "string") ||
      !Array.isArray(lesson.dataTransformation.workflow) ||
      lesson.dataTransformation.workflow.length < 2 ||
      lesson.dataTransformation.workflow.some((step) => typeof step !== "string")
    ) {
      throw new Error(`${lesson.id} veri dönüştürme rehberi eksik.`);
    }

    const hasFunctionDefinitionCheck = validation.checks.some(
      (check) => check.kind === "function_definition",
    );
    const hasFunctionCasesCheck = validation.checks.some(
      (check) => check.kind === "function_cases",
    );
    const hasSequenceStructureCheck = validation.checks.some(
      (check) =>
        check.kind === "node_count" &&
        ["For", "ListComp", "GeneratorExp", "comprehension"].includes(check.nodeName),
    );
    if (!hasFunctionDefinitionCheck || !hasFunctionCasesCheck || !hasSequenceStructureCheck) {
      throw new Error(`${lesson.id} veri dönüşümü görevi yapısal ve gizli testleri içermiyor.`);
    }
  }

  if (lesson.graduation) {
    if (
      mode !== "data-transformation" ||
      typeof lesson.graduation.badgeName !== "string" ||
      typeof lesson.graduation.nextLevel !== "string" ||
      !Array.isArray(lesson.graduation.topics) ||
      lesson.graduation.topics.length < 6 ||
      lesson.graduation.topics.some((topic) => typeof topic !== "string") ||
      !Array.isArray(lesson.graduation.criteria) ||
      lesson.graduation.criteria.length < 3 ||
      lesson.graduation.criteria.some((criterion) => typeof criterion !== "string")
    ) {
      throw new Error(`${lesson.id} mezuniyet sınavı rehberi eksik.`);
    }

    const hasFunctionDefinitionCheck = validation.checks.some(
      (check) => check.kind === "function_definition",
    );
    const hasFunctionCasesCheck = validation.checks.some(
      (check) => check.kind === "function_cases",
    );
    const requiredNodeNames = ["For", "If", "Dict"];
    const hasRequiredNodes = requiredNodeNames.every((nodeName) =>
      validation.checks.some(
        (check) => check.kind === "node_count" && check.nodeName === nodeName,
      ),
    );
    const hasSetCheck = validation.checks.some(
      (check) =>
        (check.kind === "node_count" && ["Set", "SetComp"].includes(check.nodeName)) ||
        (check.kind === "call" && ["set", "add"].includes(check.name)),
    );

    if (!hasFunctionDefinitionCheck || !hasFunctionCasesCheck || !hasRequiredNodes || !hasSetCheck) {
      throw new Error(`${lesson.id} mezuniyet sınavı kapsamlı yapısal testleri içermiyor.`);
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
