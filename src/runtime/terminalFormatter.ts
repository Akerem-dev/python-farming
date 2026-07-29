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
    return ">>> Kod çalışma ortamı hazırlanıyor…";
  }

  if ((status === "offline" || status === "error") && !output) {
    return [
      errorMessage ?? health?.message ?? "Kod çalıştırma şu anda kullanılamıyor.",
      "",
      ">>> Uygulamayı yeniden açıp tekrar dene.",
    ].join("\n");
  }

  if (status === "running") {
    return ">>> Kodun çalıştırılıyor…";
  }

  if (!output) {
    return ">>> Kodunu çalıştırmaya hazır.";
  }

  const sections: string[] = [];

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
    sections.push("[Süre sınırı aşıldı; işlem güvenli biçimde durduruldu.]");
  }
  if (output.result.truncated) {
    sections.push("[Çıktı çok uzun olduğu için yalnız bir bölümü gösteriliyor.]");
  }

  return sections.join("\n\n");
}
