import type {
  CurriculumCatalog,
  CurriculumLesson,
  CurriculumModule,
} from "../curriculum/types";

export const advancedGraduationLessonId = "advanced.project.final-platform";
export const advancedGraduationBadgeName = "Python Farming İleri Seviye Mezunu";

export interface AdvancedModuleMastery {
  id: string;
  number: string;
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export interface AdvancedGraduationSnapshot {
  graduated: boolean;
  projectUnlocked: boolean;
  expertUnlocked: boolean;
  masteryScore: number;
  completedCoreLessons: number;
  totalCoreLessons: number;
  completedCoreModules: number;
  totalCoreModules: number;
  badgeName: string;
  moduleMastery: AdvancedModuleMastery[];
  weakTopics: AdvancedModuleMastery[];
}

function getAdvancedModules(catalog: CurriculumCatalog | null): CurriculumModule[] {
  return catalog?.levels.find((level) => level.id === "advanced")?.modules ?? [];
}

export function getAdvancedGraduationLesson(
  catalog: CurriculumCatalog | null,
): CurriculumLesson | null {
  return catalog?.lessons.find((lesson) => lesson.id === advancedGraduationLessonId) ?? null;
}

function isCapstoneModule(module: CurriculumModule) {
  return module.id === "advanced-project";
}

export function getAdvancedGraduationSnapshot(
  catalog: CurriculumCatalog | null,
  completedLessonIds: readonly string[],
): AdvancedGraduationSnapshot {
  const modules = getAdvancedModules(catalog).filter((module) => !isCapstoneModule(module));
  const moduleMastery = modules.map((module) => {
    const lessonIds = module.lessonIds.filter(
      (lessonId) => lessonId !== advancedGraduationLessonId,
    );
    const completed = lessonIds.filter((lessonId) => completedLessonIds.includes(lessonId)).length;
    const total = lessonIds.length;

    return {
      id: module.id,
      number: module.number,
      title: module.title,
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  const totalCoreLessons = moduleMastery.reduce((sum, module) => sum + module.total, 0);
  const completedCoreLessons = moduleMastery.reduce(
    (sum, module) => sum + module.completed,
    0,
  );
  const totalCoreModules = moduleMastery.filter((module) => module.total > 0).length;
  const completedCoreModules = moduleMastery.filter(
    (module) => module.total > 0 && module.completed === module.total,
  ).length;
  const graduated = completedLessonIds.includes(advancedGraduationLessonId);
  const projectUnlocked = totalCoreLessons > 0 && completedCoreLessons === totalCoreLessons;
  const lessonScore = totalCoreLessons > 0 ? (completedCoreLessons / totalCoreLessons) * 75 : 0;
  const moduleScore = totalCoreModules > 0 ? (completedCoreModules / totalCoreModules) * 20 : 0;
  const masteryScore = Math.round(lessonScore + moduleScore + (graduated ? 5 : 0));
  const weakTopics = moduleMastery
    .filter((module) => module.total > 0 && module.percent < 100)
    .sort((left, right) => left.percent - right.percent || left.number.localeCompare(right.number))
    .slice(0, 3);

  return {
    graduated,
    projectUnlocked,
    expertUnlocked: graduated,
    masteryScore,
    completedCoreLessons,
    totalCoreLessons,
    completedCoreModules,
    totalCoreModules,
    badgeName: advancedGraduationBadgeName,
    moduleMastery,
    weakTopics,
  };
}
