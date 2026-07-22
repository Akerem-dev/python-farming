import { create } from "zustand";
import type { RuntimeSourceFile } from "../../../runtime/runtimeProtocol";
import { validateExceptionTask } from "../services/exceptionTaskValidationService";
import { validateOopTask } from "../services/oopTaskValidationService";
import { validateOrderAnswer } from "../services/orderValidationService";
import { validateProjectTask } from "../services/projectTaskValidationService";
import {
  splitStdinText,
  validateChoiceAnswer,
  validateTaskSource,
} from "../services/taskValidationService";
import { validateTestingTask } from "../services/testingTaskValidationService";
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
    files: RuntimeSourceFile[],
    entrypoint: string,
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

function requiresTestingValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "test_suite");
}

function requiresOopValidation(spec: TaskValidationSpec) {
  return spec.checks.some(
    (check) => check.kind === "class_definition" || check.kind === "class_cases",
  );
}

function requiresExceptionValidation(spec: TaskValidationSpec) {
  const exceptionChecks = new Set([
    "exception_handling",
    "exception_class",
    "raise_exception",
    "function_raises",
  ]);
  return spec.checks.some((check) => exceptionChecks.has(check.kind));
}

function requiresProjectValidation(files: RuntimeSourceFile[], spec: TaskValidationSpec) {
  const projectOnlyChecks = new Set([
    "file_exists",
    "file_content_regex",
    "json_file_equals",
    "file_unchanged",
    "import_statement",
  ]);

  return (
    files.length > 1 ||
    spec.checks.some(
      (check) =>
        projectOnlyChecks.has(check.kind) ||
        ("file" in check && Boolean(check.file)) ||
        ((check.kind === "function_cases" || check.kind === "function_raises") &&
          Boolean(check.module)),
    )
  );
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

  validateTask: async (files, entrypoint, spec) => {
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
      const entrypointFile = files.find((file) => file.path === entrypoint) ?? files[0];
      if (!entrypointFile) {
        throw new Error("Kontrol edilecek Python dosyası bulunamadı.");
      }

      const stdin = splitStdinText(get().stdinText);
      const result =
        spec.answer?.kind === "choice"
          ? validateChoiceAnswer(spec, get().selectedOptionId)
          : spec.answer?.kind === "order"
            ? validateOrderAnswer(spec, get().orderedBlockIds)
            : requiresTestingValidation(spec)
              ? await validateTestingTask({ files, entrypoint, spec })
              : requiresOopValidation(spec)
                ? await validateOopTask({ files, entrypoint, stdin, spec })
                : requiresExceptionValidation(spec)
                  ? await validateExceptionTask({ files, entrypoint, stdin, spec })
                  : requiresProjectValidation(files, spec)
                    ? await validateProjectTask({ files, entrypoint, stdin, spec })
                    : await validateTaskSource({
                        source: entrypointFile.content,
                        filename: entrypointFile.path,
                        stdin,
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
