import { invoke } from "@tauri-apps/api/core";
import { appConfig } from "../../../app/appConfig";
import { runtimeClient, isTauriEnvironment } from "../../../runtime/runtimeClient";
import { runtimeLimits } from "../../../runtime/runtimeLimits";
import {
  runtimeProtocolVersion,
  type RuntimeHealthResult,
} from "../../../runtime/runtimeProtocol";
import type { DiagnosticsSnapshot } from "../types";

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `diagnostics-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPlatformLabel() {
  if (typeof navigator === "undefined") {
    return "Bilinmeyen platform";
  }

  return navigator.platform || navigator.userAgent || "Bilinmeyen platform";
}

export async function collectDiagnostics(): Promise<DiagnosticsSnapshot> {
  const checkedAt = new Date().toISOString();
  const platform = getPlatformLabel();

  if (!isTauriEnvironment()) {
    return {
      environment: "browser-preview",
      appVersion: appConfig.version,
      platform,
      checkedAt,
      runtimeStatus: "offline",
      runtime: {
        status: "offline",
        message:
          "Tarayıcı ön izlemesinde yerel Python çalışma motoruna erişilemez. Tam kontrol için masaüstü uygulamasını açın.",
      },
      diagnostics: [
        {
          severity: "warning",
          code: "TAURI_UNAVAILABLE",
          message: "Tauri masaüstü köprüsü bulunamadı.",
        },
      ],
    };
  }

  const [appVersion, response] = await Promise.all([
    invoke<string>("app_version"),
    runtimeClient.send<RuntimeHealthResult>({
      requestId: createRequestId(),
      protocolVersion: runtimeProtocolVersion,
      kind: "health_check",
    }),
  ]);

  const runtime = response.payload ?? null;
  const runtimeStatus =
    response.status === "ok" && runtime?.status === "ready"
      ? "ready"
      : runtime?.status === "offline"
        ? "offline"
        : "error";

  return {
    environment: "desktop",
    appVersion,
    platform,
    checkedAt,
    runtimeStatus,
    runtime,
    diagnostics: response.diagnostics,
  };
}

export function createDiagnosticsReport(snapshot: DiagnosticsSnapshot) {
  const diagnosticLines = snapshot.diagnostics.length
    ? snapshot.diagnostics.map(
        (diagnostic) =>
          `- [${diagnostic.severity.toUpperCase()}] ${diagnostic.code}: ${diagnostic.message}`,
      )
    : ["- Tanılama mesajı yok."];

  return [
    "Python Farming Sistem Tanılama Raporu",
    `Kontrol zamanı: ${snapshot.checkedAt}`,
    `Ortam: ${snapshot.environment}`,
    `Platform: ${snapshot.platform}`,
    `Uygulama sürümü: ${snapshot.appVersion}`,
    `Runtime protokolü: ${runtimeProtocolVersion}`,
    `Python durumu: ${snapshot.runtimeStatus}`,
    `Python sürümü: ${snapshot.runtime?.version ?? "bulunamadı"}`,
    `Python executable: ${snapshot.runtime?.executable ?? "bulunamadı"}`,
    `Python mesajı: ${snapshot.runtime?.message ?? "yanıt yok"}`,
    "Güvenlik limitleri:",
    `- Kaynak kod: ${runtimeLimits.maxSourceBytes} bayt`,
    `- Standart girdi: ${runtimeLimits.maxStdinBytes} bayt`,
    `- Terminal çıktısı: ${runtimeLimits.maxOutputBytes} bayt`,
    `- Çalışma süresi: ${runtimeLimits.minTimeoutMs}-${runtimeLimits.maxTimeoutMs} ms`,
    "Tanılama mesajları:",
    ...diagnosticLines,
  ].join("\n");
}
