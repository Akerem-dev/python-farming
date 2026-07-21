import { useEffect, useMemo } from "react";
import {
  getModuleAccessState,
  getModuleProgress,
  getResumeLesson,
} from "../../features/curriculum/curriculumProgress";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { ProgressBar } from "../common/ProgressBar";
import styles from "./CurriculumSidebar.module.css";

interface CurriculumSidebarProps {
  compact?: boolean;
}

const stateSymbols = {
  completed: "✓",
  active: "●",
  available: "›",
  locked: "×",
  "coming-soon": "—",
} as const;

export function CurriculumSidebar({ compact = false }: CurriculumSidebarProps) {
  const catalog = useCurriculumStore((state) => state.catalog);
  const currentLessonId = useCurriculumStore((state) => state.currentLessonId);
  const loadCatalog = useCurriculumStore((state) => state.loadCatalog);
  const selectLesson = useCurriculumStore((state) => state.selectLesson);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const lastLessonId = useProgressStore((state) => state.lastLessonId);
  const loadProgress = useProgressStore((state) => state.loadProgress);

  useEffect(() => {
    void loadCatalog();
    void loadProgress();
  }, [loadCatalog, loadProgress]);

  const currentLesson = catalog?.lessons.find((lesson) => lesson.id === currentLessonId) ?? null;
  const modules = catalog?.levels.flatMap((level) => level.modules) ?? [];
  const coreModuleCount = modules.filter((module) => module.id !== "beginner-graduation").length;
  const hasGraduationAssessment = modules.some((module) => module.id === "beginner-graduation");
  const totalLessons = catalog?.lessons.length ?? 0;
  const completedCount = completedLessonIds.filter((lessonId) =>
    catalog?.lessons.some((lesson) => lesson.id === lessonId),
  ).length;
  const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const moduleRows = useMemo(
    () =>
      modules.map((module) => {
        const state = getModuleAccessState(
          catalog,
          module,
          completedLessonIds,
          currentLesson?.moduleId ?? null,
        );
        const moduleProgress = getModuleProgress(module, completedLessonIds);
        const resumeLesson = getResumeLesson(
          {
            version: catalog?.version ?? 1,
            levels: catalog?.levels ?? [],
            lessons: (catalog?.lessons ?? []).filter((lesson) => lesson.moduleId === module.id),
          },
          completedLessonIds,
          currentLesson?.moduleId === module.id ? currentLesson.id : lastLessonId,
        );

        return {
          module,
          moduleProgress,
          state,
          targetLessonId: resumeLesson?.id ?? module.lessonIds[0] ?? null,
        };
      }),
    [catalog, completedLessonIds, currentLesson, lastLessonId, modules],
  );

  return (
    <aside className={`${styles.root} ${compact ? styles.compact : ""}`.trim()}>
      <div className={styles.headingRow}>
        <span>Müfredat</span>
        <span className={styles.count}>
          {coreModuleCount || 8} modül{hasGraduationAssessment ? " + sınav" : ""}
        </span>
      </div>

      <div className={styles.levelLabel}>{catalog?.levels[0]?.title ?? "Başlangıç seviyesi"}</div>

      <div className={styles.list}>
        {moduleRows.map(({ module, moduleProgress, state, targetLessonId }) => {
          const disabled = state === "locked" || state === "coming-soon" || !targetLessonId;
          const statusLabel =
            state === "coming-soon"
              ? "Yakında"
              : moduleProgress.total > 0
                ? `${moduleProgress.completed}/${moduleProgress.total}`
                : "";

          return (
            <button
              type="button"
              className={`${styles.row} ${styles[state]}`}
              key={module.id}
              disabled={disabled}
              onClick={() => targetLessonId && selectLesson(targetLessonId)}
              title={state === "coming-soon" ? "Bu modülün dersleri henüz yayımlanmadı." : undefined}
            >
              <span className={styles.number}>{module.number}</span>
              <span className={styles.title}>
                {module.title}
                {statusLabel ? <small>{statusLabel}</small> : null}
              </span>
              <span className={styles.state} aria-hidden="true">
                {stateSymbols[state]}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.progressBox}>
        <div className={styles.progressHeader}>
          <span>Yayımlanan içerik</span>
          <strong>%{progress}</strong>
        </div>
        <ProgressBar value={progress} />
        <p>{completedCount} / {totalLessons} ders tamamlandı</p>
      </div>
    </aside>
  );
}
