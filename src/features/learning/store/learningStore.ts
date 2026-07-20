import { create } from "zustand";

interface LearningState {
  lessonId: string;
  currentStep: number;
  totalSteps: number;
  usedHintCount: number;
  maxHintCount: number;
  startLesson: (lessonId: string, totalSteps: number, maxHintCount: number) => void;
  revealNextHint: () => void;
  resetLessonSession: () => void;
}

const initialState = {
  lessonId: "beginner.variables.introduction",
  currentStep: 1,
  totalSteps: 3,
  usedHintCount: 0,
  maxHintCount: 3,
};

export const useLearningStore = create<LearningState>((set) => ({
  ...initialState,
  startLesson: (lessonId, totalSteps, maxHintCount) =>
    set({
      lessonId,
      currentStep: 1,
      totalSteps: Math.max(1, totalSteps),
      usedHintCount: 0,
      maxHintCount: Math.max(0, maxHintCount),
    }),
  revealNextHint: () =>
    set((state) => ({
      usedHintCount: Math.min(state.usedHintCount + 1, state.maxHintCount),
    })),
  resetLessonSession: () => set(initialState),
}));
