import type {
  CurriculumCatalog,
  CurriculumLesson,
  CurriculumModule,
} from "../curriculum/types";

export const beginnerGraduationLessonId = "beginner.graduation.final-exam";
export const beginnerGraduationBadgeName = "Python Farming Başlangıç Mezunu";

export interface BeginnerModuleMastery {
  id: string;
  number: string;
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export interface BeginnerGraduationSnapshot {
  graduated: boolean;
  examUnlocked: boolean;
  intermediateUnlocked: boolean;
  masteryScore: number;
  completedCoreLessons: number;
  totalCoreLessons: number;
  completedCoreModules: number;
  totalCoreModules: number;
  badgeName: string;
  moduleMastery: BeginnerModuleMastery[];
  weakTopics: BeginnerModuleMastery[];
}

function getBeginnerModules(catalog: CurriculumCatalog | null): CurriculumModule[] {
  return catalog?.levels.find((level) => level.id === "beginner")?.modules ?? [];
}

export function getBeginnerGraduationLesson(
  catalog: CurriculumCatalog | null,
): CurriculumLesson | null {
  return catalog?.lessons.find((lesson) => lesson.id === beginnerGraduationLessonId) ?? null;
}

function getCoreLessonIds(module: CurriculumModule) {
  return module.lessonIds.filter((lessonId) => lessonId !== beginnerGraduationLessonId);
}

export function getBeginnerGraduationSnapshot(
  catalog: CurriculumCatalog | null,
  completedLessonIds: readonly string[],
): BeginnerGraduationSnapshot {
  const modules = getBeginnerModules(catalog);
  const moduleMastery = modules.map((module) => {
    const lessonIds = getCoreLessonIds(module);
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
  const graduated = completedLessonIds.includes(beginnerGraduationLessonId);
  const examUnlocked = totalCoreLessons > 0 && completedCoreLessons === totalCoreLessons;
  const lessonScore = totalCoreLessons > 0 ? (completedCoreLessons / totalCoreLessons) * 75 : 0;
  const moduleScore = totalCoreModules > 0 ? (completedCoreModules / totalCoreModules) * 20 : 0;
  const masteryScore = Math.round(lessonScore + moduleScore + (graduated ? 5 : 0));
  const weakTopics = moduleMastery
    .filter((module) => module.total > 0 && module.percent < 100)
    .sort((left, right) => left.percent - right.percent || left.number.localeCompare(right.number))
    .slice(0, 3);

  return {
    graduated,
    examUnlocked,
    intermediateUnlocked: graduated,
    masteryScore,
    completedCoreLessons,
    totalCoreLessons,
    completedCoreModules,
    totalCoreModules,
    badgeName: beginnerGraduationBadgeName,
    moduleMastery,
    weakTopics,
  };
}
