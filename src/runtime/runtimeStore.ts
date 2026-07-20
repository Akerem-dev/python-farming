import { create } from "zustand";
import { runtimeClient } from "./runtimeClient";
import {
  runtimeProtocolVersion,
  type ExecuteCodeResult,
  type RuntimeDiagnostic,
  type RuntimeHealthResult,
  type RuntimeResponseStatus,
} from "./runtimeProtocol";

export type RuntimeUiStatus = "checking" | "ready" | "offline" | "running" | "error";

export interface RuntimeExecutionOutput {
  status: RuntimeResponseStatus;
  result: ExecuteCodeResult;
  diagnostics: RuntimeDiagnostic[];
}

interface RuntimeStore {
  status: RuntimeUiStatus;
  health: RuntimeHealthResult | null;
  output: RuntimeExecutionOutput | null;
  errorMessage: string | null;
  checkRuntime: () => Promise<void>;
  executeCode: (source: string, filename: string, stdin?: string[]) => Promise<void>;
  clearOutput: () => void;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Python çalışma motorunda bilinmeyen bir hata oluştu.";
}

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  status: "checking",
  health: null,
  output: null,
  errorMessage: null,

  checkRuntime: async () => {
    set({ status: "checking", errorMessage: null });

    try {
      const response = await runtimeClient.send<RuntimeHealthResult>({
        requestId: createRequestId(),
        protocolVersion: runtimeProtocolVersion,
        kind: "health_check",
      });
      const health = response.payload ?? null;

      set({
        health,
        status: response.status === "ok" && health?.status === "ready" ? "ready" : "offline",
        errorMessage:
          response.status === "ok"
            ? null
            : response.diagnostics[0]?.message ?? health?.message ?? "Python çalışma motoru çevrimdışı.",
      });
    } catch (error) {
      set({
        status: "offline",
        health: null,
        errorMessage: getErrorMessage(error),
      });
    }
  },

  executeCode: async (source, filename, stdin = []) => {
    if (get().status === "running") {
      return;
    }

    set({ status: "running", output: null, errorMessage: null });

    try {
      const response = await runtimeClient.send<ExecuteCodeResult>({
        requestId: createRequestId(),
        protocolVersion: runtimeProtocolVersion,
        kind: "execute_code",
        payload: {
          source,
          filename,
          stdin,
          timeoutMs: 4_000,
        },
      });

      if (!response.payload) {
        throw new Error("Python çalışma motoru sonuç verisi döndürmedi.");
      }

      set({
        status: "ready",
        output: {
          status: response.status,
          result: response.payload,
          diagnostics: response.diagnostics,
        },
        errorMessage: null,
      });
    } catch (error) {
      set({
        status: "error",
        output: null,
        errorMessage: getErrorMessage(error),
      });
    }
  },

  clearOutput: () => set({ output: null, errorMessage: null }),
}));
