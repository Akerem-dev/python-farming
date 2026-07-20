import type { RuntimeExecutionOutput, RuntimeUiStatus } from "./runtimeStore";
import type { RuntimeHealthResult } from "./runtimeProtocol";

interface TerminalFormatOptions {
  status: RuntimeUiStatus;
  health: RuntimeHealthResult | null;
  output: RuntimeExecutionOutput | null;
  errorMessage: string | null;
}

export function formatTerminalOutput({
  status,
  health,
  output,
  errorMessage,
}: TerminalFormatOptions) {
  if (status === "checking") {
    return "Python çalışma motoru kontrol ediliyor…";
  }

  if ((status === "offline" || status === "error") && !output) {
    return [
      errorMessage ?? health?.message ?? "Python çalışma motoru çevrimdışı.",
      "",
      "Masaüstü çalışma için: npm run tauri:dev",
    ].join("\n");
  }

  if (status === "running") {
    return `${health?.version ?? "Python 3"}\n>>> Kod çalıştırılıyor…`;
  }

  if (!output) {
    return `${health?.version ?? "Python 3"}\n>>> Kodunu çalıştırmaya hazır.`;
  }

  const sections = [health?.version ?? "Python 3"];

  if (output.result.stdout) {
    sections.push(output.result.stdout.trimEnd());
  }
  if (output.result.stderr) {
    sections.push(output.result.stderr.trimEnd());
  }
  if (!output.result.stdout && !output.result.stderr) {
    sections.push("Program çıktı üretmeden tamamlandı.");
  }

  if (output.status === "timeout") {
    sections.push("[Python Farming] Süre sınırı aşıldı; işlem güvenli biçimde durduruldu.");
  }
  if (output.result.truncated) {
    sections.push("[Python Farming] Çıktının bir bölümü boyut sınırı nedeniyle gösterilmedi.");
  }

  sections.push(
    `[Çıkış kodu: ${output.result.exitCode ?? "yok"} · ${output.result.durationMs} ms]`,
  );

  return sections.join("\n");
}
