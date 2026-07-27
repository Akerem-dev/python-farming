import { invoke } from "@tauri-apps/api/core";
import { appConfig } from "../../../app/appConfig";
import { runtimeClient, isTauriEnvironment } from "../../../runtime/runtimeClient";
import { runtimeLimits } from "../../../runtime/runtimeLimits";
import {
  runtimeProtocolVersion,
  type RuntimeHealthResult,
  type RuntimeSecurityProfile,
} from "../../../runtime/runtimeProtocol";
import type { DiagnosticsSnapshot } from "../types";

const documentedSecurityProfile: RuntimeSecurityProfile = {
  policyVersion: 1,
  filesystemScope: "workspace-only",
  networkAccess: "blocked",
  subprocessAccess: "blocked",
  environmentIsolated: true,
  processTreeTermination: true,
  maxWorkspaceBytes: 16 * 1024 * 1024,
  maxWorkspaceFiles: 512,
};

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
  const buildSha = appConfig.buildSha;
  const buildChannel = appConfig.buildChannel;

  if (!isTauriEnvironment()) {
    return {
      environment: "browser-preview",
      appVersion: appConfig.version,
      buildSha,
      buildChannel,
      platform,
      checkedAt,
      runtimeStatus: "unavailable",
      runtime: {
        status: "offline",
        managed: false,
        security: documentedSecurityProfile,
        message:
          "Tarayıcı ön izlemesinde yerel Python çalışma motoruna erişilemez. Güvenlik profili masaüstü build sözleşmesini gösterir; tam kontrol için masaüstü uygulamasını açın.",
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
    buildSha,
    buildChannel,
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
  const security = snapshot.runtime?.security ?? documentedSecurityProfile;

  return [
    "Python Farming Sistem Tanılama Raporu",
    `Kontrol zamanı: ${snapshot.checkedAt}`,
    `Ortam: ${snapshot.environment}`,
    `Platform: ${snapshot.platform}`,
    `Uygulama sürümü: ${snapshot.appVersion}`,
    `Build kanalı: ${snapshot.buildChannel}`,
    `Build commit: ${snapshot.buildSha}`,
    `Runtime protokolü: ${runtimeProtocolVersion}`,
    `Python durumu: ${snapshot.runtimeStatus}`,
    `Python sürümü: ${snapshot.runtime?.version ?? "bulunamadı"}`,
    `Python executable: ${snapshot.runtime?.executable ?? "bulunamadı"}`,
    `Python kaynağı: ${snapshot.runtime?.source ?? "bulunamadı"}`,
    `Python uygulama tarafından yönetiliyor: ${snapshot.runtime?.managed ? "evet" : "hayır"}`,
    `Python mesajı: ${snapshot.runtime?.message ?? "yanıt yok"}`,
    "Güvenli çalışma profili:",
    `- Politika sürümü: ${security.policyVersion}`,
    `- Dosya sistemi kapsamı: ${security.filesystemScope}`,
    `- Ağ erişimi: ${security.networkAccess}`,
    `- Alt süreç erişimi: ${security.subprocessAccess}`,
    `- Çevre değişkenleri izole: ${security.environmentIsolated ? "evet" : "hayır"}`,
    `- Süreç ağacı sonlandırma: ${security.processTreeTermination ? "evet" : "hayır"}`,
    `- Çalışma alanı boyutu: ${security.maxWorkspaceBytes} bayt`,
    `- Çalışma alanı dosyası: ${security.maxWorkspaceFiles}`,
    "Çalıştırma sözleşmesi:",
    `- Tek dosya kaynak kodu: ${runtimeLimits.maxSingleFileSourceBytes} bayt`,
    `- Çok dosyalı proje kaynak kodu: ${runtimeLimits.maxProjectSourceBytes} bayt`,
    `- Standart girdi içerik toplamı: ${runtimeLimits.maxStdinContentBytes} bayt (satır ayraçları ayrıca eklenir)`,
    `- Stdout sınırı: ${runtimeLimits.maxOutputBytesPerStream} bayt`,
    `- Stderr sınırı: ${runtimeLimits.maxOutputBytesPerStream} bayt`,
    `- Birleşik azami çıktı: ${runtimeLimits.maxCombinedOutputBytes} bayt`,
    `- Çalışma süresi: ${runtimeLimits.minTimeoutMs}-${runtimeLimits.maxTimeoutMs} ms`,
    "Tanılama mesajları:",
    ...diagnosticLines,
  ].join("\n");
}
