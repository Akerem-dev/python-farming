import { useEffect, useState } from "react";
import { Button } from "../../components/common/Button";
import {
  createProgressBackup,
  deleteProgressBackup,
  listProgressBackups,
  restoreProgressBackup,
} from "../../features/progress/services/progressService";
import { useProgressStore } from "../../features/progress/store/progressStore";
import type {
  ProgressBackupOverview,
  ProgressBackupSummary,
} from "../../features/progress/types";
import { formatBytes } from "../../runtime/runtimeLimits";
import { progressBackupsChangedEvent } from "./ProgressDataPanel";
import styles from "./SettingsPage.module.css";

type BackupStatus =
  | "loading"
  | "ready"
  | "creating"
  | "restoring"
  | "deleting"
  | "error";

type PendingAction =
  | {
      kind: "restore" | "delete";
      backupId: string;
    }
  | null;

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

function backupProgressLabel(backup: ProgressBackupSummary) {
  if (backup.completedLessonCount == null || backup.totalXp == null) {
    return "İlerleme özeti okunamadı";
  }
  return `${backup.completedLessonCount} ders · ${backup.totalXp} XP`;
}

export function ProgressBackupPanel() {
  const progressStatus = useProgressStore((state) => state.status);
  const loadProgress = useProgressStore((state) => state.loadProgress);
  const [status, setStatus] = useState<BackupStatus>("loading");
  const [overview, setOverview] = useState<ProgressBackupOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [activeBackupId, setActiveBackupId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refreshBackups = () => {
      void listProgressBackups()
        .then((value) => {
          if (!active) {
            return;
          }
          setOverview(value);
          setStatus("ready");
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!active) {
            return;
          }
          setError(errorMessage(reason));
          setStatus("error");
        });
    };
    refreshBackups();
    window.addEventListener(progressBackupsChangedEvent, refreshBackups);
    return () => {
      active = false;
      window.removeEventListener(progressBackupsChangedEvent, refreshBackups);
    };
  }, []);

  const createBackup = async () => {
    setStatus("creating");
    setError(null);
    setAnnouncement("");
    setPendingAction(null);
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

  const restoreBackup = async (backupId: string) => {
    setStatus("restoring");
    setActiveBackupId(backupId);
    setError(null);
    setAnnouncement("");
    setPendingAction(null);
    try {
      const nextOverview = await restoreProgressBackup(backupId);
      const restoredSnapshot = await loadProgress();
      if (!restoredSnapshot) {
        throw new Error(
          useProgressStore.getState().errorMessage ??
            "Geri yüklenen ilerleme kaydı yeniden yüklenemedi.",
        );
      }
      setOverview(nextOverview);
      setStatus("ready");
      setAnnouncement(
        "İlerleme yedeği geri yüklendi. Önceki kayıt otomatik güvenlik yedeği olarak saklandı.",
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      setActiveBackupId(null);
    }
  };

  const deleteBackup = async (backupId: string) => {
    setStatus("deleting");
    setActiveBackupId(backupId);
    setError(null);
    setAnnouncement("");
    setPendingAction(null);
    try {
      const nextOverview = await deleteProgressBackup(backupId);
      setOverview(nextOverview);
      setStatus("ready");
      setAnnouncement("Seçilen ilerleme yedeği kalıcı olarak silindi.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      setActiveBackupId(null);
    }
  };

  const available = overview?.available ?? false;
  const latestBackup = overview?.backups[0];
  const corruptBackupCount =
    overview?.backups.filter((backup) => backup.integrityStatus === "corrupt").length ?? 0;
  const integrityLabel =
    !overview || overview.backups.length === 0
      ? "—"
      : corruptBackupCount === 0
        ? "Tümü sağlam"
        : `${corruptBackupCount} bozuk yedek`;
  const busy =
    status === "loading" ||
    status === "creating" ||
    status === "restoring" ||
    status === "deleting";
  const actionDisabled = !available || progressStatus !== "ready" || busy;

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
          <dt>Tüm yedeklerin bütünlüğü</dt>
          <dd>{integrityLabel}</dd>
        </div>
        <div>
          <dt>Son yedekteki ilerleme</dt>
          <dd>
            {latestBackup?.completedLessonCount == null
              ? "—"
              : `${latestBackup.completedLessonCount} ders · ${latestBackup.totalXp ?? 0} XP`}
          </dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={createBackup} disabled={actionDisabled}>
          {status === "creating" ? "Yedekleniyor…" : "Şimdi yedekle"}
        </Button>
        <span role="status" aria-live="polite">
          {announcement}
        </span>
      </div>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      {corruptBackupCount > 0 ? (
        <div className={styles.errorBanner} role="alert">
          {corruptBackupCount} yerel yedek bütünlük kontrolünden geçemedi. Bozuk yedekler geri
          yüklenemez; yalnızca silinebilir.
        </div>
      ) : null}

      {overview?.backups.length ? (
        <div aria-label="Kayıtlı ilerleme yedekleri">
          {overview.backups.map((backup) => {
            const isPending = pendingAction?.backupId === backup.id;
            const isActive = activeBackupId === backup.id;
            const canRestore = backup.integrityStatus === "ok" && !actionDisabled;

            return (
              <section className={styles.helpBox} key={backup.id}>
                <strong>{formatBackupDate(backup.createdAt)}</strong>
                <p>
                  {backupProgressLabel(backup)} · {formatBytes(backup.sizeBytes)} ·{" "}
                  {backup.integrityStatus === "ok" ? "Bütünlük: sağlam" : "Bütünlük: bozuk"}
                </p>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    onClick={() => setPendingAction({ kind: "restore", backupId: backup.id })}
                    disabled={!canRestore}
                  >
                    {isActive && status === "restoring" ? "Geri yükleniyor…" : "Geri yükle"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPendingAction({ kind: "delete", backupId: backup.id })}
                    disabled={actionDisabled}
                  >
                    {isActive && status === "deleting" ? "Siliniyor…" : "Sil"}
                  </Button>
                </div>

                {isPending ? (
                  <div role="group" aria-label="Yedek işlemi onayı">
                    <p>
                      {pendingAction.kind === "restore"
                        ? "Bu yedek mevcut ilerlemenin yerine geçecek. İşlemden önce mevcut kayıt otomatik olarak güvenli bir yedeğe alınacak."
                        : "Bu yedek kalıcı olarak silinecek. Bu işlem geri alınamaz."}
                    </p>
                    <div className={styles.actions}>
                      <Button
                        variant={pendingAction.kind === "restore" ? "primary" : "secondary"}
                        onClick={() =>
                          pendingAction.kind === "restore"
                            ? void restoreBackup(backup.id)
                            : void deleteBackup(backup.id)
                        }
                        disabled={actionDisabled}
                      >
                        {pendingAction.kind === "restore"
                          ? "Geri yüklemeyi onayla"
                          : "Silmeyi onayla"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setPendingAction(null)}
                        disabled={busy}
                      >
                        Vazgeç
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : status === "ready" ? (
        <p className={styles.note}>Henüz kayıtlı ilerleme yedeği yok.</p>
      ) : null}

      <p className={styles.note}>
        {available
          ? `En yeni ${overview?.maxBackupCount ?? 5} yedek korunur; toplam saklama alanı ${formatBytes(overview?.maxTotalBytes ?? 0)} ile sınırlıdır. Geri yüklemeden önce mevcut ilerleme otomatik olarak yedeklenir.`
          : "Yedekleme yalnız Tauri masaüstü uygulamasında kullanılabilir. Tarayıcı ön izlemesi yerel dosya sistemine yazmaz."}
      </p>
    </article>
  );
}
