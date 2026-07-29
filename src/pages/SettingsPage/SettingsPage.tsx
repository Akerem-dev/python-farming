import { useEffect, useMemo, useState } from "react";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import { createDiagnosticsReport } from "../../features/diagnostics/services/diagnosticsService";
import { useDiagnosticsStore } from "../../features/diagnostics/store/diagnosticsStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { formatBytes, runtimeLimits } from "../../runtime/runtimeLimits";
import { runtimeProtocolVersion } from "../../runtime/runtimeProtocol";
import { AppShell } from "../../layouts/AppShell";
import { ProgressBackupPanel } from "./ProgressBackupPanel";
import { ProgressDataPanel } from "./ProgressDataPanel";
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
    timeStyle: "short",
  }).format(new Date(value));
}

function runtimeSourceLabel(source: "bundled" | "custom" | "system" | undefined) {
  if (source === "bundled") return "Uygulamayla birlikte geliyor";
  if (source === "custom") return "Özel geliştirici ayarı";
  if (source === "system") return "Bu cihazdaki Python";
  return "—";
}

export function SettingsPage() {
  const diagnosticsStatus = useDiagnosticsStore((state) => state.status);
  const snapshot = useDiagnosticsStore((state) => state.snapshot);
  const diagnosticsError = useDiagnosticsStore((state) => state.errorMessage);
  const checkDiagnostics = useDiagnosticsStore((state) => state.checkDiagnostics);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const totalXp = useProgressStore((state) => state.totalXp);
  const lastLessonId = useProgressStore((state) => state.lastLessonId);
  const progressStatus = useProgressStore((state) => state.status);
  const progressError = useProgressStore((state) => state.errorMessage);
  const loadProgress = useProgressStore((state) => state.loadProgress);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    void checkDiagnostics();
  }, [checkDiagnostics]);

  useEffect(() => {
    if (progressStatus === "idle") {
      void loadProgress();
    }
  }, [loadProgress, progressStatus]);

  const report = useMemo(() => {
    if (!snapshot || progressStatus !== "ready") {
      return null;
    }

    return [
      createDiagnosticsReport(snapshot),
      "Yerel ilerleme özeti:",
      `- Tamamlanan ders: ${completedLessonIds.length}`,
      `- Toplam XP: ${totalXp}`,
      `- Son ders: ${lastLessonId ?? "yok"}`,
    ].join("\n");
  }, [completedLessonIds.length, lastLessonId, progressStatus, snapshot, totalXp]);

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

  const runtimeReady = diagnosticsStatus === "ready" && snapshot?.runtimeStatus === "ready";
  const browserPreview = snapshot?.environment === "browser-preview";
  const runtimeOffline =
    diagnosticsStatus === "offline" && snapshot?.environment === "desktop";
  const security = snapshot?.runtime?.security;
  const statusLabel =
    diagnosticsStatus === "checking"
      ? "Kontrol ediliyor"
      : runtimeReady
        ? "Kullanıma hazır"
        : browserPreview
          ? "Ön izleme açık"
          : runtimeOffline
            ? "Kod çalıştırma kullanılamıyor"
            : diagnosticsStatus === "error"
              ? "Kontrol tamamlanamadı"
              : "Hazırlanıyor";

  const runtimeMessage =
    diagnosticsStatus === "checking"
      ? "Kod çalışma ortamı hazırlanıyor."
      : runtimeReady
        ? "Kodlarını çalıştırmak için gereken Python bu cihazda hazır."
        : browserPreview
          ? "Bu ön izleme arayüzü gösterir. Kod çalıştırmak için masaüstü uygulamasını aç."
          : runtimeOffline
            ? "Kod çalıştırma bileşeni bulunamadı. Uygulamayı yeniden başlatıp durumu tekrar kontrol et."
            : "Uygulama durumu henüz kontrol edilmedi.";

  const progressValue = (value: string | number) =>
    progressStatus === "ready"
      ? value
      : progressStatus === "error"
        ? "Kullanılamıyor"
        : "Yükleniyor…";

  return (
    <AppShell activeRoute={routes.settings} context="Ayarlar">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Ayarlar ve verilerin</span>
            <h1>Uygulaman hazır, ilerlemen güvende</h1>
            <p>
              Kod çalışma durumunu kontrol et, ilerlemeni yedekle ve gerektiğinde başka bir
              cihazdan geri yükle.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Button
              variant="primary"
              onClick={refreshDiagnostics}
              disabled={diagnosticsStatus === "checking"}
            >
              {diagnosticsStatus === "checking" ? "Kontrol ediliyor…" : "Durumu yenile"}
            </Button>
          </div>
        </header>

        <div className={styles.copyStatus} role="status" aria-live="polite">
          {copyState === "copied"
            ? "Sorun özeti panoya kopyalandı."
            : copyState === "error"
              ? "Sorun özeti kopyalanamadı."
              : ""}
        </div>

        {diagnosticsError ? (
          <div className={styles.errorBanner} role="alert">
            <strong>Uygulama durumu kontrol edilemedi.</strong>
            <span>{diagnosticsError}</span>
          </div>
        ) : null}

        {progressStatus === "error" ? (
          <div className={styles.errorBanner} role="alert">
            <strong>İlerlemen yüklenemedi.</strong>
            <span>{progressError ?? "Bu cihazdaki ilerleme kaydı okunamadı."}</span>
          </div>
        ) : null}

        <section className={styles.overviewGrid} aria-label="Uygulama ve ilerleme özeti">
          <article className={`${styles.panel} ${runtimeReady ? styles.ready : styles.offline}`}>
            <header className={styles.panelHeader}>
              <div>
                <span>Öğrenme ortamı</span>
                <h2>{statusLabel}</h2>
              </div>
              <i aria-hidden="true" />
            </header>
            <p className={styles.message} role="status" aria-live="polite">
              {runtimeMessage}
            </p>
            <dl className={styles.summaryList}>
              <div>
                <dt>Kod çalıştırma</dt>
                <dd>{runtimeReady ? "Hazır" : statusLabel}</dd>
              </div>
              <div>
                <dt>Python</dt>
                <dd>{snapshot?.runtime?.version ?? "Kontrol bekleniyor"}</dd>
              </div>
              <div>
                <dt>Son kontrol</dt>
                <dd>{formatCheckedAt(snapshot?.checkedAt)}</dd>
              </div>
            </dl>
            {runtimeOffline ? (
              <div className={styles.helpBox}>
                <strong>Tekrar denemeden önce</strong>
                <p>Uygulamayı kapatıp yeniden aç. Sorun sürerse aşağıdaki gelişmiş ayrıntıları aç.</p>
              </div>
            ) : browserPreview ? (
              <div className={styles.helpBox}>
                <strong>Ön izleme modu</strong>
                <p>Gerçek kod çalıştırma durumunu masaüstü uygulamasında görebilirsin.</p>
              </div>
            ) : null}
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>İlerlemen</span>
                <h2>Bu cihazda kayıtlı</h2>
              </div>
            </header>
            <p className={styles.message}>
              Derslerin ve XP bilgin uygulama güncellense bile bu cihazda korunur.
            </p>
            <dl className={styles.summaryList}>
              <div>
                <dt>Tamamlanan ders</dt>
                <dd>{progressValue(completedLessonIds.length)}</dd>
              </div>
              <div>
                <dt>Toplam XP</dt>
                <dd>{progressValue(totalXp)}</dd>
              </div>
              <div>
                <dt>Son çalışma</dt>
                <dd>{progressValue(lastLessonId ? "Kaldığın yer kayıtlı" : "Henüz başlamadın")}</dd>
              </div>
              <div>
                <dt>Kaydetme</dt>
                <dd>Otomatik</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className={styles.dataGrid} aria-label="Yedekleme ve veri işlemleri">
          <ProgressBackupPanel />
          <ProgressDataPanel />
        </section>

        <details className={styles.advancedPanel}>
          <summary>
            <span>
              <small>Gelişmiş</small>
              <strong>Teknik ayrıntılar ve destek</strong>
            </span>
            <em>Yalnız sorun giderirken aç</em>
          </summary>

          <div className={styles.advancedContent}>
            <div className={styles.advancedHeader}>
              <div>
                <span className={styles.eyebrow}>Destek bilgileri</span>
                <h2>Uygulama ve güvenlik ayrıntıları</h2>
                <p>Bu bölüm normal kullanım için gerekli değildir.</p>
              </div>
              <Button
                variant="secondary"
                onClick={copyReport}
                disabled={!report || diagnosticsStatus === "checking"}
              >
                Sorun özetini kopyala
              </Button>
            </div>

            <div className={styles.technicalGrid}>
              <article className={styles.technicalCard}>
                <h3>Çalışma ortamı</h3>
                <dl className={styles.details}>
                  <div>
                    <dt>Python Farming</dt>
                    <dd>v{snapshot?.appVersion ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Ortam</dt>
                    <dd>{snapshot?.environment === "desktop" ? "Masaüstü uygulaması" : "Tarayıcı ön izlemesi"}</dd>
                  </div>
                  <div>
                    <dt>Platform</dt>
                    <dd><code>{snapshot?.platform ?? "—"}</code></dd>
                  </div>
                  <div>
                    <dt>Python kaynağı</dt>
                    <dd>{runtimeSourceLabel(snapshot?.runtime?.source)}</dd>
                  </div>
                  <div>
                    <dt>Executable</dt>
                    <dd><code>{snapshot?.runtime?.executable ?? "—"}</code></dd>
                  </div>
                  <div>
                    <dt>Runtime protokolü</dt>
                    <dd>v{runtimeProtocolVersion}</dd>
                  </div>
                  <div>
                    <dt>Son ders kimliği</dt>
                    <dd><code>{lastLessonId ?? "—"}</code></dd>
                  </div>
                </dl>
                <p className={styles.note}>
                  Özel yorumlayıcı kullanan geliştiriciler <code>PYTHON_FARMING_PYTHON</code> ayarını
                  kullanabilir. Tanılama raporu öğrenci kodunu veya ders cevaplarını içermez.
                </p>
              </article>

              <article className={styles.technicalCard}>
                <h3>İzolasyon ve çalıştırma limitleri</h3>
                <dl className={styles.details}>
                  <div>
                    <dt>Politika sürümü</dt>
                    <dd>v{security?.policyVersion ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Dosya sistemi</dt>
                    <dd>{security?.filesystemScope === "workspace-only" ? "Yalnız çalışma alanı" : "—"}</dd>
                  </div>
                  <div>
                    <dt>Ağ erişimi</dt>
                    <dd>{security?.networkAccess === "blocked" ? "Kapalı" : "—"}</dd>
                  </div>
                  <div>
                    <dt>Alt süreç erişimi</dt>
                    <dd>{security?.subprocessAccess === "blocked" ? "Kapalı" : "—"}</dd>
                  </div>
                  <div>
                    <dt>Çalışma alanı kotası</dt>
                    <dd>{security ? formatBytes(security.maxWorkspaceBytes) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Azami dosya sayısı</dt>
                    <dd>{security?.maxWorkspaceFiles ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Tek dosya kaynak kodu</dt>
                    <dd>{formatBytes(runtimeLimits.maxSingleFileSourceBytes)}</dd>
                  </div>
                  <div>
                    <dt>Çok dosyalı proje</dt>
                    <dd>{formatBytes(runtimeLimits.maxProjectSourceBytes)}</dd>
                  </div>
                  <div>
                    <dt>Girdi içerik toplamı</dt>
                    <dd>{formatBytes(runtimeLimits.maxStdinContentBytes)}</dd>
                  </div>
                  <div>
                    <dt>Çıktı / akış</dt>
                    <dd>{formatBytes(runtimeLimits.maxOutputBytesPerStream)}</dd>
                  </div>
                  <div>
                    <dt>Birleşik azami çıktı</dt>
                    <dd>{formatBytes(runtimeLimits.maxCombinedOutputBytes)}</dd>
                  </div>
                  <div>
                    <dt>En uzun çalışma</dt>
                    <dd>{runtimeLimits.maxTimeoutMs / 1000} saniye</dd>
                  </div>
                </dl>
              </article>
            </div>

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
        </details>
      </div>
    </AppShell>
  );
}
