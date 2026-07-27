import { useEffect, useState } from "react";
import { Button } from "../../components/common/Button";
import {
  createProgressBackup,
  deleteProgressBackup,
  listProgressBackups,
  restoreProgressBackup,
} from "../../features/progress/services/progressService";
import { useProgressOperationStore } from "../../features/progress/store/progressOperationStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import type {
  ProgressBackupOverview,
  ProgressBackupSummary,
} from "../../features/progress/types";
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
    timeStyle: "short",
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
  const activeOperation = useProgressOperationStore((state) => state.activeOperation);
  const tryBeginOperation = useProgressOperationStore((state) => state.tryBeginOperation);
  const finishOperation = useProgressOperationStore((state) => state.finishOperation);
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
    if (!tryBeginOperation("backup-create")) {
      return;
    }
    setStatus("creating");
    setError(null);
    setAnnouncement("");
    setPendingAction(null);
    try {
      const nextOverview = await createProgressBackup();
      setOverview(nextOverview);
      setStatus("ready");
      setAnnouncement("İlerlemenin yeni bir yedeği oluşturuldu.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      finishOperation("backup-create");
    }
  };

  const restoreBackup = async (backupId: string) => {
    if (!tryBeginOperation("backup-restore")) {
      return;
    }
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
      setAnnouncement("Seçtiğin yedek geri yüklendi. Önceki ilerlemen de güvenli biçimde saklandı.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      setActiveBackupId(null);
      finishOperation("backup-restore");
    }
  };

  const deleteBackup = async (backupId: string) => {
    if (!tryBeginOperation("backup-delete")) {
      return;
    }
    setStatus("deleting");
    setActiveBackupId(backupId);
    setError(null);
    setAnnouncement("");
    setPendingAction(null);
    try {
      const nextOverview = await deleteProgressBackup(backupId);
      setOverview(nextOverview);
      setStatus("ready");
      setAnnouncement("Seçilen yedek silindi.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      setActiveBackupId(null);
      finishOperation("backup-delete");
    }
  };

  const available = overview?.available ?? false;
  const latestBackup = overview?.backups[0];
  const corruptBackupCount =
    overview?.backups.filter((backup) => backup.integrityStatus === "corrupt").length ?? 0;
  const busy = status === "loading" || activeOperation !== null;
  const actionDisabled = !available || progressStatus !== "ready" || busy;

  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <span>Güvenlik yedekleri</span>
          <h2>İlerlemeni geri alabilirsin</h2>
        </div>
      </header>

      <p className={styles.message}>
        Yeni bir yedek oluştur veya daha önce kaydettiğin bir ilerleme noktasına dön.
      </p>

      <dl className={styles.summaryList}>
        <div>
          <dt>Kayıtlı yedek</dt>
          <dd>{status === "loading" ? "Yükleniyor…" : overview?.backups.length ?? "—"}</dd>
        </div>
        <div>
          <dt>Son yedek</dt>
          <dd>{formatBackupDate(latestBackup?.createdAt)}</dd>
        </div>
        <div>
          <dt>Son yedekteki ilerleme</dt>
          <dd>
            {latestBackup?.completedLessonCount == null
              ? "Henüz yok"
              : `${latestBackup.completedLessonCount} ders · ${latestBackup.totalXp ?? 0} XP`}
          </dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Button variant="primary" onClick={createBackup} disabled={actionDisabled}>
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
          {corruptBackupCount} yedek kullanılamıyor. Bu yedekler geri yüklenemez, yalnızca silinebilir.
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
                  {backupProgressLabel(backup)} · {backup.integrityStatus === "ok" ? "Kullanılabilir" : "Kullanılamıyor"}
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
                        ? "Bu yedek mevcut ilerlemenin yerine geçecek. Şu anki ilerlemen işlemden önce otomatik olarak saklanacak."
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
        <p className={styles.note}>Henüz kayıtlı yedek yok.</p>
      ) : null}

      <p className={styles.note}>
        {available
          ? `En yeni ${overview?.maxBackupCount ?? 5} yedek otomatik olarak korunur.`
          : "Yedekleme masaüstü uygulamasında kullanılabilir."}
      </p>
    </article>
  );
}
