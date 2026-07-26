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
import styles from "../NavigationPage.module.css";

type TaskFilter = "available" | "completed" | "all";

const modeLabels: Record<string, string> = {
  code: "Kod görevi",
  "output-prediction": "Çıktı tahmini",
  "code-completion": "Kod tamamlama",
  debugging: "Hata avcısı",
  "code-ordering": "Kod sıralama",
  refactoring: "Refactoring",
  "data-transformation": "Veri dönüşümü",
  "file-processing": "Dosya işleme",
  "test-lab": "Test laboratuvarı",
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
  const availableCount = taskRows.filter(
    (row) => row.state === "available" || row.state === "current",
  ).length;
  const completedCount = taskRows.filter((row) => row.state === "completed").length;
  const lockedCount = taskRows.filter((row) => row.state === "locked").length;
  const filteredRows = taskRows.filter((row) => {
    if (filter === "completed") {
      return row.state === "completed";
    }
    if (filter === "available") {
      return row.state === "available" || row.state === "current";
    }
    return true;
  });

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
          : "Görevler yükleniyor…";
    return (
      <AppShell activeRoute={routes.tasks} context="Görevler">
        <div className={styles.loading}>{message}</div>
      </AppShell>
    );
  }

  return (
    <AppShell activeRoute={routes.tasks} context="Görevler">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Görev merkezi</span>
            <h1>Yapılabilir bütün görevler tek yerde</h1>
            <p>
              Açık görevleri çalış, tamamlanan çözümleri yeniden incele veya bütün müfredatı
              durumlarıyla birlikte görüntüle.
            </p>
          </div>
          <button
            className={styles.actionButton}
            data-primary
            onClick={() => filteredRows[0] && openLesson(filteredRows[0].lesson.id)}
            type="button"
            disabled={filteredRows.length === 0 || filteredRows[0]?.state === "locked"}
          >
            İlk görevi aç →
          </button>
        </section>

        <section className={styles.stats} aria-label="Görev özeti">
          <article className={styles.statCard}><span>Toplam görev</span><strong>{taskRows.length}</strong></article>
          <article className={styles.statCard}><span>Açık görev</span><strong>{availableCount}</strong></article>
          <article className={styles.statCard}><span>Tamamlanan</span><strong>{completedCount}</strong></article>
          <article className={styles.statCard}><span>Kilitli</span><strong>{lockedCount}</strong></article>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Görev listesi</span>
              <h2>{filteredRows.length} görev gösteriliyor</h2>
            </div>
            <div className={styles.filters} aria-label="Görev filtresi" role="group">
              {(["available", "completed", "all"] as TaskFilter[]).map((value) => (
                <button
                  aria-pressed={filter === value}
                  className={styles.filterButton}
                  data-active={filter === value ? "" : undefined}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {value === "available" ? "Açık" : value === "completed" ? "Tamamlanan" : "Tümü"}
                </button>
              ))}
            </div>
          </header>

          {filteredRows.length === 0 ? (
            <div className={styles.empty}>Bu filtrede gösterilecek görev bulunmuyor.</div>
          ) : (
            <div className={styles.list}>
              {filteredRows.map(({ lesson, module, state }) => (
                <article className={styles.itemCard} key={lesson.id}>
                  <div className={styles.itemTop}>
                    <span className={styles.itemMeta}>
                      {module ? `${module.number} · ${module.title}` : lesson.moduleId}
                    </span>
                    <span className={styles.status} data-state={state}>
                      {state === "completed"
                        ? "Tamamlandı"
                        : state === "locked"
                          ? "Kilitli"
                          : state === "current"
                            ? "Kaldığın yer"
                            : "Açık"}
                    </span>
                  </div>
                  <div>
                    <h3>{lesson.order}. {lesson.task.title}</h3>
                    <p>{lesson.summary}</p>
                  </div>
                  <div className={styles.itemFooter}>
                    <span className={styles.meta}>{modeLabels[lesson.mode ?? "code"] ?? "Kod görevi"}</span>
                    <button
                      className={styles.actionButton}
                      onClick={() => openLesson(lesson.id)}
                      type="button"
                      disabled={state === "locked"}
                    >
                      {state === "completed" ? "Yeniden aç" : "Görevi aç"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
