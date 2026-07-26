import { useEffect, useMemo } from "react";
import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import {
  getModuleProgress,
  getOrderedModules,
  getResumeLesson,
  isModuleCompleted,
} from "../../features/curriculum/curriculumProgress";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { AppShell } from "../../layouts/AppShell";
import styles from "../NavigationPage.module.css";

export function ProgressPage() {
  const catalog = useCurriculumStore((state) => state.catalog);
  const curriculumStatus = useCurriculumStore((state) => state.status);
  const curriculumError = useCurriculumStore((state) => state.errorMessage);
  const loadCatalog = useCurriculumStore((state) => state.loadCatalog);
  const selectLesson = useCurriculumStore((state) => state.selectLesson);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const totalXp = useProgressStore((state) => state.totalXp);
  const lastLessonId = useProgressStore((state) => state.lastLessonId);
  const progressStatus = useProgressStore((state) => state.status);
  const progressError = useProgressStore((state) => state.errorMessage);
  const loadProgress = useProgressStore((state) => state.loadProgress);

  useEffect(() => {
    void Promise.all([loadCatalog(), loadProgress()]);
  }, [loadCatalog, loadProgress]);

  const modules = useMemo(() => getOrderedModules(catalog), [catalog]);
  const resumeLesson = useMemo(
    () => getResumeLesson(catalog, completedLessonIds, lastLessonId),
    [catalog, completedLessonIds, lastLessonId],
  );

  if (!catalog) {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "İlerleme bilgileri yükleniyor…";
    return (
      <AppShell activeRoute={routes.progress} context="İlerleme">
        <div className={styles.loading}>{message}</div>
      </AppShell>
    );
  }

  const totalLessons = catalog.lessons.length;
  const completedLessons = completedLessonIds.filter((lessonId) =>
    catalog.lessons.some((lesson) => lesson.id === lessonId),
  ).length;
  const overallPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const contentModules = modules.filter((module) => module.lessonIds.length > 0);
  const completedModules = contentModules.filter((module) =>
    isModuleCompleted(module, completedLessonIds),
  ).length;
  const openResumeLesson = () => {
    if (!resumeLesson) {
      return;
    }
    selectLesson(resumeLesson.id);
    navigate(routes.workspace);
  };

  const levelRows = catalog.levels.map((level) => {
    const levelModules = level.modules.filter((module) => module.lessonIds.length > 0);
    const levelLessonIds = levelModules.flatMap((module) => module.lessonIds);
    const completedLevelLessons = levelLessonIds.filter((lessonId) =>
      completedLessonIds.includes(lessonId),
    ).length;
    const percent =
      levelLessonIds.length > 0
        ? Math.round((completedLevelLessons / levelLessonIds.length) * 100)
        : 0;

    return {
      ...level,
      levelModules,
      completedLevelLessons,
      totalLevelLessons: levelLessonIds.length,
      completedLevelModules: levelModules.filter((module) =>
        isModuleCompleted(module, completedLessonIds),
      ).length,
      percent,
    };
  });

  return (
    <AppShell activeRoute={routes.progress} context="İlerleme">
      <div className={styles.page}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Gerçek ilerleme kaydı</span>
            <h1>Öğrenim yolunun tamamı</h1>
            <p>
              XP, tamamlanan dersler ve modül yüzdeleri yerel SQLite ilerleme kaydından
              hesaplanır.
            </p>
          </div>
          <button
            className={styles.actionButton}
            data-primary
            onClick={openResumeLesson}
            type="button"
            disabled={!resumeLesson}
          >
            Kaldığın derse dön →
          </button>
        </section>

        <section className={styles.stats} aria-label="Genel ilerleme özeti">
          <article className={styles.statCard}><span>Toplam XP</span><strong>{totalXp}</strong></article>
          <article className={styles.statCard}><span>Tamamlanan ders</span><strong>{completedLessons}/{totalLessons}</strong></article>
          <article className={styles.statCard}><span>Tamamlanan modül</span><strong>{completedModules}/{contentModules.length}</strong></article>
          <article className={styles.statCard}><span>Genel ilerleme</span><strong>%{overallPercent}</strong></article>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Seviye görünümü</span>
              <h2>Başlangıçtan uzmanlığa</h2>
            </div>
            <span className={styles.meta}>{catalog.levels.length} seviye</span>
          </header>
          <div className={styles.levelGrid}>
            {levelRows.map((level) => (
              <article className={styles.levelCard} key={level.id}>
                <div className={styles.progressLabel}>
                  <h3>{level.title}</h3>
                  <span className={styles.meta}>%{level.percent}</span>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                  <div className={styles.progressFill} style={{ width: `${level.percent}%` }} />
                </div>
                <span className={styles.meta}>
                  {level.completedLevelLessons}/{level.totalLevelLessons} ders · {level.completedLevelModules}/{level.levelModules.length} modül
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Modül ayrıntıları</span>
              <h2>Yayınlanan bütün modüller</h2>
            </div>
            <span className={styles.meta}>{contentModules.length} aktif modül</span>
          </header>
          <div className={styles.moduleGrid}>
            {contentModules.map((module) => {
              const progress = getModuleProgress(module, completedLessonIds);
              return (
                <article className={styles.moduleRow} key={module.id}>
                  <div className={styles.progressLabel}>
                    <strong>{module.number} · {module.title}</strong>
                    <span className={styles.meta}>%{progress.percent}</span>
                  </div>
                  <div className={styles.progressTrack} aria-hidden="true">
                    <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
                  </div>
                  <span className={styles.meta}>{progress.completed}/{progress.total} ders tamamlandı</span>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
