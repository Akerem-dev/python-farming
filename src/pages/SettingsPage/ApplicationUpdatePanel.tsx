import { useEffect, useMemo, useState } from "react";
import { appConfig } from "../../app/appConfig";
import { Button } from "../../components/common/Button";
import { useApplicationUpdateStore } from "../../features/updater/store/updateStore";
import { isTauriEnvironment } from "../../runtime/runtimeClient";
import styles from "./SettingsPage.module.css";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Yayın tarihi belirtilmedi";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(date);
}

export function ApplicationUpdatePanel() {
  const status = useApplicationUpdateStore((state) => state.status);
  const update = useApplicationUpdateStore((state) => state.update);
  const progress = useApplicationUpdateStore((state) => state.progress);
  const errorMessage = useApplicationUpdateStore((state) => state.errorMessage);
  const checkForUpdate = useApplicationUpdateStore((state) => state.checkForUpdate);
  const installUpdate = useApplicationUpdateStore((state) => state.installUpdate);
  const resetUpdateState = useApplicationUpdateStore((state) => state.resetUpdateState);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const desktop = isTauriEnvironment();

  useEffect(() => {
    if (status !== "available") setConfirmationOpen(false);
  }, [status]);

  useEffect(() => resetUpdateState, [resetUpdateState]);

  const busy = ["checking", "downloading", "installing", "restarting"].includes(status);
  const percentage = useMemo(() => {
    if (!progress.totalBytes || progress.totalBytes <= 0) return null;
    return Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100));
  }, [progress.downloadedBytes, progress.totalBytes]);

  const statusText = !desktop
    ? "Masaüstü uygulamasında kullanılabilir"
    : status === "checking"
      ? "Güvenli kanal denetleniyor…"
      : status === "up-to-date"
        ? "En güncel sürüm kullanılıyor."
        : status === "downloading"
          ? `Güncelleme indiriliyor${percentage === null ? "…" : `: %${percentage}`}`
          : status === "installing"
            ? "İmza doğrulandı; güncelleme kuruluyor…"
            : status === "restarting"
              ? "Kurulum tamamlandı; uygulama yeniden başlatılıyor…"
              : status === "error"
                ? errorMessage ?? "Güncelleme işlemi tamamlanamadı."
                : "Güncellemeler yalnız kullanıcı isteğiyle denetlenir ve kurulmadan önce imza doğrulanır.";

  return (
    <article className={styles.panel} aria-labelledby="application-update-title">
      <header className={styles.panelHeader}>
        <div>
          <span>Güvenli Güncelleme</span>
          <h2 id="application-update-title">Uygulama sürümü</h2>
        </div>
      </header>

      <dl className={styles.details}>
        <div>
          <dt>Yüklü sürüm</dt>
          <dd>v{appConfig.version}</dd>
        </div>
        <div>
          <dt>Kanal</dt>
          <dd>Kararlı GitHub sürümleri</dd>
        </div>
        <div>
          <dt>Doğrulama</dt>
          <dd>Tauri imzalı artifact + HTTPS</dd>
        </div>
      </dl>

      <p className={styles.note} role={status === "error" ? "alert" : "status"} aria-live="polite">
        {statusText}
      </p>

      {status === "downloading" ? (
        <div className={styles.updateProgress}>
          <progress value={progress.downloadedBytes} max={progress.totalBytes ?? undefined} />
          <span>
            {formatBytes(progress.downloadedBytes)}
            {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : " indirildi"}
          </span>
        </div>
      ) : null}

      {update ? (
        <div className={styles.updateRelease}>
          <div>
            <strong>v{update.version}</strong>
            <span>{formatDate(update.date)}</span>
          </div>
          <p>{update.notes ?? "Bu sürüm için yayın notu bulunmuyor."}</p>
        </div>
      ) : null}

      {confirmationOpen && update ? (
        <div className={styles.helpBox} role="alert">
          <strong>Kurulum onayı</strong>
          <p>
            Önce yerel ilerlemenin güvenlik yedeği oluşturulacak. Ardından v{update.version}
            indirilecek, imzası doğrulanacak, kurulacak ve uygulama yeniden başlatılacak.
          </p>
        </div>
      ) : null}

      <div className={styles.updateActions}>
        <Button
          variant="secondary"
          disabled={!desktop || busy}
          onClick={() => void checkForUpdate()}
        >
          {status === "checking" ? "Denetleniyor…" : "Güncellemeleri denetle"}
        </Button>

        {status === "available" && !confirmationOpen ? (
          <Button variant="primary" onClick={() => setConfirmationOpen(true)}>
            Kurulum ayrıntılarını göster
          </Button>
        ) : null}

        {status === "available" && confirmationOpen ? (
          <>
            <Button variant="secondary" onClick={() => setConfirmationOpen(false)}>
              Vazgeç
            </Button>
            <Button variant="primary" onClick={() => void installUpdate()}>
              Yedekle, indir ve yeniden başlat
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
