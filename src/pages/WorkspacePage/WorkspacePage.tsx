import { useEffect, useMemo, useState } from "react";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import { CodeEditor } from "../../editor/CodeEditor";
import { useEditorStore } from "../../editor/editorStore";
import { getLessonHint } from "../../features/learning/services/lessonSessionService";
import { useLearningStore } from "../../features/learning/store/learningStore";
import { AppShell } from "../../layouts/AppShell";
import { formatTerminalOutput } from "../../runtime/terminalFormatter";
import { useRuntimeStore } from "../../runtime/runtimeStore";
import styles from "./WorkspacePage.module.css";

const saveStatusLabels = {
  saved: "Kaydedildi",
  dirty: "Kaydedilmedi",
  saving: "Kaydediliyor…",
} as const;

const runtimeStatusLabels = {
  checking: "Kontrol ediliyor",
  ready: "Hazır",
  offline: "Çevrimdışı",
  running: "Çalışıyor",
  error: "Hata",
} as const;

export function WorkspacePage() {
  const activeDocumentId = useEditorStore((state) => state.activeDocumentId);
  const activeDocument = useEditorStore((state) =>
    state.documents.find((document) => document.id === state.activeDocumentId),
  );
  const markDocumentSaving = useEditorStore((state) => state.markDocumentSaving);
  const markDocumentSaved = useEditorStore((state) => state.markDocumentSaved);
  const resetDocument = useEditorStore((state) => state.resetDocument);
  const usedHintCount = useLearningStore((state) => state.usedHintCount);
  const maxHintCount = useLearningStore((state) => state.maxHintCount);
  const currentStep = useLearningStore((state) => state.currentStep);
  const totalSteps = useLearningStore((state) => state.totalSteps);
  const revealNextHint = useLearningStore((state) => state.revealNextHint);
  const runtimeStatus = useRuntimeStore((state) => state.status);
  const runtimeHealth = useRuntimeStore((state) => state.health);
  const runtimeOutput = useRuntimeStore((state) => state.output);
  const runtimeError = useRuntimeStore((state) => state.errorMessage);
  const checkRuntime = useRuntimeStore((state) => state.checkRuntime);
  const executeCode = useRuntimeStore((state) => state.executeCode);
  const clearOutput = useRuntimeStore((state) => state.clearOutput);
  const [visibleHintIndex, setVisibleHintIndex] = useState<number | null>(null);

  const visibleHint = useMemo(
    () => (visibleHintIndex === null ? null : getLessonHint(visibleHintIndex)),
    [visibleHintIndex],
  );
  const terminalText = useMemo(
    () =>
      formatTerminalOutput({
        status: runtimeStatus,
        health: runtimeHealth,
        output: runtimeOutput,
        errorMessage: runtimeError,
      }),
    [runtimeError, runtimeHealth, runtimeOutput, runtimeStatus],
  );
  const terminalHasError =
    runtimeStatus === "offline" ||
    runtimeStatus === "error" ||
    runtimeOutput?.status === "error" ||
    runtimeOutput?.status === "timeout";

  useEffect(() => {
    void checkRuntime();
  }, [checkRuntime]);

  useEffect(() => {
    if (!activeDocument || activeDocument.saveStatus !== "dirty") {
      return;
    }

    const documentId = activeDocument.id;
    const savingTimer = window.setTimeout(() => {
      markDocumentSaving(documentId);

      window.setTimeout(() => {
        markDocumentSaved(documentId);
      }, 180);
    }, 650);

    return () => window.clearTimeout(savingTimer);
  }, [activeDocument?.content, activeDocument?.id, markDocumentSaved, markDocumentSaving]);

  const handleHint = () => {
    if (usedHintCount >= maxHintCount) {
      return;
    }

    setVisibleHintIndex(usedHintCount);
    revealNextHint();
  };

  if (!activeDocument) {
    return null;
  }

  const handleRun = () => {
    void executeCode(activeDocument.content, activeDocument.name);
  };

  const handleReset = () => {
    resetDocument(activeDocument.id);
    clearOutput();
  };

  return (
    <AppShell activeRoute={routes.workspace} compactCurriculum context="Başlangıç / 2.1 Değişkenler">
      <div className={styles.workspace}>
        <section className={styles.briefPanel}>
          <div className={styles.stepRow}>
            <span>Beginner Learning</span>
            <strong>Adım {currentStep} / {totalSteps}</strong>
          </div>
          <h1>Değişkenler nedir?</h1>
          <p className={styles.intro}>
            Değişkenler, verileri isim vererek saklamanı ve daha sonra yeniden kullanmanı sağlar.
          </p>

          <div className={styles.taskBlock}>
            <span className={styles.eyebrow}>Görevin</span>
            <h2>Kendini tanıtan iki değişken oluştur</h2>
            <ol>
              <li><code>ad</code> değişkenine kendi adını ata.</li>
              <li><code>yas</code> değişkenine yaşını ata.</li>
              <li>İki değeri tek bir cümlede ekrana yazdır.</li>
            </ol>
          </div>

          <div className={styles.requirements}>
            <div>
              <span className={styles.eyebrow}>Gereksinimler</span>
              <ul>
                <li>İki değişken tanımlanmalı.</li>
                <li><code>print()</code> kullanılmalı.</li>
                <li>Beklenen biçim korunmalı.</li>
              </ul>
            </div>
            <div>
              <span className={styles.eyebrow}>Örnek çıktı</span>
              <pre>Merhaba, ben Ali ve 20 yaşındayım.</pre>
            </div>
          </div>

          {visibleHint ? (
            <aside className={styles.hintPanel} aria-live="polite">
              <span className={styles.eyebrow}>İpucu {visibleHintIndex! + 1}</span>
              <strong>{visibleHint.title}</strong>
              <p>{visibleHint.body}</p>
            </aside>
          ) : null}

          <div className={styles.briefActions}>
            <Button onClick={handleHint} disabled={usedHintCount >= maxHintCount}>
              İpucu al
            </Button>
            <span>İpucu kullanımı: {usedHintCount} / {maxHintCount}</span>
          </div>
        </section>

        <section className={styles.editorPanel}>
          <header className={styles.editorHeader}>
            <div>
              <span className={styles.activeTab}>
                {activeDocument.name}
                {activeDocument.saveStatus === "dirty" ? <i aria-label="Kaydedilmemiş değişiklik" /> : null}
              </span>
              <button type="button" aria-label="Yeni dosya ekle" disabled>＋</button>
            </div>
            <span className={styles.runtimeStatus} data-status={runtimeStatus}>
              <i />
              {runtimeHealth?.version ?? runtimeStatusLabels[runtimeStatus]}
            </span>
          </header>

          <CodeEditor
            documentId={activeDocumentId}
            className={styles.editorHost}
            ariaLabel="Python kod editörü"
          />

          <footer className={styles.editorStatus}>
            <span>Satır {activeDocument.cursor.line}, Sütun {activeDocument.cursor.column}</span>
            <span>UTF-8 · {saveStatusLabels[activeDocument.saveStatus]}</span>
          </footer>
        </section>

        <section className={styles.terminalPanel}>
          <header>
            <div><strong>Çıktı / Terminal</strong><span>Problemler</span></div>
            <button type="button" onClick={clearOutput} disabled={!runtimeOutput && !runtimeError}>
              Temizle
            </button>
          </header>
          <pre className={terminalHasError ? styles.terminalError : undefined}>{terminalText}</pre>
          <div className={styles.runActions}>
            <Button onClick={handleReset}>Başlangıç koduna dön</Button>
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={
                runtimeStatus === "checking" ||
                runtimeStatus === "offline" ||
                runtimeStatus === "running"
              }
            >
              {runtimeStatus === "running" ? "Çalıştırılıyor…" : "Çalıştır"}
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
