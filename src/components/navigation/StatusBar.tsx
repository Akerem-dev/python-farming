import { useEffect } from "react";
import { useDiagnosticsStore } from "../../features/diagnostics/store/diagnosticsStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  const status = useDiagnosticsStore((state) => state.status);
  const checkDiagnostics = useDiagnosticsStore((state) => state.checkDiagnostics);

  useEffect(() => {
    void checkDiagnostics();
  }, [checkDiagnostics]);

  const runtimeLabel =
    status === "checking"
      ? "Hazırlanıyor"
      : status === "ready"
        ? "Kod çalıştırma hazır"
        : status === "unavailable"
          ? "Ön izleme modu"
          : status === "offline"
            ? "Kod çalıştırma kullanılamıyor"
            : status === "error"
              ? "Bir sorun oluştu"
              : "Hazırlanıyor";

  return (
    <footer className={styles.root} aria-label="Uygulama durumu">
      <span
        className={styles.runtime}
        role="status"
        aria-live="polite"
        data-status={status}
      >
        <i aria-hidden="true" /> {runtimeLabel}
      </span>
      <span className={styles.spacer} />
      <span className={styles.localNote}>İlerlemen bu cihazda otomatik kaydediliyor</span>
    </footer>
  );
}
