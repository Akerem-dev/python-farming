import { useEffect, useMemo, useState } from "react";
import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import {
  getLessonAccessState,
  getOrderedLessons,
  getOrderedModules,
} from "../../features/curriculum/curriculumProgress";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { AppShell } from "../../layouts/AppShell";
import styles from "./TasksPageRefined.module.css";

type TaskFilter = "available" | "completed" | "all";

const modeLabels: Record<string, string> = {
  code: "Kod alıştırması",
  "output-prediction": "Çıktı tahmini",
  "code-completion": "Kod tamamlama",
  debugging: "Hata ayıklama",
  "code-ordering": "Kod sıralama",
  refactoring: "Kodu iyileştirme",
  "data-transformation": "Veri dönüştürme",
  "file-processing": "Dosya çalışması",
  "test-lab": "Test çalışması",
};

export function TasksPage() {
  const [filter, setFilter] = useState<TaskFilter>("available");
  const catalog = useCurriculumStore((state) => state.catalog);
  const curriculumStatus = useCurriculumStore((state) => state.status);
  const curriculumError = useCurriculumStore((state) => state.errorMessage);
  const currentLessonId = useCurriculumStore((state) => state.currentLessonId);
  const loadCatalog = useCurriculumStore((state) => state.loadCatalog);
  const selectLesson = useCurriculumStore((state) => state.selectLesson);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const progressStatus = useProgressStore((state) => state.status);
  const progressError = useProgressStore((state) => state.errorMessage);
  const loadProgress = useProgressStore((state) => state.loadProgress);

  useEffect(() => {
    void Promise.all([loadCatalog(), loadProgress()]);
  }, [loadCatalog, loadProgress]);

  const lessons = useMemo(() => getOrderedLessons(catalog), [catalog]);
  const moduleMap = useMemo(
    () => new Map(getOrderedModules(catalog).map((module) => [module.id, module])),
    [catalog],
  );

  const taskRows = lessons.map((lesson) => ({
    lesson,
    module: moduleMap.get(lesson.moduleId) ?? null,
    state: getLessonAccessState(catalog, lesson.id, completedLessonIds, currentLessonId),
  }));
  const availableRows = taskRows.filter(
    (row) => row.state === "available" || row.state === "current",
  );
  const completedRows = taskRows.filter((row) => row.state === "completed");
  const nextTask =
    availableRows.find((row) => row.state === "current") ?? availableRows[0] ?? null;
  const filteredRows =
    filter === "available" ? availableRows : filter === "completed" ? completedRows : taskRows;

  const openLesson = (lessonId: string) => {
    selectLesson(lessonId);
    navigate(routes.workspace);
  };

  if (!catalog || progressStatus !== "ready") {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "Alıştırmalar hazırlanıyor…";
    return (
      <AppShell activeRoute={routes.tasks} context="Görevler">
        <div className={styles.loading}>{message}</div>
      </AppShell>
    );
  }

  return (
    <AppShell activeRoute={routes.tasks} context="Görevler">
      <div className={styles.page}>
        <header className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>Alıştırmalar</span>
            <h1>Yapılabilir bütün görevler tek yerde</h1>
            <p>Açık görevine devam et, tamamladıklarını tekrar çöz veya bütün alıştırmaları incele.</p>
          </div>
          <dl className={styles.quickStats} aria-label="Görev özeti">
            <div><dt>Açık</dt><dd>{availableRows.length}</dd></div>
            <div><dt>Tamamlanan</dt><dd>{completedRows.length}</dd></div>
            <div><dt>Toplam</dt><dd>{taskRows.length}</dd></div>
          </dl>
        </header>

        {nextTask ? (
          <section className={styles.nextCard} aria-labelledby="next-task-title">
            <div className={styles.nextMarker} aria-hidden="true">→</div>
            <div className={styles.nextCopy}>
              <span className={styles.eyebrow}>Sıradaki öneri</span>
              <h2 id="next-task-title">{nextTask.lesson.task.title}</h2>
              <p>{nextTask.lesson.summary}</p>
              <div className={styles.taskMeta}>
                <span>{nextTask.module ? `${nextTask.module.number} · ${nextTask.module.title}` : nextTask.lesson.moduleId}</span>
                <span>{modeLabels[nextTask.lesson.mode ?? "code"] ?? "Kod alıştırması"}</span>
                <span>+{nextTask.lesson.validation.xpReward} XP</span>
              </div>
            </div>
            <button className={styles.primaryAction} onClick={() => openLesson(nextTask.lesson.id)} type="button">
              {nextTask.state === "current" ? "Devam et →" : "Görevi aç →"}
            </button>
          </section>
        ) : (
          <section className={styles.completeState}>
            <strong>Açık görevlerin tamamlandı.</strong>
            <span>Tamamlanan görevlerden birini tekrar çözebilir veya yeni modüle geçebilirsin.</span>
          </section>
        )}

        <section className={styles.taskSection} aria-labelledby="task-list-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Görev listesi</span>
              <h2 id="task-list-title">
                {filter === "available"
                  ? "Açık alıştırmalar"
                  : filter === "completed"
                    ? "Tamamlanan alıştırmalar"
                    : "Bütün alıştırmalar"}
              </h2>
            </div>
            <div className={styles.filters} aria-label="Görev filtresi" role="group">
              <button aria-pressed={filter === "available"} data-active={filter === "available" || undefined} onClick={() => setFilter("available")} type="button">
                Açık <span>{availableRows.length}</span>
              </button>
              <button aria-pressed={filter === "completed"} data-active={filter === "completed" || undefined} onClick={() => setFilter("completed")} type="button">
                Tamamlanan <span>{completedRows.length}</span>
              </button>
              <button aria-pressed={filter === "all"} data-active={filter === "all" || undefined} onClick={() => setFilter("all")} type="button">
                Tümü <span>{taskRows.length}</span>
              </button>
            </div>
          </header>

          {filteredRows.length ? (
            <div className={styles.taskList}>
              {filteredRows.map(({ lesson, module, state }) => (
                <article className={styles.taskRow} data-state={state} key={lesson.id}>
                  <div className={styles.rowIndex}>{String(lesson.order).padStart(2, "0")}</div>
                  <div className={styles.rowCopy}>
                    <div className={styles.rowTop}>
                      <span>{module ? `${module.number} · ${module.title}` : lesson.moduleId}</span>
                      <strong>
                        {state === "completed"
                          ? "Tamamlandı"
                          : state === "locked"
                            ? "Kilitli"
                            : state === "current"
                              ? "Kaldığın yer"
                              : "Açık"}
                      </strong>
                    </div>
                    <h3>{lesson.task.title}</h3>
                    <p>{lesson.summary}</p>
                    <div className={styles.taskMeta}>
                      <span>{modeLabels[lesson.mode ?? "code"] ?? "Kod alıştırması"}</span>
                      <span>+{lesson.validation.xpReward} XP</span>
                    </div>
                  </div>
                  <button
                    className={styles.rowAction}
                    onClick={() => openLesson(lesson.id)}
                    type="button"
                    disabled={state === "locked"}
                  >
                    {state === "completed" ? "Tekrar çöz" : state === "current" ? "Devam et" : "Aç"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Bu bölümde gösterilecek alıştırma bulunmuyor.</div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
