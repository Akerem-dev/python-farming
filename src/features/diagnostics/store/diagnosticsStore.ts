import { create } from "zustand";
import { collectDiagnostics } from "../services/diagnosticsService";
import type { DiagnosticsSnapshot } from "../types";

export type DiagnosticsStatus =
  | "idle"
  | "checking"
  | "ready"
  | "offline"
  | "unavailable"
  | "error";

interface DiagnosticsState {
  status: DiagnosticsStatus;
  snapshot: DiagnosticsSnapshot | null;
  errorMessage: string | null;
  checkDiagnostics: (force?: boolean) => Promise<DiagnosticsSnapshot | null>;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Sistem tanılama kontrolü tamamlanamadı.";
}

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  status: "idle",
  snapshot: null,
  errorMessage: null,

  checkDiagnostics: async (force = false) => {
    if (get().status === "checking") {
      return get().snapshot;
    }

    if (!force && get().snapshot) {
      return get().snapshot;
    }

    set({ status: "checking", errorMessage: null });

    try {
      const snapshot = await collectDiagnostics();
      const status = snapshot.runtimeStatus;

      set({ snapshot, status, errorMessage: null });
      return snapshot;
    } catch (error) {
      set({
        snapshot: null,
        status: "error",
        errorMessage: getErrorMessage(error),
      });
      return null;
    }
  },
}));
