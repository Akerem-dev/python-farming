import type { TaskValidationResult } from "../taskValidationTypes";

interface TaskResultsPanelProps {
  result: TaskValidationResult | null;
  errorMessage: string | null;
  status: "idle" | "checking" | "passed" | "failed" | "error";
  className?: string;
  summaryClassName?: string;
  checkListClassName?: string;
  checkRowClassName?: string;
  passedClassName?: string;
  failedClassName?: string;
  hiddenSummaryClassName?: string;
}

export function TaskResultsPanel({
  result,
  errorMessage,
  status,
  className,
  summaryClassName,
  checkListClassName,
  checkRowClassName,
  passedClassName,
  failedClassName,
  hiddenSummaryClassName,
}: TaskResultsPanelProps) {
  if (status === "checking") {
    return (
      <section className={className} aria-live="polite">
        <strong>Görev kontrol ediliyor…</strong>
        <p>AST gereksinimleri ve gizli testler çalıştırılıyor.</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className={className} aria-live="polite">
        <strong>Kontrol motoru çalıştırılamadı</strong>
        <p>{errorMessage}</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className={className}>
        <strong>Henüz görev kontrolü yapılmadı.</strong>
        <p>Kodu çalıştırdıktan sonra “Görevi Kontrol Et” düğmesini kullan.</p>
      </section>
    );
  }

  const visibleChecks = result.checks.filter((check) => check.visibility === "visible");
  const hiddenChecks = result.checks.filter((check) => check.visibility === "hidden");
  const passedHiddenCount = hiddenChecks.filter((check) => check.passed).length;

  return (
    <section className={className} aria-live="polite">
      <div className={summaryClassName}>
        <div>
          <span>{result.passed ? "Görev tamamlandı" : "Görev henüz tamamlanmadı"}</span>
          <strong>%{result.score}</strong>
        </div>
        <p>
          {result.passed
            ? "Bütün görünen gereksinimler ve gizli testler geçti."
            : "Başarısız kontrolleri düzeltip yeniden deneyebilirsin."}
        </p>
      </div>

      <div className={checkListClassName}>
        {visibleChecks.map((check) => (
          <div
            key={check.id}
            className={`${checkRowClassName ?? ""} ${check.passed ? passedClassName ?? "" : failedClassName ?? ""}`.trim()}
          >
            <span aria-hidden="true">{check.passed ? "✓" : "×"}</span>
            <div>
              <strong>{check.label}</strong>
              <small>{check.message}</small>
            </div>
          </div>
        ))}
      </div>

      <div className={hiddenSummaryClassName}>
        <span>Gizli testler</span>
        <strong>{passedHiddenCount} / {hiddenChecks.length} geçti</strong>
      </div>

      {result.runtimeError ? (
        <details>
          <summary>Python hatasını göster</summary>
          <pre>{result.runtimeError}</pre>
        </details>
      ) : null}
    </section>
  );
}
