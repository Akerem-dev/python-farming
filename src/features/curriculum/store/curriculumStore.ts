import { create } from "zustand";
import { useProgressStore } from "../../progress/store/progressStore";
import {
  getNextLesson,
  getPreviousLesson,
  getResumeLesson,
  isLessonUnlocked,
} from "../curriculumProgress";
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
  selectResumeLesson: (lastLessonId?: string | null) => void;
  selectNextLesson: () => void;
  selectPreviousLesson: () => void;
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
      const progress = useProgressStore.getState();
      const resumeLesson = getResumeLesson(
        catalog,
        progress.completedLessonIds,
        progress.lastLessonId,
      );

      set((state) => ({
        status: "ready",
        catalog,
        currentLessonId:
          state.currentLessonId &&
          isLessonUnlocked(catalog, state.currentLessonId, progress.completedLessonIds)
            ? state.currentLessonId
            : resumeLesson?.id ?? catalog.lessons[0]?.id ?? null,
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
    set((state) => {
      const completedLessonIds = useProgressStore.getState().completedLessonIds;
      return state.catalog && isLessonUnlocked(state.catalog, lessonId, completedLessonIds)
        ? { currentLessonId: lessonId }
        : state;
    }),

  selectResumeLesson: (lastLessonId) =>
    set((state) => {
      const progress = useProgressStore.getState();
      const lesson = getResumeLesson(
        state.catalog,
        progress.completedLessonIds,
        lastLessonId ?? progress.lastLessonId,
      );
      return lesson ? { currentLessonId: lesson.id } : state;
    }),

  selectNextLesson: () =>
    set((state) => {
      const lesson = getNextLesson(
        state.catalog,
        state.currentLessonId,
        useProgressStore.getState().completedLessonIds,
      );
      return lesson ? { currentLessonId: lesson.id } : state;
    }),

  selectPreviousLesson: () =>
    set((state) => {
      const lesson = getPreviousLesson(state.catalog, state.currentLessonId);
      return lesson ? { currentLessonId: lesson.id } : state;
    }),
}));

export function getCurrentLesson(
  catalog: CurriculumCatalog | null,
  currentLessonId: string | null,
): CurriculumLesson | null {
  return catalog?.lessons.find((lesson) => lesson.id === currentLessonId) ?? null;
}
