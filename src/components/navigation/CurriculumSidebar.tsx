import { useEffect, useMemo } from "react";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { ProgressBar } from "../common/ProgressBar";
import styles from "./CurriculumSidebar.module.css";

interface CurriculumSidebarProps {
  compact?: boolean;
}

export function CurriculumSidebar({ compact = false }: CurriculumSidebarProps) {
  const catalog = useCurriculumStore((state) => state.catalog);
  const currentLessonId = useCurriculumStore((state) => state.currentLessonId);
  const loadCatalog = useCurriculumStore((state) => state.loadCatalog);
  const selectLesson = useCurriculumStore((state) => state.selectLesson);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const loadProgress = useProgressStore((state) => state.loadProgress);

  useEffect(() => {
    void loadCatalog();
    void loadProgress();
  }, [loadCatalog, loadProgress]);

  const currentLesson = catalog?.lessons.find((lesson) => lesson.id === currentLessonId) ?? null;
  const modules = catalog?.levels.flatMap((level) => level.modules) ?? [];
  const totalLessons = catalog?.lessons.length ?? 0;
  const completedCount = completedLessonIds.filter((lessonId) =>
    catalog?.lessons.some((lesson) => lesson.id === lessonId),
  ).length;
  const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const moduleRows = useMemo(
    () =>
      modules.map((module) => {
        const available = module.lessonIds.length > 0;
        const completed =
          available && module.lessonIds.every((lessonId) => completedLessonIds.includes(lessonId));
        const active = currentLesson?.moduleId === module.id;
        const state = active ? "active" : completed ? "done" : available ? "available" : "locked";
        const targetLessonId =
          module.lessonIds.find((lessonId) => !completedLessonIds.includes(lessonId)) ??
          module.lessonIds[0] ??
          null;
        return { module, state, targetLessonId };
      }),
    [completedLessonIds, currentLesson?.moduleId, modules],
  );

  return (
    <aside className={`${styles.root} ${compact ? styles.compact : ""}`.trim()}>
      <div className={styles.headingRow}>
        <span>Müfredat</span>
        <span className={styles.count}>{modules.length || 8} bölüm</span>
      </div>

      <div className={styles.levelLabel}>{catalog?.levels[0]?.title ?? "Başlangıç seviyesi"}</div>

      <div className={styles.list}>
        {moduleRows.map(({ module, state, targetLessonId }) => (
          <button
            type="button"
            className={`${styles.row} ${styles[state]}`}
            key={module.id}
            disabled={!targetLessonId}
            onClick={() => targetLessonId && selectLesson(targetLessonId)}
          >
            <span className={styles.number}>{module.number}</span>
            <span className={styles.title}>{module.title}</span>
            <span className={styles.state} aria-hidden="true">
              {state === "done" ? "✓" : state === "active" ? "●" : state === "available" ? "›" : "○"}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.progressBox}>
        <div className={styles.progressHeader}>
          <span>Genel ilerleme</span>
          <strong>%{progress}</strong>
        </div>
        <ProgressBar value={progress} />
        <p>{completedCount} / {totalLessons} mevcut ders tamamlandı</p>
      </div>
    </aside>
  );
}
