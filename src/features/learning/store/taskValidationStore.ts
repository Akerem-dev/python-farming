import { create } from "zustand";
import {
  splitStdinText,
  validateChoiceAnswer,
  validateTaskSource,
} from "../services/taskValidationService";
import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../taskValidationTypes";

export type TaskValidationStatus = "idle" | "checking" | "passed" | "failed" | "error";

interface TaskValidationStore {
  status: TaskValidationStatus;
  stdinText: string;
  selectedOptionId: string | null;
  result: TaskValidationResult | null;
  errorMessage: string | null;
  isCompletionOpen: boolean;
  startSession: (stdinText?: string) => void;
  setStdinText: (value: string) => void;
  setSelectedOptionId: (value: string | null) => void;
  validateTask: (
    source: string,
    filename: string,
    spec: TaskValidationSpec,
  ) => Promise<TaskValidationResult | null>;
  clearResult: () => void;
  resetSession: (stdinText?: string) => void;
  closeCompletion: () => void;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Görev kontrol edilirken bilinmeyen bir hata oluştu.";
}

function sessionState(stdinText = "") {
  return {
    status: "idle" as const,
    stdinText,
    selectedOptionId: null,
    result: null,
    errorMessage: null,
    isCompletionOpen: false,
  };
}

export const useTaskValidationStore = create<TaskValidationStore>((set, get) => ({
  ...sessionState(),

  startSession: (stdinText = "") => set(sessionState(stdinText)),
  setStdinText: (stdinText) => set({ stdinText }),
  setSelectedOptionId: (selectedOptionId) =>
    set({
      selectedOptionId,
      status: "idle",
      result: null,
      errorMessage: null,
      isCompletionOpen: false,
    }),

  validateTask: async (source, filename, spec) => {
    if (get().status === "checking") {
      return null;
    }

    set({
      status: "checking",
      result: null,
      errorMessage: null,
      isCompletionOpen: false,
    });

    try {
      const result = spec.answer
        ? validateChoiceAnswer(spec, get().selectedOptionId)
        : await validateTaskSource({
            source,
            filename,
            stdin: splitStdinText(get().stdinText),
            spec,
          });

      set({
        status: result.passed ? "passed" : "failed",
        result,
        errorMessage: null,
        isCompletionOpen: result.passed,
      });

      return result;
    } catch (error) {
      set({
        status: "error",
        result: null,
        errorMessage: getErrorMessage(error),
        isCompletionOpen: false,
      });
      return null;
    }
  },

  clearResult: () =>
    set({
      status: "idle",
      result: null,
      errorMessage: null,
      isCompletionOpen: false,
    }),

  resetSession: (stdinText = "") => set(sessionState(stdinText)),
  closeCompletion: () => set({ isCompletionOpen: false }),
}));
