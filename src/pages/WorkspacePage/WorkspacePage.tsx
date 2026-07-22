import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import { CodeEditor } from "../../editor/CodeEditor";
import { ProjectTree } from "../../editor/ProjectTree";
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
import { DataTransformationGuide } from "../../features/dataTransformation/components/DataTransformationGuide";
import { DebugGuide } from "../../features/debugging/components/DebugGuide";
import { FileSystemGuide } from "../../features/fileSystem/components/FileSystemGuide";
import { CodeOrderingPanel } from "../../features/learning/components/CodeOrderingPanel";
import { PracticeAnswerPanel } from "../../features/learning/components/PracticeAnswerPanel";
import { StdinPanel } from "../../features/learning/components/StdinPanel";
import { TaskCompletionModal } from "../../features/learning/components/TaskCompletionModal";
import { TaskResultsPanel } from "../../features/learning/components/TaskResultsPanel";
import { splitStdinText } from "../../features/learning/services/taskValidationService";
import { useLearningStore } from "../../features/learning/store/learningStore";
import { useTaskValidationStore } from "../../features/learning/store/taskValidationStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { RefactoringGuide } from "../../features/refactoring/components/RefactoringGuide";
import { TestingGuide } from "../../features/testing/components/TestingGuide";
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
  "code-ordering": "Kod sıralama",
  refactoring: "Refactoring",
  "data-transformation": "Veri dönüşümü",
  "file-processing": "Dosya laboratuvarı",
  "test-lab": "Test laboratuvarı",
} as const;

const languageLabels = {
  python: "Python",
  json: "JSON",
  text: "Metin",
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
  const isCodeOrdering = lessonMode === "code-ordering";
  const isRefactoring = lessonMode === "refactoring";
  const isDataTransformation = lessonMode === "data-transformation";
  const isFileProcessing = lessonMode === "file-processing";
  const isTestingLab = lessonMode === "test-lab";
  const usesLocalAnswer = isOutputPrediction || isCodeOrdering;

  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const loadProgress = useProgressStore((state) => state.loadProgress);
  const completeLesson = useProgressStore((state) => state.completeLesson);
  const rememberLesson = useProgressStore((state) => state.rememberLesson);

  const nextLesson = getNextLesson(catalog, currentLessonId, completedLessonIds);
  const previousLesson = getPreviousLesson(catalog, currentLessonId);
  const currentModule =
    getOrderedModules(catalog).find((module) => module.id === currentLesson?.moduleId) ?? null;
  const currentLevel =
    catalog?.levels.find((level) =>
      level.modules.some((module) => module.id === currentModule?.id),
    ) ?? null;
  const moduleCompleted = currentModule
    ? isModuleCompleted(currentModule, completedLessonIds)
    : false;

  const activeDocumentId = useEditorStore((state) => state.activeDocumentId);
  const entrypoint = useEditorStore((state) => state.entrypoint);
  const documents = useEditorStore((state) => state.documents);
  const activeDocument = useEditorStore((state) =>
    state.documents.find((document) => document.id === state.activeDocumentId),
  );
  const setActiveDocument = useEditorStore((state) => state.setActiveDocument);
  const loadLessonWorkspace = useEditorStore((state) => state.loadLessonWorkspace);
  const updateDocumentContent = useEditorStore((state) => state.updateDocumentContent);
  const markDocumentSaving = useEditorStore((state) => state.markDocumentSaving);
  const markDocumentSaved = useEditorStore((state) => state.markDocumentSaved);
  const resetWorkspace = useEditorStore((state) => state.resetWorkspace);

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
  const executeProject = useRuntimeStore((state) => state.executeProject);
  const clearOutput = useRuntimeStore((state) => state.clearOutput);

  const validationStatus = useTaskValidationStore((state) => state.status);
  const validationResult = useTaskValidationStore((state) => state.result);
  const validationError = useTaskValidationStore((state) => state.errorMessage);
  const stdinText = useTaskValidationStore((state) => state.stdinText);
  const selectedOptionId = useTaskValidationStore((state) => state.selectedOptionId);
  const orderedBlockIds = useTaskValidationStore((state) => state.orderedBlockIds);
  const isCompletionOpen = useTaskValidationStore((state) => state.isCompletionOpen);
  const startValidationSession = useTaskValidationStore((state) => state.startSession);
  const setStdinText = useTaskValidationStore((state) => state.setStdinText);
  const setSelectedOptionId = useTaskValidationStore((state) => state.setSelectedOptionId);
  const moveOrderedBlock = useTaskValidationStore((state) => state.moveOrderedBlock);
  const validateTask = useTaskValidationStore((state) => state.validateTask);
  const clearValidationResult = useTaskValidationStore((state) => state.clearResult);
  const resetValidationSession = useTaskValidationStore((state) => state.resetSession);
  const closeCompletion = useTaskValidationStore((state) => state.closeCompletion);

  const [visibleHintIndex, setVisibleHintIndex] = useState<number | null>(null);
  const [terminalView, setTerminalView] = useState<TerminalView>("output");
  const [completionXpReward, setCompletionXpReward] = useState(0);

  const runtimeFiles = useMemo(
    () => documents.map((document) => ({ path: document.path, content: document.content })),
    [documents],
  );
  const workspaceRevision = useMemo(
    () => documents.map((document) => `${document.id}:${document.revision}`).join("|"),
    [documents],
  );
  const isMultiFileWorkspace = documents.length > 1;
  const initialOrderedBlockIds = useMemo(
    () => currentLesson?.ordering?.blocks.map((block) => block.id) ?? [],
    [currentLesson?.ordering],
  );
  const orderedSource = useMemo(() => {
    if (!currentLesson?.ordering) {
      return null;
    }

    const blockMap = new Map(
      currentLesson.ordering.blocks.map((block) => [block.id, block.code]),
    );
    return orderedBlockIds
      .map((blockId) => blockMap.get(blockId))
      .filter((code): code is string => typeof code === "string")
      .join("\n");
  }, [currentLesson?.ordering, orderedBlockIds]);

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
  const orderingIntro =
    ">>> Kod sıralama görevi hazır.\n>>> Blokları çalışan program sırasına getir; sağdaki ön izleme otomatik güncellenir.";
  const refactoringIntro =
    ">>> Refactoring laboratuvarı hazır.\n>>> Önce mevcut davranışı çalıştır; sonra tekrarı fonksiyona taşı ve aynı çıktıyı koru.";
  const dataTransformationIntro =
    ">>> Veri Dönüştürme Laboratuvarı hazır.\n>>> Kaynak listeyi değiştirmeden kurallara göre yeni hedef listeyi üret.";
  const fileProcessingIntro =
    `>>> Dosya Sistemi Laboratuvarı hazır.\n>>> Giriş dosyası: ${entrypoint}\n>>> Bütün okuma ve yazma işlemleri geçici proje klasörüyle sınırlandırılır.`;
  const testingIntro =
    ">>> Test Laboratuvarı hazır.\n>>> Test paketi doğru uygulamada çalıştırılır ve gizli hatalı uygulamalara karşı yeniden sınanır.";
  const projectIntro =
    `>>> Çok dosyalı proje hazır.\n>>> Giriş dosyası: ${entrypoint}\n>>> Sol proje ağacından modül ve paket dosyaları arasında geçiş yap.`;
  const displayedTerminalText =
    isOutputPrediction && !runtimeOutput && !runtimeError
      ? ">>> Kodu çalıştırmadan önce çıktıyı tahmin et.\n>>> Seçimini yaptıktan sonra ‘Tahmini Kontrol Et’ düğmesini kullan."
      : isCodeOrdering && !runtimeOutput && !runtimeError
        ? orderingIntro
        : isTestingLab && !runtimeOutput && !runtimeError
          ? testingIntro
          : isFileProcessing && !runtimeOutput && !runtimeError
            ? fileProcessingIntro
          : isMultiFileWorkspace && !runtimeOutput && !runtimeError
            ? projectIntro
            : isDataTransformation && !runtimeOutput && !runtimeError
              ? dataTransformationIntro
              : isRefactoring && !runtimeOutput && !runtimeError
                ? refactoringIntro
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

    loadLessonWorkspace(currentLesson.id, currentLesson.editor);
    startLesson(
      currentLesson.id,
      currentLesson.task.instructions.length,
      currentLesson.hints.length,
    );
    startValidationSession(currentLesson.task.defaultStdin, initialOrderedBlockIds);
    clearOutput();
    setVisibleHintIndex(null);
    setTerminalView("output");
    setCompletionXpReward(0);
    void rememberLesson(currentLesson.id);
  }, [
    clearOutput,
    currentLesson,
    initialOrderedBlockIds,
    loadLessonWorkspace,
    rememberLesson,
    startLesson,
    startValidationSession,
  ]);

  useEffect(() => {
    if (
      !isCodeOrdering ||
      !currentLesson ||
      !activeDocument ||
      activeDocument.path !== entrypoint ||
      orderedSource === null ||
      activeDocument.content === orderedSource
    ) {
      return;
    }

    updateDocumentContent(activeDocument.id, orderedSource);
  }, [
    activeDocument,
    currentLesson,
    entrypoint,
    isCodeOrdering,
    orderedSource,
    updateDocumentContent,
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
  }, [clearValidationResult, workspaceRevision]);

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
    if (usesLocalAnswer) {
      return;
    }

    setTerminalView("output");
    void executeProject(runtimeFiles, entrypoint, splitStdinText(stdinText));
  };

  const handleValidate = async () => {
    const alreadyCompleted = completedLessonIds.includes(currentLesson.id);
    setCompletionXpReward(alreadyCompleted ? 0 : currentLesson.validation.xpReward);

    const result = await validateTask(runtimeFiles, entrypoint, currentLesson.validation);

    if (result) {
      setTerminalView("tests");
      if (result.passed) {
        await completeLesson(currentLesson.id, currentLesson.validation.xpReward);
      }
    }
  };

  const handleReset = () => {
    resetWorkspace();
    clearOutput();
    resetValidationSession(currentLesson.task.defaultStdin, initialOrderedBlockIds);
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
    (!usesLocalAnswer && runtimeBusyOrUnavailable) ||
    (isOutputPrediction && !selectedOptionId);
  const validationLabel =
    validationStatus === "checking"
      ? "Kontrol ediliyor…"
      : isOutputPrediction
        ? "Tahmini Kontrol Et"
        : isCodeOrdering
          ? "Sıralamayı Kontrol Et"
          : isTestingLab
            ? "Testleri Çalıştır"
            : isFileProcessing
              ? "Dosyaları Kontrol Et"
            : isMultiFileWorkspace
              ? "Projeyi Kontrol Et"
              : isDataTransformation
                ? "Dönüşümü Kontrol Et"
                : isRefactoring
                  ? "Refactor'ı Kontrol Et"
                  : isDebugging
                    ? "Düzeltmeyi Kontrol Et"
                    : isCodeCompletion
                      ? "Eksikleri Kontrol Et"
                      : "Görevi Kontrol Et";
  const resetLabel = isOutputPrediction
    ? "Tahmini temizle"
    : isCodeOrdering
      ? "İlk sıralamaya dön"
      : isTestingLab
        ? "Test dosyalarını sıfırla"
        : isFileProcessing
          ? "Dosya projesini sıfırla"
        : isMultiFileWorkspace
          ? "Proje dosyalarını sıfırla"
          : isDataTransformation
            ? "Başlangıç verisine dön"
            : isRefactoring
              ? "Eski koda dön"
              : isDebugging
                ? "Hatalı koda dön"
                : "Başlangıç koduna dön";
  const runLabel = runtimeStatus === "running"
    ? "Çalıştırılıyor…"
    : isTestingLab
      ? "Testleri Çalıştır"
      : isFileProcessing
        ? "Dosya işlemini çalıştır"
      : isMultiFileWorkspace
        ? "Projeyi Çalıştır"
        : isDataTransformation
          ? "Dönüşümü Çalıştır"
          : isRefactoring
            ? "Refactor'ı Çalıştır"
            : isDebugging
              ? "Kodu / Hatayı Çalıştır"
              : "Çalıştır";
  const editorReadOnly = isOutputPrediction || isCodeOrdering || activeDocument.readOnly;
  const context = `${currentLevel?.title ?? "Müfredat"} / ${currentModule?.number ?? ""}.${currentLesson.order} ${currentLesson.title}`;

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
                {isOutputPrediction
                  ? "Çıktı biçimi"
                  : isDebugging
                    ? "Düzeltme sonrası çıktı"
                    : isCodeOrdering
                      ? "Doğru program çıktısı"
                      : isTestingLab
                        ? "Beklenen test sonucu"
                        : isFileProcessing
                          ? "Dosya / terminal çıktısı"
                        : isDataTransformation
                          ? "Hedef veri çıktısı"
                          : isRefactoring
                            ? "Refactor sonrası çıktı"
                            : "Örnek çıktı"}
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

          {isCodeOrdering && currentLesson.ordering ? (
            <CodeOrderingPanel
              prompt={currentLesson.ordering.prompt}
              blocks={currentLesson.ordering.blocks}
              orderedBlockIds={orderedBlockIds}
              onMove={moveOrderedBlock}
              disabled={validationStatus === "checking"}
            />
          ) : null}

          {isDebugging && currentLesson.debugging ? (
            <DebugGuide
              guide={currentLesson.debugging}
              runtimeHasError={runtimeHasPythonError}
            />
          ) : null}

          {isRefactoring && currentLesson.refactoring ? (
            <RefactoringGuide guide={currentLesson.refactoring} />
          ) : null}

          {isDataTransformation && currentLesson.dataTransformation ? (
            <DataTransformationGuide guide={currentLesson.dataTransformation} />
          ) : null}

          {currentLesson.fileSystem ? (
            <FileSystemGuide guide={currentLesson.fileSystem} />
          ) : null}

          {isTestingLab && currentLesson.testing ? (
            <TestingGuide guide={currentLesson.testing} />
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
              <span className={styles.activeTab} title={activeDocument.path}>
                {activeDocument.path}
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

          <div className={styles.editorBody} data-multi-file={isMultiFileWorkspace || undefined}>
            {isMultiFileWorkspace ? (
              <ProjectTree
                documents={documents}
                activeDocumentId={activeDocumentId}
                entrypoint={entrypoint}
                onSelect={setActiveDocument}
              />
            ) : null}
            <CodeEditor
              documentId={activeDocumentId}
              className={styles.editorHost}
              ariaLabel={`${editorReadOnly ? "Salt okunur" : "Düzenlenebilir"} ${languageLabels[activeDocument.language]} dosyası`}
              readOnly={editorReadOnly}
            />
          </div>

          <footer className={styles.editorStatus}>
            <span>Satır {activeDocument.cursor.line}, Sütun {activeDocument.cursor.column}</span>
            <span>
              {entrypoint === activeDocument.path ? "Giriş dosyası · " : ""}
              {languageLabels[activeDocument.language]} · UTF-8 · {editorReadOnly ? "Salt okunur" : saveStatusLabels[activeDocument.saveStatus]}
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
              variant={usesLocalAnswer || isTestingLab ? "primary" : undefined}
              onClick={() => void handleValidate()}
              disabled={validationDisabled}
            >
              {validationLabel}
            </Button>
            {!usesLocalAnswer && !isTestingLab ? (
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
