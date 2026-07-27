import { useEffect } from "react";
import { appConfig } from "../../app/appConfig";
import { useDiagnosticsStore } from "../../features/diagnostics/store/diagnosticsStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  const status = useDiagnosticsStore((state) => state.status);
  const snapshot = useDiagnosticsStore((state) => state.snapshot);
  const checkDiagnostics = useDiagnosticsStore((state) => state.checkDiagnostics);

  useEffect(() => {
    void checkDiagnostics();
  }, [checkDiagnostics]);

  const runtimeLabel =
    status === "checking"
      ? "Python kontrol ediliyor"
      : status === "ready"
        ? "Python hazır"
        : status === "unavailable"
          ? "Tarayıcı ön izlemesi"
          : status === "offline"
            ? "Python bulunamadı"
            : status === "error"
              ? "Runtime hatası"
              : "Runtime bekliyor";
  const appVersion = snapshot?.appVersion ?? appConfig.version;
  const buildSha = snapshot?.buildSha ?? appConfig.buildSha;
  const buildChannel = snapshot?.buildChannel ?? appConfig.buildChannel;
  const buildLabel = `${buildChannel}/${buildSha}`;

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
      <span>{snapshot?.runtime?.version ?? "Yerel yorumlayıcı otomatik algılanır"}</span>
      <span className={styles.spacer} />
      <span title={`Çalışan build: ${buildLabel}`}>
        {appConfig.name} v{appVersion} · {buildLabel}
      </span>
      <span>UTF-8</span>
      <span>Tema: Dark</span>
    </footer>
  );
}
