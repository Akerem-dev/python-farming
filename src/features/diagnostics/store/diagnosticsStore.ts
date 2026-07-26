import { create } from "zustand";
import { collectDiagnostics } from "../services/diagnosticsService";
import type { DiagnosticsSnapshot } from "../types";

export type DiagnosticsStatus = "idle" | "checking" | "ready" | "offline" | "error";

interface DiagnosticsState {
  status: DiagnosticsStatus;
  snapshot: DiagnosticsSnapshot | null;
  errorMessage: string | null;
  checkDiagnostics: (force?: boolean) => Promise<DiagnosticsSnapshot | null>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Sistem tanılama kontrolü tamamlanamadı.";
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
      const status =
        snapshot.runtimeStatus === "ready"
          ? "ready"
          : snapshot.runtimeStatus === "offline"
            ? "offline"
            : "error";

      set({ snapshot, status, errorMessage: null });
      return snapshot;
    } catch (error) {
      set({ status: "error", errorMessage: getErrorMessage(error) });
      return null;
    }
  },
}));
