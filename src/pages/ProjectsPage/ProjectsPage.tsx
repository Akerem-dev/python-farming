import { useEffect, useMemo } from "react";
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

function isProjectLesson(title: string, fileCount: number, hasProjectMetadata: boolean) {
  const normalized = title.toLocaleLowerCase("tr-TR");
  return (
    fileCount > 1 ||
    hasProjectMetadata ||
    normalized.includes("proje") ||
    normalized.includes("laboratuvar") ||
    normalized.includes("lab")
  );
}

export function ProjectsPage() {
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

  const moduleMap = useMemo(
    () => new Map(getOrderedModules(catalog).map((module) => [module.id, module])),
    [catalog],
  );
  const projects = useMemo(
    () =>
      getOrderedLessons(catalog)
        .filter((lesson) =>
          isProjectLesson(
            lesson.title,
            lesson.editor.files?.length ?? 1,
            Boolean(
              lesson.graduation ||
              lesson.dataTransformation?.projectTitle ||
              lesson.fileSystem?.projectTitle ||
              lesson.testing?.labTitle,
            ),
          ),
        )
        .map((lesson) => ({
          lesson,
          module: moduleMap.get(lesson.moduleId) ?? null,
          state: getLessonAccessState(catalog, lesson.id, completedLessonIds, currentLessonId),
        })),
    [catalog, completedLessonIds, currentLessonId, moduleMap],
  );

  const completedCount = projects.filter((project) => project.state === "completed").length;
  const availableCount = projects.filter(
    (project) => project.state === "available" || project.state === "current",
  ).length;
  const multiFileCount = projects.filter(
    (project) => (project.lesson.editor.files?.length ?? 1) > 1,
  ).length;

  const openProject = (lessonId: string) => {
    selectLesson(lessonId);
    navigate(routes.workspace);
  };

  if (!catalog) {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "Projeler yükleniyor…";
    return (
      <AppShell activeRoute={routes.projects} context="Projeler">
        <div className={styles.loading}>{message}</div>
      </AppShell>
    );
  }

  const firstAvailable = projects.find(
    (project) => project.state === "available" || project.state === "current",
  );

  return (
    <AppShell activeRoute={routes.projects} context="Projeler">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Proje laboratuvarı</span>
            <h1>Müfredattaki gerçek projeler</h1>
            <p>
              Çok dosyalı görevler, test laboratuvarları ve mezuniyet projeleri burada tek
              portföy görünümünde toplanır.
            </p>
          </div>
          <button
            className={styles.actionButton}
            data-primary
            onClick={() => firstAvailable && openProject(firstAvailable.lesson.id)}
            type="button"
            disabled={!firstAvailable}
          >
            Sıradaki projeyi aç →
          </button>
        </section>

        <section className={styles.stats} aria-label="Proje özeti">
          <article className={styles.statCard}><span>Toplam proje</span><strong>{projects.length}</strong></article>
          <article className={styles.statCard}><span>Açık proje</span><strong>{availableCount}</strong></article>
          <article className={styles.statCard}><span>Tamamlanan</span><strong>{completedCount}</strong></article>
          <article className={styles.statCard}><span>Çok dosyalı</span><strong>{multiFileCount}</strong></article>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Proje kataloğu</span>
              <h2>Başlangıçtan üretim kalitesine</h2>
            </div>
            <span className={styles.meta}>{projects.length} doğrulanabilir çalışma</span>
          </header>

          {projects.length === 0 ? (
            <div className={styles.empty}>Müfredatta proje niteliğinde görev bulunamadı.</div>
          ) : (
            <div className={styles.list}>
              {projects.map(({ lesson, module, state }) => {
                const fileCount = lesson.editor.files?.length ?? 1;
                const hiddenCheckCount = lesson.validation.checks.filter(
                  (check) => check.visibility === "hidden",
                ).length;
                const projectTitle =
                  lesson.dataTransformation?.projectTitle ||
                  lesson.fileSystem?.projectTitle ||
                  lesson.testing?.labTitle ||
                  lesson.task.title;

                return (
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
                      <h3>{projectTitle}</h3>
                      <p>{lesson.summary}</p>
                    </div>
                    <div className={styles.itemFooter}>
                      <span className={styles.meta}>
                        {fileCount} dosya · {hiddenCheckCount} gizli kontrol
                      </span>
                      <button
                        className={styles.actionButton}
                        onClick={() => openProject(lesson.id)}
                        type="button"
                        disabled={state === "locked"}
                      >
                        {state === "completed" ? "Projeyi incele" : "Projeyi aç"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
