import { useEffect, useMemo, useState } from "react";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import {
  createDiagnosticsReport,
} from "../../features/diagnostics/services/diagnosticsService";
import { useDiagnosticsStore } from "../../features/diagnostics/store/diagnosticsStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { formatBytes, runtimeLimits } from "../../runtime/runtimeLimits";
import { runtimeProtocolVersion } from "../../runtime/runtimeProtocol";
import { AppShell } from "../../layouts/AppShell";
import styles from "./SettingsPage.module.css";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Panoya kopyalama bu sistemde desteklenmiyor.");
  }
}

function formatCheckedAt(value: string | undefined) {
  if (!value) {
    return "Henüz kontrol edilmedi";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function SettingsPage() {
  const diagnosticsStatus = useDiagnosticsStore((state) => state.status);
  const snapshot = useDiagnosticsStore((state) => state.snapshot);
  const diagnosticsError = useDiagnosticsStore((state) => state.errorMessage);
  const checkDiagnostics = useDiagnosticsStore((state) => state.checkDiagnostics);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const totalXp = useProgressStore((state) => state.totalXp);
  const lastLessonId = useProgressStore((state) => state.lastLessonId);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    void checkDiagnostics();
  }, [checkDiagnostics]);

  const report = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    return [
      createDiagnosticsReport(snapshot),
      "Yerel ilerleme özeti:",
      `- Tamamlanan ders: ${completedLessonIds.length}`,
      `- Toplam XP: ${totalXp}`,
      `- Son ders: ${lastLessonId ?? "yok"}`,
    ].join("\n");
  }, [completedLessonIds.length, lastLessonId, snapshot, totalXp]);

  const refreshDiagnostics = () => {
    setCopyState("idle");
    void checkDiagnostics(true);
  };

  const copyReport = async () => {
    if (!report) {
      return;
    }

    try {
      await copyText(report);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  const runtimeReady = snapshot?.runtimeStatus === "ready";
  const statusLabel =
    diagnosticsStatus === "checking"
      ? "Kontrol ediliyor"
      : runtimeReady
        ? "Kullanıma hazır"
        : snapshot?.runtimeStatus === "offline"
          ? "Python bulunamadı"
          : diagnosticsStatus === "error"
            ? "Kontrol başarısız"
            : "Bekliyor";

  return (
    <AppShell
      activeRoute={routes.settings}
      context="Ayarlar / Sistem Tanılama"
      compactCurriculum
    >
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Sistem Tanılama</span>
            <h1>Python ortamını ve uygulama sağlığını kontrol et</h1>
            <p>
              Bu ekran kullanıcı kodunu çalıştırmadan yerel Python yorumlayıcısını,
              uygulama sürümünü, güvenlik limitlerini ve ilerleme kaydını inceler.
            </p>
          </div>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={refreshDiagnostics}
              disabled={diagnosticsStatus === "checking"}
            >
              {diagnosticsStatus === "checking" ? "Kontrol ediliyor…" : "Tanılamayı yenile"}
            </Button>
            <Button
              variant="primary"
              onClick={copyReport}
              disabled={!report || diagnosticsStatus === "checking"}
            >
              Raporu kopyala
            </Button>
          </div>
        </header>

        <div className={styles.copyStatus} role="status" aria-live="polite">
          {copyState === "copied"
            ? "Tanılama raporu panoya kopyalandı."
            : copyState === "error"
              ? "Rapor panoya kopyalanamadı."
              : ""}
        </div>

        {diagnosticsError ? (
          <div className={styles.errorBanner} role="alert">
            <strong>Sistem kontrolü tamamlanamadı.</strong>
            <span>{diagnosticsError}</span>
          </div>
        ) : null}

        <section className={styles.grid} aria-label="Tanılama sonuçları">
          <article className={`${styles.panel} ${runtimeReady ? styles.ready : styles.offline}`}>
            <header className={styles.panelHeader}>
              <div>
                <span>Python çalışma motoru</span>
                <h2>{statusLabel}</h2>
              </div>
              <i aria-hidden="true" />
            </header>
            <p className={styles.message} role="status" aria-live="polite">
              {snapshot?.runtime?.message ?? "Yerel Python kontrolü başlatılmadı."}
            </p>
            <dl className={styles.details}>
              <div>
                <dt>Sürüm</dt>
                <dd>{snapshot?.runtime?.version ?? "—"}</dd>
              </div>
              <div>
                <dt>Executable</dt>
                <dd><code>{snapshot?.runtime?.executable ?? "—"}</code></dd>
              </div>
              <div>
                <dt>Son kontrol</dt>
                <dd>{formatCheckedAt(snapshot?.checkedAt)}</dd>
              </div>
            </dl>
            {!runtimeReady ? (
              <div className={styles.helpBox}>
                <strong>Python bulunamıyorsa</strong>
                <p>
                  Windows'ta <code>py -3 --version</code>, macOS/Linux'ta
                  <code> python3 --version</code> komutunu kontrol et. Özel yorumlayıcı için
                  <code> PYTHON_FARMING_PYTHON</code> ortam değişkeni kullanılabilir.
                </p>
              </div>
            ) : null}
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>Uygulama ve ortam</span>
                <h2>Çalışan sürüm</h2>
              </div>
            </header>
            <dl className={styles.details}>
              <div>
                <dt>Python Farming</dt>
                <dd>v{snapshot?.appVersion ?? "—"}</dd>
              </div>
              <div>
                <dt>Çalışma ortamı</dt>
                <dd>{snapshot?.environment === "desktop" ? "Tauri masaüstü" : "Tarayıcı ön izlemesi"}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd><code>{snapshot?.platform ?? "—"}</code></dd>
              </div>
              <div>
                <dt>Runtime protokolü</dt>
                <dd>v{runtimeProtocolVersion}</dd>
              </div>
            </dl>
            <p className={styles.note}>
              Tarayıcı ön izlemesi arayüz geliştirmek içindir; gerçek Python komutları yalnız
              Tauri masaüstü uygulamasında çalışır.
            </p>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>Güvenlik sözleşmesi</span>
                <h2>Çalıştırma limitleri</h2>
              </div>
            </header>
            <dl className={styles.details}>
              <div>
                <dt>Kaynak kod</dt>
                <dd>{formatBytes(runtimeLimits.maxSourceBytes)}</dd>
              </div>
              <div>
                <dt>Standart girdi</dt>
                <dd>{formatBytes(runtimeLimits.maxStdinBytes)}</dd>
              </div>
              <div>
                <dt>Terminal çıktısı</dt>
                <dd>{formatBytes(runtimeLimits.maxOutputBytes)}</dd>
              </div>
              <div>
                <dt>En uzun çalışma</dt>
                <dd>{runtimeLimits.maxTimeoutMs / 1000} saniye</dd>
              </div>
            </dl>
            <p className={styles.note}>
              Limit aşılırsa süreç durdurulur veya çıktı güvenli biçimde kısaltılır. Öğrenci
              kodu geçici klasörde ve izole Python bayraklarıyla çalıştırılır.
            </p>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>Yerel veri</span>
                <h2>İlerleme kaydı</h2>
              </div>
            </header>
            <dl className={styles.details}>
              <div>
                <dt>Tamamlanan ders</dt>
                <dd>{completedLessonIds.length}</dd>
              </div>
              <div>
                <dt>Toplam XP</dt>
                <dd>{totalXp}</dd>
              </div>
              <div>
                <dt>Son açık ders</dt>
                <dd><code>{lastLessonId ?? "Henüz yok"}</code></dd>
              </div>
              <div>
                <dt>Depolama</dt>
                <dd>Yerel SQLite</dd>
              </div>
            </dl>
            <p className={styles.note}>
              <code>git pull</code>, <code>npm ci</code> ve normal uygulama güncellemeleri bu
              kaydı silmez. Tanılama raporu öğrenci kodunu veya ders cevaplarını içermez.
            </p>
          </article>
        </section>

        {snapshot?.diagnostics.length ? (
          <section className={styles.diagnostics} aria-labelledby="diagnostic-messages-title">
            <header>
              <span className={styles.eyebrow}>Motor mesajları</span>
              <h2 id="diagnostic-messages-title">Tanılama ayrıntıları</h2>
            </header>
            <ul>
              {snapshot.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.code}-${diagnostic.message}`}>
                  <span data-severity={diagnostic.severity}>{diagnostic.severity}</span>
                  <code>{diagnostic.code}</code>
                  <p>{diagnostic.message}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
