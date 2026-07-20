import { create } from "zustand";

interface LearningState {
  lessonId: string;
  currentStep: number;
  totalSteps: number;
  usedHintCount: number;
  maxHintCount: number;
  revealNextHint: () => void;
  resetLessonSession: () => void;
}

const initialState = {
  lessonId: "beginner-variables-01",
  currentStep: 1,
  totalSteps: 6,
  usedHintCount: 0,
  maxHintCount: 3,
};

export const useLearningStore = create<LearningState>((set) => ({
  ...initialState,
  revealNextHint: () =>
    set((state) => ({
      usedHintCount: Math.min(state.usedHintCount + 1, state.maxHintCount),
    })),
  resetLessonSession: () => set(initialState),
}));
