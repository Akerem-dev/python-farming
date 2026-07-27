import { useRef, useState } from "react";
import { Button } from "../../components/common/Button";
import {
  exportProgressData,
  importProgressData,
  progressTransferPolicy,
  resetProgressData,
} from "../../features/progress/services/progressPortabilityService";
import { useProgressOperationStore } from "../../features/progress/store/progressOperationStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import type { ProgressExportResult } from "../../features/progress/portabilityTypes";
import { isTauriEnvironment } from "../../runtime/runtimeClient";
import { formatBytes } from "../../runtime/runtimeLimits";
import styles from "./SettingsPage.module.css";

export const progressBackupsChangedEvent = "python-farming:progress-backups-changed";

type PortabilityStatus = "ready" | "exporting" | "importing" | "resetting" | "error";

function errorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return error instanceof Error
    ? error.message
    : "İlerleme verisi işlenirken bilinmeyen bir hata oluştu.";
}

function formatExportDate(value: number) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProgressDataPanel() {
  const progressStatus = useProgressStore((state) => state.status);
  const loadProgress = useProgressStore((state) => state.loadProgress);
  const activeOperation = useProgressOperationStore((state) => state.activeOperation);
  const tryBeginOperation = useProgressOperationStore((state) => state.tryBeginOperation);
  const finishOperation = useProgressOperationStore((state) => state.finishOperation);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<PortabilityStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [lastExport, setLastExport] = useState<ProgressExportResult | null>(null);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

  const desktopAvailable = isTauriEnvironment();
  const busy = activeOperation !== null;
  const actionDisabled = !desktopAvailable || progressStatus !== "ready" || busy;

  const refreshProgressAndBackups = async () => {
    const snapshot = await loadProgress();
    if (!snapshot) {
      throw new Error(
        useProgressStore.getState().errorMessage ?? "Güncellenen ilerleme kaydı yeniden yüklenemedi.",
      );
    }
    window.dispatchEvent(new Event(progressBackupsChangedEvent));
    return snapshot;
  };

  const exportData = async () => {
    if (!tryBeginOperation("data-export")) {
      return;
    }
    setStatus("exporting");
    setError(null);
    setAnnouncement("");
    try {
      const result = await exportProgressData();
      setLastExport(result);
      setStatus("ready");
      setAnnouncement(`Yedek dosyan hazır: ${result.fileName}`);
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      finishOperation("data-export");
    }
  };

  const importSelectedFile = async (file: File) => {
    if (!tryBeginOperation("data-import")) {
      return;
    }
    setStatus("importing");
    setError(null);
    setAnnouncement("");
    setShowResetConfirmation(false);
    try {
      if (file.size > progressTransferPolicy.maxPayloadBytes) {
        throw new Error(
          `Seçilen dosya ${formatBytes(progressTransferPolicy.maxPayloadBytes)} sınırını aşıyor.`,
        );
      }
      const payload = await file.text();
      const result = await importProgressData(payload);
      const snapshot = await refreshProgressAndBackups();
      if (result.snapshot.totalXp !== snapshot.totalXp) {
        throw new Error("İçe aktarılan ilerleme doğrulanamadı.");
      }
      setStatus("ready");
      setAnnouncement(
        `${snapshot.completedLessonIds.length} ders ve ${snapshot.totalXp} XP geri yüklendi. Önceki ilerlemen de yedeklendi.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      finishOperation("data-import");
    }
  };

  const resetData = async () => {
    if (!tryBeginOperation("data-reset")) {
      return;
    }
    setStatus("resetting");
    setError(null);
    setAnnouncement("");
    try {
      const result = await resetProgressData(resetConfirmation);
      const snapshot = await refreshProgressAndBackups();
      if (
        result.snapshot.totalXp !== 0 ||
        snapshot.totalXp !== 0 ||
        snapshot.completedLessonIds.length !== 0
      ) {
        throw new Error("İlerleme sıfırlanamadı.");
      }
      setStatus("ready");
      setShowResetConfirmation(false);
      setResetConfirmation("");
      setAnnouncement("İlerlemen sıfırlandı. Önceki kayıt güvenlik yedeği olarak saklandı.");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    } finally {
      finishOperation("data-reset");
    }
  };

  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <span>Verilerini taşı</span>
          <h2>İlerlemeni başka cihaza götür</h2>
        </div>
      </header>

      <p className={styles.message}>
        İlerlemeni tek bir dosya olarak sakla veya daha önce oluşturduğun dosyadan geri yükle.
        Yazdığın kodlar ve ders cevapların bu dosyaya eklenmez.
      </p>

      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void exportData()} disabled={actionDisabled}>
          {status === "exporting" ? "Dosya hazırlanıyor…" : "Yedek dosyası oluştur"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={actionDisabled}
        >
          {status === "importing" ? "Geri yükleniyor…" : "Dosyadan geri yükle"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setShowResetConfirmation((value) => !value);
            setError(null);
            setAnnouncement("");
          }}
          disabled={actionDisabled}
        >
          İlerlemeyi sıfırla
        </Button>
      </div>

      <input
        ref={fileInputRef}
        className={styles.hiddenFileInput}
        type="file"
        accept="application/json,.json"
        aria-label="Geri yüklenecek Python Farming ilerleme dosyası"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            void importSelectedFile(file);
          }
        }}
      />

      {lastExport ? (
        <div className={styles.helpBox}>
          <strong>Son oluşturulan dosya</strong>
          <p>
            {lastExport.fileName}<br />
            {lastExport.completedLessonCount} ders · {lastExport.totalXp} XP · {formatExportDate(lastExport.exportedAt)}
          </p>
        </div>
      ) : null}

      {showResetConfirmation ? (
        <div className={styles.dangerBox} role="group" aria-label="İlerleme sıfırlama onayı">
          <strong>Bütün ders ilerlemen ve XP bilgin sıfırlanacak.</strong>
          <p>
            Şu anki ilerlemen önce yedeklenecek. Devam etmek için aşağıdaki alana tam olarak
            <code>{progressTransferPolicy.resetConfirmation}</code> yaz.
          </p>
          <input
            className={styles.textInput}
            value={resetConfirmation}
            onChange={(event) => setResetConfirmation(event.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="İlerleme sıfırlama doğrulama metni"
          />
          <div className={styles.actions}>
            <Button
              variant="primary"
              onClick={() => void resetData()}
              disabled={
                actionDisabled ||
                resetConfirmation !== progressTransferPolicy.resetConfirmation
              }
            >
              {status === "resetting" ? "Sıfırlanıyor…" : "Sıfırlamayı onayla"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowResetConfirmation(false);
                setResetConfirmation("");
              }}
              disabled={busy}
            >
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.copyStatus} role="status" aria-live="polite">
        {announcement}
      </div>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      <p className={styles.note}>
        {desktopAvailable
          ? "Geri yükleme ve sıfırlama öncesinde mevcut ilerlemen otomatik olarak yedeklenir."
          : "Bu işlemler masaüstü uygulamasında kullanılabilir."}
      </p>
    </article>
  );
}
