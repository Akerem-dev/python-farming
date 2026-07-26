import type { RuntimeDiagnostic, RuntimeHealthResult } from "../../runtime/runtimeProtocol";

export type DiagnosticsEnvironment = "desktop" | "browser-preview";

export interface DiagnosticsSnapshot {
  environment: DiagnosticsEnvironment;
  appVersion: string;
  platform: string;
  checkedAt: string;
  runtimeStatus: "ready" | "offline" | "error";
  runtime: RuntimeHealthResult | null;
  diagnostics: RuntimeDiagnostic[];
}
