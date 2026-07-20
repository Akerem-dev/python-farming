import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import { CodeEditor } from "../../editor/CodeEditor";
import { useEditorStore } from "../../editor/editorStore";
import {
  getNextLesson,
  getOrderedModules,
  getPreviousLesson,
  isModuleCompleted,
} from "../../features/curriculum/curriculumProgress";
import {
  getCurrentLesson,
  useCurriculumStore,
} from "../../features/curriculum/store/curriculumStore";
import { DebugGuide } from "../../features/debugging/components/DebugGuide";
import { PracticeAnswerPanel } from "../../features/learning/components/PracticeAnswerPanel";
import { StdinPanel } from "../../features/learning/components/StdinPanel";
import { TaskCompletionModal } from "../../features/learning/components/TaskCompletionModal";
import { TaskResultsPanel } from "../../features/learning/components/TaskResultsPanel";
import { splitStdinText } from "../../features/learning/services/taskValidationService";
import { useLearningStore } from "../../features/learning/store/learningStore";
import { useTaskValidationStore } from "../../features/learning/store/taskValidationStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
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

const lessonModeLabels = {
  code: "Kod görevi",
  "output-prediction": "Çıktıyı tahmin et",
  "code-completion": "Kod tamamlama",
  debugging: "Hata Avcısı",
} as const;

type TerminalView = "output" | "tests";

export function WorkspacePage() {
  const catalog = useCurriculumStore((state) => state.catalog);
  const curriculumStatus = useCurriculumStore((state) => state.status);
  const curriculumError = useCurriculumStore((state) => state.errorMessage);
  const currentLessonId = useCurriculumStore((state) => state.currentLessonId);
  const loadCatalog = useCurriculumStore((state) => state.loadCatalog);
  const selectLesson = useCurriculumStore((state) => state.selectLesson);
  const selectResumeLesson = useCurriculumStore((state) => state.selectResumeLesson);
  const currentLesson = getCurrentLesson(catalog, currentLessonId);
  const lessonMode = currentLesson?.mode ?? "code";
  const isOutputPrediction = lessonMode === "output-prediction";
  const isCodeCompletion = lessonMode === "code-completion";
  const isDebugging = lessonMode === "debugging";

  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const loadProgress = useProgressStore((state) => state.loadProgress);
  const completeLesson = useProgressStore((state) => state.completeLesson);
  const rememberLesson = useProgressStore((state) => state.rememberLesson);

  const nextLesson = getNextLesson(catalog, currentLessonId, completedLessonIds);
  const previousLesson = getPreviousLesson(catalog, currentLessonId);
  const currentModule =
    getOrderedModules(catalog).find((module) => module.id === currentLesson?.moduleId) ?? null;
  const moduleCompleted = currentModule
    ? isModuleCompleted(currentModule, completedLessonIds)
    : false;

  const activeDocumentId = useEditorStore((state) => state.activeDocumentId);
  const activeDocument = useEditorStore((state) =>
    state.documents.find((document) => document.id === state.activeDocumentId),
  );
  const loadLessonDocument = useEditorStore((state) => state.loadLessonDocument);
  const markDocumentSaving = useEditorStore((state) => state.markDocumentSaving);
  const markDocumentSaved = useEditorStore((state) => state.markDocumentSaved);
  const resetDocument = useEditorStore((state) => state.resetDocument);

  const usedHintCount = useLearningStore((state) => state.usedHintCount);
  const maxHintCount = useLearningStore((state) => state.maxHintCount);
  const currentStep = useLearningStore((state) => state.currentStep);
  const totalSteps = useLearningStore((state) => state.totalSteps);
  const startLesson = useLearningStore((state) => state.startLesson);
  const revealNextHint = useLearningStore((state) => state.revealNextHint);

  const runtimeStatus = useRuntimeStore((state) => state.status);
  const runtimeHealth = useRuntimeStore((state) => state.health);
  const runtimeOutput = useRuntimeStore((state) => state.output);
  const runtimeError = useRuntimeStore((state) => state.errorMessage);
  const checkRuntime = useRuntimeStore((state) => state.checkRuntime);
  const executeCode = useRuntimeStore((state) => state.executeCode);
  const clearOutput = useRuntimeStore((state) => state.clearOutput);

  const validationStatus = useTaskValidationStore((state) => state.status);
  const validationResult = useTaskValidationStore((state) => state.result);
  const validationError = useTaskValidationStore((state) => state.errorMessage);
  const stdinText = useTaskValidationStore((state) => state.stdinText);
  const selectedOptionId = useTaskValidationStore((state) => state.selectedOptionId);
  const isCompletionOpen = useTaskValidationStore((state) => state.isCompletionOpen);
  const startValidationSession = useTaskValidationStore((state) => state.startSession);
  const setStdinText = useTaskValidationStore((state) => state.setStdinText);
  const setSelectedOptionId = useTaskValidationStore((state) => state.setSelectedOptionId);
  const validateTask = useTaskValidationStore((state) => state.validateTask);
  const clearValidationResult = useTaskValidationStore((state) => state.clearResult);
  const resetValidationSession = useTaskValidationStore((state) => state.resetSession);
  const closeCompletion = useTaskValidationStore((state) => state.closeCompletion);

  const [visibleHintIndex, setVisibleHintIndex] = useState<number | null>(null);
  const [terminalView, setTerminalView] = useState<TerminalView>("output");
  const [completionXpReward, setCompletionXpReward] = useState(0);

  const visibleHint =
    visibleHintIndex === null ? null : currentLesson?.hints[visibleHintIndex] ?? null;
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
  const debuggingIntro =
    ">>> Hata Avcısı hazır.\n>>> Önce bozuk kodu çalıştır, traceback’in son satırını oku ve ardından hatayı düzelt.";
  const displayedTerminalText =
    isOutputPrediction && !runtimeOutput && !runtimeError
      ? ">>> Kodu çalıştırmadan önce çıktıyı tahmin et.\n>>> Seçimini yaptıktan sonra ‘Tahmini Kontrol Et’ düğmesini kullan."
      : isDebugging && !runtimeOutput && !runtimeError
        ? debuggingIntro
        : terminalText;
  const terminalHasError =
    runtimeStatus === "offline" ||
    runtimeStatus === "error" ||
    runtimeOutput?.status === "error" ||
    runtimeOutput?.status === "timeout";
  const runtimeHasPythonError =
    runtimeOutput?.status === "error" || Boolean(runtimeOutput?.result.stderr.trim());

  useEffect(() => {
    let active = true;
    void Promise.all([loadCatalog(), loadProgress()]).then(([, progress]) => {
      if (active) {
        selectResumeLesson(progress?.lastLessonId);
      }
    });
    void checkRuntime();
    return () => {
      active = false;
    };
  }, [checkRuntime, loadCatalog, loadProgress, selectResumeLesson]);

  useEffect(() => {
    if (!currentLesson) {
      return;
    }

    loadLessonDocument(
      currentLesson.id,
      currentLesson.editor.filename,
      currentLesson.editor.starterCode,
    );
    startLesson(
      currentLesson.id,
      currentLesson.task.instructions.length,
      currentLesson.hints.length,
    );
    startValidationSession(currentLesson.task.defaultStdin);
    clearOutput();
    setVisibleHintIndex(null);
    setTerminalView("output");
    setCompletionXpReward(0);
    void rememberLesson(currentLesson.id);
  }, [
    clearOutput,
    currentLesson,
    loadLessonDocument,
    rememberLesson,
    startLesson,
    startValidationSession,
  ]);

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
  }, [activeDocument, markDocumentSaved, markDocumentSaving]);

  useEffect(() => {
    clearValidationResult();
  }, [activeDocument?.content, clearValidationResult]);

  if (!currentLesson || !activeDocument) {
    const message = curriculumStatus === "error" ? curriculumError : "Ders içeriği yükleniyor…";
    return (
      <AppShell activeRoute={routes.workspace} compactCurriculum context="Müfredat yükleniyor">
        <div className={styles.workspaceState}>{message}</div>
      </AppShell>
    );
  }

  const handleHint = () => {
    if (usedHintCount >= maxHintCount) {
      return;
    }
    setVisibleHintIndex(usedHintCount);
    revealNextHint();
  };

  const handleRun = () => {
    if (isOutputPrediction) {
      return;
    }

    setTerminalView("output");
    void executeCode(
      activeDocument.content,
      activeDocument.name,
      splitStdinText(stdinText),
    );
  };

  const handleValidate = async () => {
    const alreadyCompleted = completedLessonIds.includes(currentLesson.id);
    setCompletionXpReward(alreadyCompleted ? 0 : currentLesson.validation.xpReward);

    const result = await validateTask(
      activeDocument.content,
      activeDocument.name,
      currentLesson.validation,
    );

    if (result) {
      setTerminalView("tests");
      if (result.passed) {
        await completeLesson(currentLesson.id, currentLesson.validation.xpReward);
      }
    }
  };

  const handleReset = () => {
    resetDocument(activeDocument.id);
    clearOutput();
    resetValidationSession(currentLesson.task.defaultStdin);
    setTerminalView("output");
  };

  const handleClearTerminal = () => {
    clearOutput();
    clearValidationResult();
  };

  const handleReviewResults = () => {
    closeCompletion();
    setTerminalView("tests");
  };

  const handleContinue = () => {
    closeCompletion();
    const latestCompletedIds = useProgressStore.getState().completedLessonIds;
    const latestNextLesson = getNextLesson(catalog, currentLesson.id, latestCompletedIds);
    if (latestNextLesson) {
      selectLesson(latestNextLesson.id);
      return;
    }
    navigate(routes.home);
  };

  const runtimeBusyOrUnavailable =
    runtimeStatus === "checking" ||
    runtimeStatus === "offline" ||
    runtimeStatus === "running";
  const validationDisabled =
    validationStatus === "checking" ||
    (!isOutputPrediction && runtimeBusyOrUnavailable) ||
    (isOutputPrediction && !selectedOptionId);
  const validationLabel =
    validationStatus === "checking"
      ? "Kontrol ediliyor…"
      : isOutputPrediction
        ? "Tahmini Kontrol Et"
        : isDebugging
          ? "Düzeltmeyi Kontrol Et"
          : isCodeCompletion
            ? "Eksikleri Kontrol Et"
            : "Görevi Kontrol Et";
  const resetLabel = isOutputPrediction
    ? "Tahmini temizle"
    : isDebugging
      ? "Hatalı koda dön"
      : "Başlangıç koduna dön";
  const runLabel = runtimeStatus === "running"
    ? "Çalıştırılıyor…"
    : isDebugging
      ? "Kodu / Hatayı Çalıştır"
      : "Çalıştır";
  const context = `Başlangıç / ${currentModule?.number ?? ""}.${currentLesson.order} ${currentLesson.title}`;

  return (
    <AppShell activeRoute={routes.workspace} compactCurriculum context={context}>
      <div className={styles.workspace}>
        <section className={styles.briefPanel}>
          <div className={styles.stepRow}>
            <span>{currentLesson.levelLabel}</span>
            <strong>Adım {currentStep} / {totalSteps}</strong>
          </div>
          <h1>{currentLesson.title}</h1>
          <p className={styles.intro}>{currentLesson.summary}</p>

          <div className={styles.taskBlock}>
            <span className={styles.eyebrow}>Görevin</span>
            <h2>{currentLesson.task.title}</h2>
            <ol>
              {currentLesson.task.instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>
          </div>

          <div className={styles.requirements}>
            <div>
              <span className={styles.eyebrow}>Gereksinimler</span>
              <ul>
                {currentLesson.task.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className={styles.eyebrow}>
                {isOutputPrediction ? "Çıktı biçimi" : isDebugging ? "Düzeltme sonrası çıktı" : "Örnek çıktı"}
              </span>
              <pre>{currentLesson.task.sampleOutput}</pre>
            </div>
          </div>

          {isOutputPrediction && currentLesson.choice ? (
            <PracticeAnswerPanel
              className={styles.answerPanel}
              prompt={currentLesson.choice.prompt}
              options={currentLesson.choice.options}
              selectedOptionId={selectedOptionId}
              onSelect={setSelectedOptionId}
              disabled={validationStatus === "checking"}
            />
          ) : null}

          {isDebugging && currentLesson.debugging ? (
            <DebugGuide
              guide={currentLesson.debugging}
              runtimeHasError={runtimeHasPythonError}
            />
          ) : null}

          <StdinPanel
            className={styles.stdinPanel}
            value={stdinText}
            onChange={setStdinText}
            enabled={currentLesson.task.stdinEnabled}
            placeholder={currentLesson.task.stdinPlaceholder}
            disabled={runtimeStatus === "running" || validationStatus === "checking"}
          />

          {visibleHint ? (
            <aside className={styles.hintPanel} aria-live="polite">
              <span className={styles.eyebrow}>İpucu {visibleHintIndex! + 1}</span>
              <strong>{visibleHint.title}</strong>
              <p>{visibleHint.body}</p>
            </aside>
          ) : null}

          <div className={styles.lessonNavigation}>
            <Button
              onClick={() => previousLesson && selectLesson(previousLesson.id)}
              disabled={!previousLesson}
            >
              Önceki ders
            </Button>
            <Button
              onClick={() => nextLesson && selectLesson(nextLesson.id)}
              disabled={!nextLesson}
              title={!nextLesson && !moduleCompleted ? "Önce mevcut dersi tamamla." : undefined}
            >
              Sonraki ders
            </Button>
          </div>

          <div className={styles.briefActions}>
            <Button onClick={handleHint} disabled={usedHintCount >= maxHintCount}>İpucu al</Button>
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
              <span className={styles.modeBadge} data-mode={lessonMode}>{lessonModeLabels[lessonMode]}</span>
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
            ariaLabel={isOutputPrediction ? "Salt okunur Python kodu" : "Python kod editörü"}
            readOnly={isOutputPrediction}
          />

          <footer className={styles.editorStatus}>
            <span>Satır {activeDocument.cursor.line}, Sütun {activeDocument.cursor.column}</span>
            <span>
              UTF-8 · {isOutputPrediction ? "Salt okunur" : saveStatusLabels[activeDocument.saveStatus]}
            </span>
          </footer>
        </section>

        <section className={styles.terminalPanel}>
          <header>
            <div>
              <button
                type="button"
                className={terminalView === "output" ? styles.terminalTabActive : styles.terminalTab}
                onClick={() => setTerminalView("output")}
              >
                Çıktı / Terminal
              </button>
              <button
                type="button"
                className={terminalView === "tests" ? styles.terminalTabActive : styles.terminalTab}
                onClick={() => setTerminalView("tests")}
              >
                Testler{validationResult ? ` · %${validationResult.score}` : ""}
              </button>
            </div>
            <button
              type="button"
              onClick={handleClearTerminal}
              disabled={!runtimeOutput && !runtimeError && !validationResult && !validationError}
            >
              Temizle
            </button>
          </header>

          {terminalView === "output" ? (
            <pre className={terminalHasError ? styles.terminalError : undefined}>
              {displayedTerminalText}
            </pre>
          ) : (
            <TaskResultsPanel
              className={styles.testResults}
              summaryClassName={styles.testSummary}
              checkListClassName={styles.checkList}
              checkRowClassName={styles.checkRow}
              passedClassName={styles.checkPassed}
              failedClassName={styles.checkFailed}
              hiddenSummaryClassName={styles.hiddenSummary}
              status={validationStatus}
              result={validationResult}
              errorMessage={validationError}
            />
          )}

          <div className={styles.runActions}>
            <Button onClick={handleReset}>{resetLabel}</Button>
            <Button
              variant={isOutputPrediction ? "primary" : undefined}
              onClick={() => void handleValidate()}
              disabled={validationDisabled}
            >
              {validationLabel}
            </Button>
            {!isOutputPrediction ? (
              <Button
                variant="primary"
                onClick={handleRun}
                disabled={runtimeBusyOrUnavailable || validationStatus === "checking"}
              >
                {runLabel}
              </Button>
            ) : null}
          </div>
        </section>
      </div>

      <TaskCompletionModal
        open={isCompletionOpen}
        taskTitle={currentLesson.task.title}
        score={validationResult?.score ?? 0}
        xpReward={completionXpReward}
        onClose={closeCompletion}
        onReview={handleReviewResults}
        onContinue={handleContinue}
        continueLabel={nextLesson ? "Sonraki ders" : moduleCompleted ? "Modülü bitir" : "Devam et"}
        backdropClassName={styles.completionBackdrop}
        modalClassName={styles.completionModal}
        badgeClassName={styles.completionBadge}
        actionsClassName={styles.completionActions}
      />
    </AppShell>
  );
}
