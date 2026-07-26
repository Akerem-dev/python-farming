import { useEffect, useState } from "react";
import { Button } from "../../components/common/Button";
import {
  createProgressBackup,
  listProgressBackups,
} from "../../features/progress/services/progressService";
import { useProgressStore } from "../../features/progress/store/progressStore";
import type { ProgressBackupOverview } from "../../features/progress/types";
import { formatBytes } from "../../runtime/runtimeLimits";
import styles from "./SettingsPage.module.css";

type BackupStatus = "loading" | "ready" | "creating" | "error";

function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return error instanceof Error
    ? error.message
    : "İlerleme yedekleri işlenirken bilinmeyen bir hata oluştu.";
}

function formatBackupDate(value: number | undefined) {
  if (!value) {
    return "Henüz yedek yok";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function ProgressBackupPanel() {
  const progressStatus = useProgressStore((state) => state.status);
  const [status, setStatus] = useState<BackupStatus>("loading");
  const [overview, setOverview] = useState<ProgressBackupOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    let active = true;
    void listProgressBackups()
      .then((value) => {
        if (!active) {
          return;
        }
        setOverview(value);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        setError(errorMessage(reason));
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  const createBackup = async () => {
    setStatus("creating");
    setError(null);
    setAnnouncement("");
    try {
      const nextOverview = await createProgressBackup();
      setOverview(nextOverview);
      setStatus("ready");
      setAnnouncement("İlerleme yedeği oluşturuldu ve bütünlük kontrolünden geçti.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    }
  };

  const available = overview?.available ?? false;
  const latestBackup = overview?.backups[0];
  const integrityLabel = latestBackup
    ? latestBackup.integrityStatus === "ok"
      ? "Sağlam"
      : "Bozuk"
    : "—";
  const actionDisabled =
    !available || progressStatus !== "ready" || status === "loading" || status === "creating";

  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <span>Yerel veri güvenliği</span>
          <h2>İlerleme yedekleri</h2>
        </div>
      </header>

      <dl className={styles.details}>
        <div>
          <dt>Saklanan yedek</dt>
          <dd>{status === "loading" ? "Yükleniyor…" : overview?.backups.length ?? "—"}</dd>
        </div>
        <div>
          <dt>Toplam boyut</dt>
          <dd>{overview ? formatBytes(overview.totalBytes) : "—"}</dd>
        </div>
        <div>
          <dt>Son yedek</dt>
          <dd>{formatBackupDate(latestBackup?.createdAt)}</dd>
        </div>
        <div>
          <dt>Bütünlük</dt>
          <dd>{integrityLabel}</dd>
        </div>
        <div>
          <dt>Yedekteki ilerleme</dt>
          <dd>
            {latestBackup?.completedLessonCount == null
              ? "—"
              : `${latestBackup.completedLessonCount} ders · ${latestBackup.totalXp ?? 0} XP`}
          </dd>
        </div>
      </dl>

      <div className={styles.panelActions}>
        <Button variant="secondary" onClick={createBackup} disabled={actionDisabled}>
          {status === "creating" ? "Yedekleniyor…" : "Şimdi yedekle"}
        </Button>
        <span role="status" aria-live="polite">
          {announcement}
        </span>
      </div>

      {error ? (
        <div className={styles.inlineError} role="alert">
          {error}
        </div>
      ) : null}

      <p className={styles.note}>
        {available
          ? `En yeni ${overview?.maxBackupCount ?? 5} yedek korunur; toplam saklama alanı ${formatBytes(overview?.maxTotalBytes ?? 0)} ile sınırlıdır. Her yeni yedek SQLite bütünlük kontrolünden geçirilir.`
          : "Yedekleme yalnız Tauri masaüstü uygulamasında kullanılabilir. Tarayıcı ön izlemesi yerel dosya sistemine yazmaz."}
      </p>
    </article>
  );
}
