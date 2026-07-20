import { create } from "zustand";
import { loadCurriculumCatalog } from "../services/curriculumService";
import type { CurriculumCatalog, CurriculumLesson } from "../types";

export type CurriculumLoadStatus = "idle" | "loading" | "ready" | "error";

interface CurriculumState {
  status: CurriculumLoadStatus;
  catalog: CurriculumCatalog | null;
  currentLessonId: string | null;
  errorMessage: string | null;
  loadCatalog: () => Promise<CurriculumCatalog | null>;
  selectLesson: (lessonId: string) => void;
  selectNextLesson: () => void;
  selectPreviousLesson: () => void;
}

function sortedLessons(catalog: CurriculumCatalog | null) {
  return [...(catalog?.lessons ?? [])].sort((left, right) => left.order - right.order);
}

export const useCurriculumStore = create<CurriculumState>((set, get) => ({
  status: "idle",
  catalog: null,
  currentLessonId: null,
  errorMessage: null,

  loadCatalog: async () => {
    if (get().status === "ready" && get().catalog) {
      return get().catalog;
    }

    set({ status: "loading", errorMessage: null });
    try {
      const catalog = await loadCurriculumCatalog();
      set((state) => ({
        status: "ready",
        catalog,
        currentLessonId:
          state.currentLessonId && catalog.lessons.some((lesson) => lesson.id === state.currentLessonId)
            ? state.currentLessonId
            : catalog.lessons[0]?.id ?? null,
        errorMessage: null,
      }));
      return catalog;
    } catch (error) {
      set({
        status: "error",
        catalog: null,
        errorMessage: error instanceof Error ? error.message : "Müfredat yüklenemedi.",
      });
      return null;
    }
  },

  selectLesson: (lessonId) =>
    set((state) =>
      state.catalog?.lessons.some((lesson) => lesson.id === lessonId)
        ? { currentLessonId: lessonId }
        : state,
    ),

  selectNextLesson: () =>
    set((state) => {
      const lessons = sortedLessons(state.catalog);
      const index = lessons.findIndex((lesson) => lesson.id === state.currentLessonId);
      return index >= 0 && index < lessons.length - 1
        ? { currentLessonId: lessons[index + 1]?.id ?? state.currentLessonId }
        : state;
    }),

  selectPreviousLesson: () =>
    set((state) => {
      const lessons = sortedLessons(state.catalog);
      const index = lessons.findIndex((lesson) => lesson.id === state.currentLessonId);
      return index > 0
        ? { currentLessonId: lessons[index - 1]?.id ?? state.currentLessonId }
        : state;
    }),
}));

export function getCurrentLesson(
  catalog: CurriculumCatalog | null,
  currentLessonId: string | null,
): CurriculumLesson | null {
  return catalog?.lessons.find((lesson) => lesson.id === currentLessonId) ?? null;
}
