import type {
  CurriculumCatalog,
  CurriculumLesson,
  CurriculumModule,
} from "../curriculum/types";

export const expertGraduationLessonId = "expert.project.reliable-code-platform";
export const expertGraduationBadgeName = "Python Farming Uzman Seviye Mezunu";

export interface ExpertModuleMastery {
  id: string;
  number: string;
  title: string;
  completed: number;
  total: number;
  percent: number;
}

export interface ExpertGraduationSnapshot {
  graduated: boolean;
  projectUnlocked: boolean;
  curriculumCompleted: boolean;
  masteryScore: number;
  completedCoreLessons: number;
  totalCoreLessons: number;
  completedCoreModules: number;
  totalCoreModules: number;
  badgeName: string;
  moduleMastery: ExpertModuleMastery[];
  weakTopics: ExpertModuleMastery[];
}

function getExpertModules(catalog: CurriculumCatalog | null): CurriculumModule[] {
  return catalog?.levels.find((level) => level.id === "expert")?.modules ?? [];
}

export function getExpertGraduationLesson(
  catalog: CurriculumCatalog | null,
): CurriculumLesson | null {
  return catalog?.lessons.find((lesson) => lesson.id === expertGraduationLessonId) ?? null;
}

function isCapstoneModule(module: CurriculumModule) {
  return module.id === "expert-project";
}

export function getExpertGraduationSnapshot(
  catalog: CurriculumCatalog | null,
  completedLessonIds: readonly string[],
): ExpertGraduationSnapshot {
  const modules = getExpertModules(catalog).filter((module) => !isCapstoneModule(module));
  const moduleMastery = modules.map((module) => {
    const lessonIds = module.lessonIds.filter((lessonId) => lessonId !== expertGraduationLessonId);
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
  const graduated = completedLessonIds.includes(expertGraduationLessonId);
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
    curriculumCompleted: graduated,
    masteryScore,
    completedCoreLessons,
    totalCoreLessons,
    completedCoreModules,
    totalCoreModules,
    badgeName: expertGraduationBadgeName,
    moduleMastery,
    weakTopics,
  };
}
