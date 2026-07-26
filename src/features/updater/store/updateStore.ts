import { create } from "zustand";
import {
  checkForApplicationUpdate,
  installPendingApplicationUpdate,
} from "../services/updateService";
import type {
  ApplicationUpdateStatus,
  AvailableApplicationUpdate,
  UpdateDownloadProgress,
} from "../types";

interface ApplicationUpdateState {
  status: ApplicationUpdateStatus;
  update: AvailableApplicationUpdate | null;
  progress: UpdateDownloadProgress;
  errorMessage: string | null;
  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  resetUpdateState: () => void;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Güncelleme işlemi tamamlanamadı.";
}

const emptyProgress: UpdateDownloadProgress = {
  downloadedBytes: 0,
  totalBytes: null,
};

export const useApplicationUpdateStore = create<ApplicationUpdateState>((set, get) => ({
  status: "idle",
  update: null,
  progress: emptyProgress,
  errorMessage: null,

  checkForUpdate: async () => {
    if (["checking", "downloading", "installing", "restarting"].includes(get().status)) {
      return;
    }

    set({ status: "checking", update: null, progress: emptyProgress, errorMessage: null });
    try {
      const update = await checkForApplicationUpdate();
      set({
        status: update ? "available" : "up-to-date",
        update,
        progress: emptyProgress,
        errorMessage: null,
      });
    } catch (error) {
      set({
        status: "error",
        update: null,
        progress: emptyProgress,
        errorMessage: getErrorMessage(error),
      });
    }
  },

  installUpdate: async () => {
    if (get().status !== "available" || !get().update) return;

    set({ status: "downloading", progress: emptyProgress, errorMessage: null });
    try {
      await installPendingApplicationUpdate((progress, phase) => {
        set({ status: phase, progress });
      });
      set({ status: "restarting" });
    } catch (error) {
      set({ status: "error", errorMessage: getErrorMessage(error) });
    }
  },

  resetUpdateState: () => {
    set({ status: "idle", update: null, progress: emptyProgress, errorMessage: null });
  },
}));
