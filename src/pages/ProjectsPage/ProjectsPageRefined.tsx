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
import styles from "./ProjectsPageRefined.module.css";

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

function projectTitle(lesson: {
  task: { title: string };
  dataTransformation?: { projectTitle?: string };
  fileSystem?: { projectTitle?: string };
  testing?: { labTitle?: string };
}) {
  return (
    lesson.dataTransformation?.projectTitle ||
    lesson.fileSystem?.projectTitle ||
    lesson.testing?.labTitle ||
    lesson.task.title
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

  if (!catalog || progressStatus !== "ready") {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "Projeler hazırlanıyor…";
    return (
      <AppShell activeRoute={routes.projects} context="Projeler">
        <div className={styles.loading}>{message}</div>
      </AppShell>
    );
  }

  const completedProjects = projects.filter((project) => project.state === "completed");
  const availableProjects = projects.filter(
    (project) => project.state === "available" || project.state === "current",
  );
  const lockedProjects = projects.filter((project) => project.state === "locked");
  const nextProject =
    availableProjects.find((project) => project.state === "current") ??
    availableProjects[0] ??
    lockedProjects[0] ??
    null;
  const visibleProjects = projects.filter((project) => project.state !== "locked");

  const openProject = (lessonId: string) => {
    selectLesson(lessonId);
    navigate(routes.workspace);
  };

  return (
    <AppShell activeRoute={routes.projects} context="Projeler">
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Proje yolun</span>
            <h1>Müfredattaki gerçek projeler</h1>
            <p>Öğrendiklerini küçük çalışmalardan çok dosyalı bitirme projelerine kadar gerçek ürünlerde birleştir.</p>
            <dl className={styles.heroStats} aria-label="Proje özeti">
              <div><dt>Açık</dt><dd>{availableProjects.length}</dd></div>
              <div><dt>Tamamlanan</dt><dd>{completedProjects.length}</dd></div>
              <div><dt>Toplam</dt><dd>{projects.length}</dd></div>
            </dl>
          </div>
        </header>

        {nextProject ? (
          <section className={styles.nextProject} data-locked={nextProject.state === "locked" || undefined}>
            <div className={styles.projectNumber}>01</div>
            <div className={styles.nextCopy}>
              <span className={styles.eyebrow}>
                {nextProject.state === "current" ? "Kaldığın proje" : "Sıradaki proje"}
              </span>
              <h2>{projectTitle(nextProject.lesson)}</h2>
              <p>{nextProject.lesson.summary}</p>
              <div className={styles.projectMeta}>
                <span>{nextProject.module ? `${nextProject.module.number} · ${nextProject.module.title}` : nextProject.lesson.moduleId}</span>
                <span>{nextProject.lesson.editor.files?.length ?? 1} dosya</span>
                <span>+{nextProject.lesson.validation.xpReward} XP</span>
              </div>
              {nextProject.state === "locked" ? (
                <div className={styles.unlockNote}>
                  <strong>Nasıl açılır?</strong>
                  <span>Önceki ders ve modülleri tamamladığında bu proje otomatik olarak açılacak.</span>
                </div>
              ) : null}
            </div>
            <button
              className={styles.primaryAction}
              onClick={() => openProject(nextProject.lesson.id)}
              type="button"
              disabled={nextProject.state === "locked"}
            >
              {nextProject.state === "current" ? "Devam et →" : nextProject.state === "locked" ? "Henüz kilitli" : "Projeyi aç →"}
            </button>
          </section>
        ) : null}

        <section className={styles.roadmap} aria-labelledby="project-roadmap-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Proje yolu</span>
              <h2 id="project-roadmap-title">Başlangıçtan portföye</h2>
            </div>
            <span>{projects.length} proje ve çalışma</span>
          </header>
          <div className={styles.roadmapSteps}>
            <div data-active><i>01</i><strong>Başlangıç</strong><span>Tek dosyalı gerçek problemler</span></div>
            <div><i>02</i><strong>Orta Seviye</strong><span>Modüller ve veri akışları</span></div>
            <div><i>03</i><strong>İleri Seviye</strong><span>Test ve veri platformları</span></div>
            <div><i>04</i><strong>Uzman Seviye</strong><span>Üretim kalitesinde bitirme projesi</span></div>
          </div>
        </section>

        <section className={styles.catalog} aria-labelledby="available-projects-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Kullanılabilir çalışmalar</span>
              <h2 id="available-projects-title">
                {visibleProjects.length ? "Açık ve tamamlanan projeler" : "İlk projen için hazırlanıyorsun"}
              </h2>
            </div>
            <span>{visibleProjects.length} proje görünür</span>
          </header>

          {visibleProjects.length ? (
            <div className={styles.projectList}>
              {visibleProjects.map(({ lesson, module, state }, index) => {
                const fileCount = lesson.editor.files?.length ?? 1;
                const checkCount = lesson.validation.checks.length;
                return (
                  <article className={styles.projectRow} data-state={state} key={lesson.id}>
                    <div className={styles.projectNumber}>{String(index + 1).padStart(2, "0")}</div>
                    <div className={styles.rowCopy}>
                      <div className={styles.rowTop}>
                        <span>{module ? `${module.number} · ${module.title}` : lesson.moduleId}</span>
                        <strong>{state === "completed" ? "Tamamlandı" : state === "current" ? "Kaldığın yer" : "Açık"}</strong>
                      </div>
                      <h3>{projectTitle(lesson)}</h3>
                      <p>{lesson.summary}</p>
                      <div className={styles.projectMeta}>
                        <span>{fileCount} dosya</span>
                        <span>{checkCount} kontrol</span>
                        <span>+{lesson.validation.xpReward} XP</span>
                      </div>
                    </div>
                    <button className={styles.rowAction} onClick={() => openProject(lesson.id)} type="button">
                      {state === "completed" ? "İncele" : state === "current" ? "Devam et" : "Aç"}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <strong>İlk projene yaklaşmaya devam ediyorsun.</strong>
              <span>Gerekli dersleri tamamladığında proje burada doğrudan açılacak.</span>
            </div>
          )}

          {lockedProjects.length ? (
            <details className={styles.lockedDisclosure}>
              <summary>
                <span>Sonradan açılacak projeler</span>
                <strong>{lockedProjects.length}</strong>
              </summary>
              <div className={styles.lockedList}>
                {lockedProjects.map(({ lesson, module }) => (
                  <div key={lesson.id}>
                    <span>{module ? `${module.number} · ${module.title}` : lesson.moduleId}</span>
                    <strong>{projectTitle(lesson)}</strong>
                    <small>Önceki konuları tamamladığında açılır</small>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
