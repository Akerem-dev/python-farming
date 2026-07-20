import { create } from "zustand";
import { validateOrderAnswer } from "../services/orderValidationService";
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
export type OrderMoveDirection = "up" | "down";

interface TaskValidationStore {
  status: TaskValidationStatus;
  stdinText: string;
  selectedOptionId: string | null;
  orderedBlockIds: string[];
  result: TaskValidationResult | null;
  errorMessage: string | null;
  isCompletionOpen: boolean;
  startSession: (stdinText?: string, orderedBlockIds?: string[]) => void;
  setStdinText: (value: string) => void;
  setSelectedOptionId: (value: string | null) => void;
  moveOrderedBlock: (blockId: string, direction: OrderMoveDirection) => void;
  validateTask: (
    source: string,
    filename: string,
    spec: TaskValidationSpec,
  ) => Promise<TaskValidationResult | null>;
  clearResult: () => void;
  resetSession: (stdinText?: string, orderedBlockIds?: string[]) => void;
  closeCompletion: () => void;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Görev kontrol edilirken bilinmeyen bir hata oluştu.";
}

function sessionState(stdinText = "", orderedBlockIds: string[] = []) {
  return {
    status: "idle" as const,
    stdinText,
    selectedOptionId: null,
    orderedBlockIds: [...orderedBlockIds],
    result: null,
    errorMessage: null,
    isCompletionOpen: false,
  };
}

function clearedValidationState() {
  return {
    status: "idle" as const,
    result: null,
    errorMessage: null,
    isCompletionOpen: false,
  };
}

export const useTaskValidationStore = create<TaskValidationStore>((set, get) => ({
  ...sessionState(),

  startSession: (stdinText = "", orderedBlockIds = []) =>
    set(sessionState(stdinText, orderedBlockIds)),
  setStdinText: (stdinText) => set({ stdinText }),
  setSelectedOptionId: (selectedOptionId) =>
    set({ selectedOptionId, ...clearedValidationState() }),
  moveOrderedBlock: (blockId, direction) =>
    set((state) => {
      const currentIndex = state.orderedBlockIds.indexOf(blockId);
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (
        currentIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= state.orderedBlockIds.length
      ) {
        return state;
      }

      const orderedBlockIds = [...state.orderedBlockIds];
      const currentBlockId = orderedBlockIds[currentIndex];
      const targetBlockId = orderedBlockIds[targetIndex];
      if (currentBlockId === undefined || targetBlockId === undefined) {
        return state;
      }

      orderedBlockIds[currentIndex] = targetBlockId;
      orderedBlockIds[targetIndex] = currentBlockId;
      return { orderedBlockIds, ...clearedValidationState() };
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
      const result =
        spec.answer?.kind === "choice"
          ? validateChoiceAnswer(spec, get().selectedOptionId)
          : spec.answer?.kind === "order"
            ? validateOrderAnswer(spec, get().orderedBlockIds)
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

  clearResult: () => set(clearedValidationState()),
  resetSession: (stdinText = "", orderedBlockIds = []) =>
    set(sessionState(stdinText, orderedBlockIds)),
  closeCompletion: () => set({ isCompletionOpen: false }),
}));
