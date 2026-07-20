import type {
  CurriculumCatalog,
  CurriculumLesson,
  CurriculumModulePackage,
  CurriculumModulePackageIndex,
} from "../types";

const curriculumUrl = "/content/curriculum.json";
const packageIndexUrl = "/content/module-packages.json";

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
