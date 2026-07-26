import { create } from "zustand";

export type ProgressOperation =
  | "backup-create"
  | "backup-restore"
  | "backup-delete"
  | "data-export"
  | "data-import"
  | "data-reset";

interface ProgressOperationState {
  activeOperation: ProgressOperation | null;
  tryBeginOperation: (operation: ProgressOperation) => boolean;
  finishOperation: (operation: ProgressOperation) => void;
}

export const useProgressOperationStore = create<ProgressOperationState>((set) => ({
  activeOperation: null,
  tryBeginOperation: (operation) => {
    let acquired = false;
    set((state) => {
      if (state.activeOperation !== null) {
        return state;
      }
      acquired = true;
      return { activeOperation: operation };
    });
    return acquired;
  },
  finishOperation: (operation) => {
    set((state) =>
      state.activeOperation === operation ? { activeOperation: null } : state,
    );
  },
}));
