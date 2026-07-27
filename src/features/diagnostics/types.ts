import type { RuntimeDiagnostic, RuntimeHealthResult } from "../../runtime/runtimeProtocol";

export type DiagnosticsEnvironment = "desktop" | "browser-preview";
export type DiagnosticsRuntimeStatus = "ready" | "offline" | "unavailable" | "error";

export interface DiagnosticsSnapshot {
  environment: DiagnosticsEnvironment;
  appVersion: string;
  buildSha: string;
  buildChannel: string;
  platform: string;
  checkedAt: string;
  runtimeStatus: DiagnosticsRuntimeStatus;
  runtime: RuntimeHealthResult | null;
  diagnostics: RuntimeDiagnostic[];
}
