import { create } from "zustand";
import {
  completeLesson,
  loadProgressSnapshot,
  saveLastLesson,
} from "../services/progressService";
import type { ProgressSnapshot } from "../types";

export type ProgressStatus = "idle" | "loading" | "ready" | "saving" | "error";

interface ProgressState extends ProgressSnapshot {
  status: ProgressStatus;
  errorMessage: string | null;
  loadProgress: () => Promise<ProgressSnapshot | null>;
  completeLesson: (lessonId: string, xpReward: number) => Promise<ProgressSnapshot | null>;
  rememberLesson: (lessonId: string) => Promise<void>;
}

const initialSnapshot: ProgressSnapshot = {
  completedLessonIds: [],
  totalXp: 0,
  lastLessonId: null,
};

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "İlerleme kaydedilemedi.";
}

export const useProgressStore = create<ProgressState>((set) => ({
  ...initialSnapshot,
  status: "idle",
  errorMessage: null,

  loadProgress: async () => {
    set({ status: "loading", errorMessage: null });
    try {
      const snapshot = await loadProgressSnapshot();
      set({ ...snapshot, status: "ready", errorMessage: null });
      return snapshot;
    } catch (error) {
      set({ status: "error", errorMessage: messageFromError(error) });
      return null;
    }
  },

  completeLesson: async (lessonId, xpReward) => {
    set({ status: "saving", errorMessage: null });
    try {
      const snapshot = await completeLesson({ lessonId, xpReward });
      set({ ...snapshot, status: "ready", errorMessage: null });
      return snapshot;
    } catch (error) {
      set({ status: "error", errorMessage: messageFromError(error) });
      return null;
    }
  },

  rememberLesson: async (lessonId) => {
    try {
      const snapshot = await saveLastLesson(lessonId);
      set({ ...snapshot, status: "ready", errorMessage: null });
    } catch (error) {
      set({ status: "error", errorMessage: messageFromError(error) });
    }
  },
}));
