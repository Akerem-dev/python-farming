import type {
  CurriculumCatalog,
  CurriculumLesson,
  CurriculumModule,
} from "./types";

export type ModuleAccessState =
  | "completed"
  | "active"
  | "available"
  | "locked"
  | "coming-soon";
export type LessonAccessState = "completed" | "current" | "available" | "locked";

export function getOrderedModules(catalog: CurriculumCatalog | null): CurriculumModule[] {
  return catalog?.levels.flatMap((level) => level.modules) ?? [];
}

export function getModuleLessons(
  catalog: CurriculumCatalog | null,
  moduleId: string,
): CurriculumLesson[] {
  if (!catalog) {
    return [];
  }

  const module = getOrderedModules(catalog).find((item) => item.id === moduleId);
  if (!module) {
    return [];
  }

  return module.lessonIds
    .map((lessonId) => catalog.lessons.find((lesson) => lesson.id === lessonId))
    .filter((lesson): lesson is CurriculumLesson => Boolean(lesson))
    .sort((left, right) => left.order - right.order);
}

export function getOrderedLessons(catalog: CurriculumCatalog | null): CurriculumLesson[] {
  return getOrderedModules(catalog).flatMap((module) => getModuleLessons(catalog, module.id));
}

export function isModuleCompleted(
  module: CurriculumModule,
  completedLessonIds: readonly string[],
): boolean {
  return (
    module.lessonIds.length > 0 &&
    module.lessonIds.every((lessonId) => completedLessonIds.includes(lessonId))
  );
}

export function getModuleProgress(
  module: CurriculumModule,
  completedLessonIds: readonly string[],
) {
  const total = module.lessonIds.length;
  const completed = module.lessonIds.filter((lessonId) =>
    completedLessonIds.includes(lessonId),
  ).length;

  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function getContentModules(catalog: CurriculumCatalog | null) {
  return getOrderedModules(catalog).filter((module) => module.lessonIds.length > 0);
}

export function isModuleUnlocked(
  catalog: CurriculumCatalog | null,
  moduleId: string,
  completedLessonIds: readonly string[],
): boolean {
  const modules = getContentModules(catalog);
  const moduleIndex = modules.findIndex((module) => module.id === moduleId);

  if (moduleIndex < 0) {
    return false;
  }

  if (moduleIndex === 0) {
    return true;
  }

  const previousModule = modules[moduleIndex - 1];
  return previousModule ? isModuleCompleted(previousModule, completedLessonIds) : false;
}

export function getModuleAccessState(
  catalog: CurriculumCatalog | null,
  module: CurriculumModule,
  completedLessonIds: readonly string[],
  currentModuleId: string | null,
): ModuleAccessState {
  if (module.lessonIds.length === 0) {
    return "coming-soon";
  }

  if (isModuleCompleted(module, completedLessonIds)) {
    return "completed";
  }

  if (!isModuleUnlocked(catalog, module.id, completedLessonIds)) {
    return "locked";
  }

  return currentModuleId === module.id ? "active" : "available";
}

export function isLessonUnlocked(
  catalog: CurriculumCatalog | null,
  lessonId: string,
  completedLessonIds: readonly string[],
): boolean {
  if (!catalog) {
    return false;
  }

  const lesson = catalog.lessons.find((item) => item.id === lessonId);
  if (!lesson) {
    return false;
  }

  // Yeni içerikler daha eski bir ön koşul eklese bile, önceki sürümlerde
  // tamamlanan dersler tekrar ve inceleme amacıyla açılabilir kalır.
  if (completedLessonIds.includes(lessonId)) {
    return true;
  }

  if (!isModuleUnlocked(catalog, lesson.moduleId, completedLessonIds)) {
    return false;
  }

  const lessons = getModuleLessons(catalog, lesson.moduleId);
  const lessonIndex = lessons.findIndex((item) => item.id === lessonId);

  if (lessonIndex <= 0) {
    return lessonIndex === 0;
  }

  const previousLesson = lessons[lessonIndex - 1];
  return previousLesson ? completedLessonIds.includes(previousLesson.id) : false;
}

export function getLessonAccessState(
  catalog: CurriculumCatalog | null,
  lessonId: string,
  completedLessonIds: readonly string[],
  currentLessonId: string | null,
): LessonAccessState {
  if (completedLessonIds.includes(lessonId)) {
    return "completed";
  }

  if (!isLessonUnlocked(catalog, lessonId, completedLessonIds)) {
    return "locked";
  }

  return currentLessonId === lessonId ? "current" : "available";
}

export function getResumeLesson(
  catalog: CurriculumCatalog | null,
  completedLessonIds: readonly string[],
  lastLessonId: string | null,
): CurriculumLesson | null {
  const lessons = getOrderedLessons(catalog);
  if (lessons.length === 0) {
    return null;
  }

  const firstUnlockedIncomplete = lessons.find(
    (lesson) =>
      !completedLessonIds.includes(lesson.id) &&
      isLessonUnlocked(catalog, lesson.id, completedLessonIds),
  );

  const lastLesson = lessons.find((lesson) => lesson.id === lastLessonId) ?? null;
  if (
    lastLesson &&
    !completedLessonIds.includes(lastLesson.id) &&
    isLessonUnlocked(catalog, lastLesson.id, completedLessonIds)
  ) {
    return lastLesson;
  }

  if (lastLesson && completedLessonIds.includes(lastLesson.id)) {
    const lastIndex = lessons.findIndex((lesson) => lesson.id === lastLesson.id);
    const nextLesson = lessons
      .slice(lastIndex + 1)
      .find(
        (lesson) =>
          !completedLessonIds.includes(lesson.id) &&
          isLessonUnlocked(catalog, lesson.id, completedLessonIds),
      );
    if (nextLesson) {
      return nextLesson;
    }
  }

  return firstUnlockedIncomplete ?? lastLesson ?? lessons[0] ?? null;
}

export function getNextLesson(
  catalog: CurriculumCatalog | null,
  currentLessonId: string | null,
  completedLessonIds: readonly string[],
): CurriculumLesson | null {
  const lessons = getOrderedLessons(catalog);
  const index = lessons.findIndex((lesson) => lesson.id === currentLessonId);
  const nextLesson = index >= 0 ? lessons[index + 1] ?? null : null;

  return nextLesson && isLessonUnlocked(catalog, nextLesson.id, completedLessonIds)
    ? nextLesson
    : null;
}

export function getPreviousLesson(
  catalog: CurriculumCatalog | null,
  currentLessonId: string | null,
): CurriculumLesson | null {
  const lessons = getOrderedLessons(catalog);
  const index = lessons.findIndex((lesson) => lesson.id === currentLessonId);
  return index > 0 ? lessons[index - 1] ?? null : null;
}
