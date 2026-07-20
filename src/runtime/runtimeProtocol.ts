export const runtimeProtocolVersion = 1 as const;

export type RuntimeRequestKind = "health_check" | "execute_code" | "run_tests" | "stop_execution";

export interface RuntimeRequestBase {
  requestId: string;
  protocolVersion: typeof runtimeProtocolVersion;
  kind: RuntimeRequestKind;
}

export interface RuntimeHealthCheckRequest extends RuntimeRequestBase {
  kind: "health_check";
}

export interface ExecuteCodeRequest extends RuntimeRequestBase {
  kind: "execute_code";
  payload: {
    source: string;
    filename: string;
    stdin: string[];
    timeoutMs: number;
  };
}

export interface RunTestsRequest extends RuntimeRequestBase {
  kind: "run_tests";
  payload: {
    source: string;
    filename: string;
    testIds: string[];
    timeoutMs: number;
  };
}

export interface StopExecutionRequest extends RuntimeRequestBase {
  kind: "stop_execution";
  payload: {
    targetRequestId: string;
  };
}

export type RuntimeRequest =
  | RuntimeHealthCheckRequest
  | ExecuteCodeRequest
  | RunTestsRequest
  | StopExecutionRequest;

export type RuntimeResponseStatus = "ok" | "error" | "cancelled" | "timeout";

export interface RuntimeDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  line?: number;
  column?: number;
}

export interface RuntimeResponse<TPayload = unknown> {
  requestId: string;
  protocolVersion: typeof runtimeProtocolVersion;
  status: RuntimeResponseStatus;
  payload?: TPayload;
  diagnostics: RuntimeDiagnostic[];
}

export interface RuntimeHealthResult {
  status: "ready" | "offline";
  version?: string;
  executable?: string;
  message: string;
}

export interface ExecuteCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  truncated: boolean;
}
