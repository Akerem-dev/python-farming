import { invoke } from "@tauri-apps/api/core";
import type { RuntimeEvent } from "./runtimeEvents";
import { RuntimeProtocolError, RuntimeUnavailableError } from "./runtimeErrors";
import type {
  ExecuteCodeRequest,
  RuntimeRequest,
  RuntimeResponse,
} from "./runtimeProtocol";

type RuntimeEventListener = (event: RuntimeEvent) => void;

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export interface RuntimeClient {
  send<TPayload = unknown>(request: RuntimeRequest): Promise<RuntimeResponse<TPayload>>;
  subscribe(listener: RuntimeEventListener): () => void;
}

export function isTauriEnvironment() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in (window as TauriWindow);
}

class TauriRuntimeClient implements RuntimeClient {
  private readonly listeners = new Set<RuntimeEventListener>();

  async send<TPayload = unknown>(request: RuntimeRequest): Promise<RuntimeResponse<TPayload>> {
    switch (request.kind) {
      case "health_check":
        return invoke<RuntimeResponse<TPayload>>("runtime_health_check", {
          requestId: request.requestId,
        });
      case "execute_code":
        return this.executeCode<TPayload>(request);
      case "run_tests":
        throw new RuntimeProtocolError("Test çalıştırma komutu henüz uygulanmadı.");
      case "stop_execution":
        throw new RuntimeProtocolError("Çalıştırmayı elle durdurma komutu henüz uygulanmadı.");
      default: {
        const exhaustiveCheck: never = request;
        throw new RuntimeProtocolError(`Bilinmeyen runtime isteği: ${String(exhaustiveCheck)}`);
      }
    }
  }

  subscribe(listener: RuntimeEventListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async executeCode<TPayload>(request: ExecuteCodeRequest) {
    this.emit({ type: "runtime_status", status: "busy" });

    try {
      const projectFiles = request.payload.files ?? [];
      const isProjectExecution =
        projectFiles.length > 1 ||
        projectFiles.some((file) => file.path.includes("/")) ||
        Boolean(request.payload.entrypoint && request.payload.entrypoint !== request.payload.filename);

      const response = isProjectExecution
        ? await invoke<RuntimeResponse<TPayload>>("execute_python_project", {
            request: {
              requestId: request.requestId,
              files: projectFiles,
              entrypoint: request.payload.entrypoint ?? request.payload.filename,
              stdin: request.payload.stdin,
              timeoutMs: request.payload.timeoutMs,
            },
          })
        : await invoke<RuntimeResponse<TPayload>>("execute_python", {
            request: {
              requestId: request.requestId,
              source: request.payload.source,
              filename: request.payload.filename,
              stdin: request.payload.stdin,
              timeoutMs: request.payload.timeoutMs,
            },
          });

      this.emit({ type: "runtime_status", status: "ready" });
      return response;
    } catch (error) {
      this.emit({ type: "runtime_status", status: "error" });
      throw error;
    }
  }

  private emit(event: RuntimeEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

class UnavailableRuntimeClient implements RuntimeClient {
  private readonly listeners = new Set<RuntimeEventListener>();

  async send<TPayload = unknown>(_request: RuntimeRequest): Promise<RuntimeResponse<TPayload>> {
    throw new RuntimeUnavailableError(
      "Python kodu tarayıcı ön izlemesinde çalıştırılamaz. `npm run tauri:dev` kullanın.",
    );
  }

  subscribe(listener: RuntimeEventListener) {
    this.listeners.add(listener);
    listener({ type: "runtime_status", status: "offline" });

    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const runtimeClient: RuntimeClient = isTauriEnvironment()
  ? new TauriRuntimeClient()
  : new UnavailableRuntimeClient();
