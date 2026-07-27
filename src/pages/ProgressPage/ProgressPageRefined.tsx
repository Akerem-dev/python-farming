import { useEffect, useMemo } from "react";
import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import { ProgressBar } from "../../components/common/ProgressBar";
import {
  getModuleProgress,
  getOrderedModules,
  getResumeLesson,
  isModuleCompleted,
} from "../../features/curriculum/curriculumProgress";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { AppShell } from "../../layouts/AppShell";
import styles from "./ProgressPageRefined.module.css";

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

  if (!catalog || progressStatus !== "ready") {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "İlerlemen hazırlanıyor…";
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
  const overallPercent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const contentModules = modules.filter((module) => module.lessonIds.length > 0);
  const completedModules = contentModules.filter((module) =>
    isModuleCompleted(module, completedLessonIds),
  ).length;

  const levelRows = catalog.levels.map((level) => {
    const levelModules = level.modules.filter((module) => module.lessonIds.length > 0);
    const levelLessonIds = levelModules.flatMap((module) => module.lessonIds);
    const completedLevelLessons = levelLessonIds.filter((lessonId) =>
      completedLessonIds.includes(lessonId),
    ).length;
    const completedLevelModules = levelModules.filter((module) =>
      isModuleCompleted(module, completedLessonIds),
    ).length;
    const percent = levelLessonIds.length
      ? Math.round((completedLevelLessons / levelLessonIds.length) * 100)
      : 0;

    return {
      ...level,
      totalLevelLessons: levelLessonIds.length,
      completedLevelLessons,
      totalLevelModules: levelModules.length,
      completedLevelModules,
      percent,
    };
  });

  const openResumeLesson = () => {
    if (!resumeLesson) {
      return;
    }
    selectLesson(resumeLesson.id);
    navigate(routes.workspace);
  };

  const nextMilestone =
    levelRows.find((level) => level.percent < 100) ?? levelRows[levelRows.length - 1] ?? null;

  return (
    <AppShell activeRoute={routes.progress} context="İlerleme">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>İlerlemen</span>
            <h1>Öğrenim yolunun tamamı</h1>
            <p>Derslerini, seviyelerini ve sıradaki hedefini tek bakışta gör.</p>
            <div className={styles.overallProgress}>
              <div>
                <span>Genel tamamlanma</span>
                <strong>%{overallPercent}</strong>
              </div>
              <ProgressBar value={overallPercent} label={`%${overallPercent}`} />
            </div>
            <button className={styles.primaryAction} onClick={openResumeLesson} type="button" disabled={!resumeLesson}>
              Kaldığın derse dön →
            </button>
          </div>
          <dl className={styles.heroStats} aria-label="Genel ilerleme özeti">
            <div><dt>Toplam XP</dt><dd>{totalXp}</dd></div>
            <div><dt>Tamamlanan ders</dt><dd>{completedLessons}<small>/{totalLessons}</small></dd></div>
            <div><dt>Tamamlanan modül</dt><dd>{completedModules}<small>/{contentModules.length}</small></dd></div>
          </dl>
        </header>

        {nextMilestone ? (
          <section className={styles.milestone}>
            <div className={styles.milestoneIndex}>{String(levelRows.indexOf(nextMilestone) + 1).padStart(2, "0")}</div>
            <div>
              <span className={styles.eyebrow}>Sıradaki hedef</span>
              <h2>{nextMilestone.title}</h2>
              <p>
                {nextMilestone.completedLevelLessons} / {nextMilestone.totalLevelLessons} ders ve {nextMilestone.completedLevelModules} / {nextMilestone.totalLevelModules} modül tamamlandı.
              </p>
            </div>
            <strong>%{nextMilestone.percent}</strong>
          </section>
        ) : null}

        <section className={styles.levelSection} aria-labelledby="level-progress-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Seviye yolculuğu</span>
              <h2 id="level-progress-title">Başlangıçtan uzmanlığa</h2>
            </div>
            <span>{catalog.levels.length} seviye</span>
          </header>
          <div className={styles.levelTimeline}>
            {levelRows.map((level, index) => (
              <article className={styles.levelItem} data-complete={level.percent === 100 || undefined} key={level.id}>
                <div className={styles.levelNumber}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.levelCopy}>
                  <div>
                    <h3>{level.title}</h3>
                    <strong>%{level.percent}</strong>
                  </div>
                  <ProgressBar value={level.percent} />
                  <span>
                    {level.completedLevelLessons}/{level.totalLevelLessons} ders · {level.completedLevelModules}/{level.totalLevelModules} modül
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.moduleSection} aria-labelledby="module-progress-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Modül ayrıntıları</span>
              <h2 id="module-progress-title">Bütün modüller</h2>
            </div>
            <span>{contentModules.length} modül</span>
          </header>
          <div className={styles.moduleList}>
            {contentModules.map((module) => {
              const progress = getModuleProgress(module, completedLessonIds);
              const state =
                progress.percent === 100
                  ? "completed"
                  : resumeLesson?.moduleId === module.id
                    ? "current"
                    : progress.completed > 0
                      ? "started"
                      : "idle";
              return (
                <article className={styles.moduleRow} data-state={state} key={module.id}>
                  <div className={styles.moduleNumber}>{module.number}</div>
                  <div className={styles.moduleCopy}>
                    <div>
                      <strong>{module.title}</strong>
                      <span>%{progress.percent}</span>
                    </div>
                    <ProgressBar value={progress.percent} />
                    <small>
                      {progress.completed}/{progress.total} ders
                      {state === "current" ? " · Şu anda buradasın" : state === "completed" ? " · Tamamlandı" : ""}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
