import { useRef, useState } from "react";
import { Button } from "../../components/common/Button";
import {
  exportProgressData,
  importProgressData,
  progressTransferPolicy,
  resetProgressData,
} from "../../features/progress/services/progressPortabilityService";
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
    timeStyle: "medium",
  }).format(new Date(value));
}

export function ProgressDataPanel() {
  const progressStatus = useProgressStore((state) => state.status);
  const loadProgress = useProgressStore((state) => state.loadProgress);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<PortabilityStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [lastExport, setLastExport] = useState<ProgressExportResult | null>(null);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");

  const desktopAvailable = isTauriEnvironment();
  const busy = status === "exporting" || status === "importing" || status === "resetting";
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
    setStatus("exporting");
    setError(null);
    setAnnouncement("");
    try {
      const result = await exportProgressData();
      setLastExport(result);
      setStatus("ready");
      setAnnouncement(`İlerleme dosyası oluşturuldu: ${result.fileName}`);
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    }
  };

  const importSelectedFile = async (file: File) => {
    setStatus("importing");
    setError(null);
    setAnnouncement("");
    setShowResetConfirmation(false);
    try {
      if (file.size > progressTransferPolicy.maxPayloadBytes) {
        throw new Error(
          `Seçilen dosya ${formatBytes(progressTransferPolicy.maxPayloadBytes)} içe aktarma sınırını aşıyor.`,
        );
      }
      const payload = await file.text();
      const result = await importProgressData(payload);
      const snapshot = await refreshProgressAndBackups();
      setStatus("ready");
      setAnnouncement(
        `${snapshot.completedLessonIds.length} ders ve ${snapshot.totalXp} XP içe aktarıldı. Önceki kayıt otomatik güvenlik yedeğine alındı.`,
      );
      if (result.snapshot.totalXp !== snapshot.totalXp) {
        throw new Error("İçe aktarılan veri ile yeniden yüklenen SQLite kaydı eşleşmiyor.");
      }
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    }
  };

  const resetData = async () => {
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
        throw new Error("İlerleme sıfırlama sonucu boş SQLite kaydıyla eşleşmiyor.");
      }
      setStatus("ready");
      setShowResetConfirmation(false);
      setResetConfirmation("");
      setAnnouncement(
        "İlerleme sıfırlandı. Önceki kayıt otomatik güvenlik yedeği olarak saklandı.",
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("error");
    }
  };

  return (
    <article className={styles.panel}>
      <header className={styles.panelHeader}>
        <div>
          <span>Veri taşınabilirliği</span>
          <h2>Dışa aktar, içe al veya sıfırla</h2>
        </div>
      </header>

      <p className={styles.message}>
        İlerleme dosyası ders kimliklerini, her dersin XP değerini, tamamlanma zamanını ve son açık
        dersi sürümlü JSON biçiminde taşır. Öğrenci kodları ve ders cevapları dosyaya eklenmez.
      </p>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => void exportData()} disabled={actionDisabled}>
          {status === "exporting" ? "Dışa aktarılıyor…" : "İlerlemeyi dışa aktar"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={actionDisabled}
        >
          {status === "importing" ? "İçe aktarılıyor…" : "JSON dosyasından içe aktar"}
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
        aria-label="İçe aktarılacak Python Farming ilerleme dosyası"
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
          <strong>Son dışa aktarma</strong>
          <p>
            {lastExport.completedLessonCount} ders · {lastExport.totalXp} XP · {formatBytes(lastExport.sizeBytes)}
            <br />
            {formatExportDate(lastExport.exportedAt)} · <code>{lastExport.filePath}</code>
          </p>
        </div>
      ) : null}

      {showResetConfirmation ? (
        <div className={styles.dangerBox} role="group" aria-label="İlerleme sıfırlama onayı">
          <strong>Bu işlem bütün ders ilerlemesini ve XP’yi sıfırlar.</strong>
          <p>
            İşlemden önce mevcut kayıt otomatik yedeklenir. Devam etmek için aşağıdaki alana tam
            olarak <code>{progressTransferPolicy.resetConfirmation}</code> yaz.
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
          ? `İçe aktarma dosyaları en fazla ${formatBytes(progressTransferPolicy.maxPayloadBytes)} olabilir. İçe aktarma ve sıfırlama transaction içinde çalışır ve önce güvenlik yedeği oluşturur.`
          : "Bu işlemler yalnız Tauri masaüstü uygulamasında kullanılabilir. Tarayıcı ön izlemesi yerel dosyalara yazmaz."}
      </p>
    </article>
  );
}
