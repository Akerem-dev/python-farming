import type { RuntimeDiagnostic, RuntimeResponseStatus } from "./runtimeProtocol";

export type RuntimeEvent =
  | {
      type: "runtime_status";
      status: "offline" | "starting" | "ready" | "busy" | "stopping";
    }
  | {
      type: "execution_started";
      requestId: string;
    }
  | {
      type: "stdout" | "stderr";
      requestId: string;
      chunk: string;
    }
  | {
      type: "execution_finished";
      requestId: string;
      status: RuntimeResponseStatus;
      diagnostics: RuntimeDiagnostic[];
    };
