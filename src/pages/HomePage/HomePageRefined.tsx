import { useEffect, useMemo } from "react";
import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import { ProgressBar } from "../../components/common/ProgressBar";
import {
  getLessonAccessState,
  getModuleLessons,
  getModuleProgress,
  getOrderedModules,
  getResumeLesson,
  isLessonUnlocked,
  isModuleCompleted,
} from "../../features/curriculum/curriculumProgress";
import { useCurriculumStore } from "../../features/curriculum/store/curriculumStore";
import {
  advancedGraduationLessonId,
  getAdvancedGraduationLesson,
  getAdvancedGraduationSnapshot,
} from "../../features/mastery/advancedGraduation";
import {
  expertGraduationLessonId,
  getExpertGraduationLesson,
  getExpertGraduationSnapshot,
} from "../../features/mastery/expertGraduation";
import {
  beginnerGraduationLessonId,
  getBeginnerGraduationLesson,
  getBeginnerGraduationSnapshot,
} from "../../features/mastery/beginnerGraduation";
import {
  getIntermediateGraduationLesson,
  getIntermediateGraduationSnapshot,
  intermediateGraduationLessonId,
} from "../../features/mastery/intermediateGraduation";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { AppShell } from "../../layouts/AppShell";
import styles from "./HomePageRefined.module.css";

const roadmapLevels = [
  { id: "beginner", name: "Başlangıç", totalModules: 8 },
  { id: "intermediate", name: "Orta Seviye", totalModules: 10 },
  { id: "advanced", name: "İleri Seviye", totalModules: 8 },
  { id: "expert", name: "Uzman Seviye", totalModules: 6 },
] as const;

const learningActivities = [
  "Çıktıyı tahmin et",
  "Eksik kodu tamamla",
  "Hataları bul ve düzelt",
  "Gerçek projeler geliştir",
  "Kodunu adım adım incele",
];

export function HomePage() {
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
  const resumeModule = modules.find((module) => module.id === resumeLesson?.moduleId) ?? null;
  const resumeLevel =
    catalog?.levels.find((level) =>
      level.modules.some((module) => module.id === resumeModule?.id),
    ) ?? null;
  const moduleLessons = resumeModule ? getModuleLessons(catalog, resumeModule.id) : [];
  const moduleProgress = resumeModule
    ? getModuleProgress(resumeModule, completedLessonIds)
    : { completed: 0, total: 0, percent: 0 };
  const moduleCompleted = resumeModule
    ? isModuleCompleted(resumeModule, completedLessonIds)
    : false;

  const beginnerGraduation = useMemo(
    () => getBeginnerGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const intermediateGraduation = useMemo(
    () => getIntermediateGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const advancedGraduation = useMemo(
    () => getAdvancedGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const expertGraduation = useMemo(
    () => getExpertGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );

  if (!catalog || !resumeLesson || !resumeModule) {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "Öğrenim yolun hazırlanıyor…";

    return (
      <AppShell activeRoute={routes.home} context="Ana Sayfa">
        <div className={styles.loadingState}>{message}</div>
      </AppShell>
    );
  }

  const publishedLessonCount = catalog.lessons.length;
  const completedPublishedLessons = completedLessonIds.filter((lessonId) =>
    catalog.lessons.some((lesson) => lesson.id === lessonId),
  ).length;
  const publishedProgress = publishedLessonCount
    ? Math.round((completedPublishedLessons / publishedLessonCount) * 100)
    : 0;
  const completedPublishedModuleCount = modules.filter(
    (module) => module.lessonIds.length > 0 && isModuleCompleted(module, completedLessonIds),
  ).length;

  const beginnerModules = catalog.levels.find((level) => level.id === "beginner")?.modules ?? [];
  const intermediateModules =
    catalog.levels.find((level) => level.id === "intermediate")?.modules ?? [];
  const advancedModules = catalog.levels.find((level) => level.id === "advanced")?.modules ?? [];
  const expertModules = catalog.levels.find((level) => level.id === "expert")?.modules ?? [];

  const completedModulesFor = (levelModules: typeof beginnerModules) =>
    levelModules.filter((module) => isModuleCompleted(module, completedLessonIds)).length;

  const completedByLevel = {
    beginner: completedModulesFor(beginnerModules),
    intermediate: completedModulesFor(intermediateModules),
    advanced: completedModulesFor(advancedModules),
    expert: completedModulesFor(expertModules),
  };

  const levelRows = roadmapLevels.map((level) => {
    const completedModules = completedByLevel[level.id];
    const locked =
      level.id === "beginner"
        ? false
        : level.id === "intermediate"
          ? !beginnerGraduation.intermediateUnlocked
          : level.id === "advanced"
            ? !intermediateGraduation.advancedUnlocked
            : !advancedGraduation.expertUnlocked;

    return {
      ...level,
      completedModules,
      progress: Math.round((completedModules / level.totalModules) * 100),
      locked,
    };
  });

  const showingExpertGraduation = advancedGraduation.graduated;
  const showingAdvancedGraduation =
    intermediateGraduation.graduated && !showingExpertGraduation;
  const showingIntermediateGraduation =
    beginnerGraduation.graduated && !showingAdvancedGraduation && !showingExpertGraduation;

  const graduationView = showingExpertGraduation
    ? {
        snapshot: expertGraduation,
        lesson: getExpertGraduationLesson(catalog),
        lessonId: expertGraduationLessonId,
        levelName: "Uzman Seviye",
        nextLevel: "Tüm öğrenim yolu",
      }
    : showingAdvancedGraduation
      ? {
          snapshot: advancedGraduation,
          lesson: getAdvancedGraduationLesson(catalog),
          lessonId: advancedGraduationLessonId,
          levelName: "İleri Seviye",
          nextLevel: "Uzman Seviye",
        }
      : showingIntermediateGraduation
        ? {
            snapshot: intermediateGraduation,
            lesson: getIntermediateGraduationLesson(catalog),
            lessonId: intermediateGraduationLessonId,
            levelName: "Orta Seviye",
            nextLevel: "İleri Seviye",
          }
        : {
            snapshot: beginnerGraduation,
            lesson: getBeginnerGraduationLesson(catalog),
            lessonId: beginnerGraduationLessonId,
            levelName: "Başlangıç",
            nextLevel: "Orta Seviye",
          };

  const completedReviewLessons = [...catalog.lessons]
    .filter((lesson) => completedLessonIds.includes(lesson.id))
    .sort((left, right) => right.order - left.order)
    .slice(0, 3);

  const currentLevelLabel =
    resumeModule.id === "beginner-graduation"
      ? "Sınav"
      : resumeModule.id.endsWith("-project")
        ? "Bitirme projesi"
        : resumeLevel?.id === "intermediate"
          ? "Orta Seviye"
          : resumeLevel?.id === "advanced"
            ? "İleri Seviye"
            : resumeLevel?.id === "expert"
              ? "Uzman Seviye"
              : "Başlangıç";

  const openLesson = (lessonId: string) => {
    if (!isLessonUnlocked(catalog, lessonId, completedLessonIds)) {
      return;
    }
    selectLesson(lessonId);
    navigate(routes.workspace);
  };

  const handleContinue = () => {
    const targetLesson = moduleCompleted ? moduleLessons[0] ?? resumeLesson : resumeLesson;
    if (targetLesson) {
      openLesson(targetLesson.id);
    }
  };

  return (
    <AppShell activeRoute={routes.home} context="Ana Sayfa">
      <div className={styles.page}>
        <main className={styles.mainColumn}>
          <section className={styles.continueCard} aria-labelledby="continue-title">
            <div className={styles.continueCopy}>
              <span className={styles.eyebrow}>
                {moduleCompleted ? "Modülü yeniden çalış" : completedPublishedLessons ? "Kaldığın yer" : "İlk adım"}
              </span>
              <h1 id="continue-title">
                {resumeModule.number}.{resumeLesson.order} {resumeLesson.title}
              </h1>
              <p>{resumeLesson.summary}</p>
              <div className={styles.resumeProgress}>
                <div>
                  <span>{resumeModule.title}</span>
                  <strong>{moduleProgress.completed} / {moduleProgress.total} ders</strong>
                </div>
                <ProgressBar value={moduleProgress.percent} label={`%${moduleProgress.percent}`} />
              </div>
              <Button variant="primary" onClick={handleContinue}>
                {moduleCompleted ? "Modülü tekrar aç →" : "Derse devam et →"}
              </Button>
            </div>
          </section>

          <section className={styles.sectionCard} aria-labelledby="roadmap-title">
            <header className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Öğrenim yolun</span>
                <h2 id="roadmap-title">Başlangıçtan uzmanlığa dört adım</h2>
              </div>
              <span>{completedPublishedModuleCount} modül tamamlandı</span>
            </header>
            <div className={styles.roadmapGrid}>
              {levelRows.map((level, index) => (
                <article className={styles.roadmapItem} data-locked={level.locked || undefined} key={level.id}>
                  <div className={styles.roadmapNumber}>{String(index + 1).padStart(2, "0")}</div>
                  <strong>{level.name}</strong>
                  <span>
                    {level.completedModules} / {level.totalModules} modül
                    {level.locked ? " · Önceki seviyeyi tamamla" : ""}
                  </span>
                  <ProgressBar value={level.progress} />
                </article>
              ))}
            </div>
          </section>

          <section
            className={styles.milestoneCard}
            data-complete={graduationView.snapshot.graduated || undefined}
            style={
              graduationView.snapshot.graduated
                ? undefined
                : {
                    borderColor: "rgba(var(--color-brand-warm-rgb), 0.18)",
                    background:
                      "linear-gradient(104deg, rgba(244, 232, 211, 0.74), transparent 64%), var(--color-surface)",
                  }
            }
          >
            <div className={styles.scoreBadge}>
              <span>Ustalık</span>
              <strong>{graduationView.snapshot.masteryScore}</strong>
              <small>/100</small>
            </div>
            <div className={styles.milestoneCopy}>
              <span className={styles.eyebrow}>Sıradaki büyük hedef</span>
              <h2>
                {graduationView.snapshot.graduated
                  ? `${graduationView.levelName} tamamlandı`
                  : graduationView.snapshot.projectUnlocked
                    ? "Bitirme projen hazır"
                    : `${graduationView.snapshot.completedCoreLessons} / ${graduationView.snapshot.totalCoreLessons} ders tamamlandı`}
              </h2>
              <p>
                {graduationView.snapshot.graduated
                  ? `${graduationView.nextLevel} açıldı. Yeni hedefin için hazır olduğunda devam edebilirsin.`
                  : graduationView.snapshot.projectUnlocked
                    ? "Öğrendiklerini gerçek bir projede birleştir ve seviyeni tamamla."
                    : "Eksik konuları tamamladıkça bitirme projen otomatik olarak açılacak."}
              </p>
              {!graduationView.snapshot.graduated && !graduationView.snapshot.projectUnlocked ? (
                <div className={styles.topicList}>
                  {graduationView.snapshot.weakTopics.map((topic) => (
                    <span key={topic.id}>
                      <b>{topic.title}</b>
                      <small>%{topic.percent}</small>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={styles.milestoneAction}>
              {graduationView.snapshot.projectUnlocked && graduationView.lesson ? (
                <Button variant="primary" onClick={() => openLesson(graduationView.lessonId)}>
                  Bitirme projesini aç →
                </Button>
              ) : (
                <div>
                  <span>Tamamlanan modül</span>
                  <strong>
                    {graduationView.snapshot.completedCoreModules} / {graduationView.snapshot.totalCoreModules}
                  </strong>
                </div>
              )}
            </div>
          </section>

          <div className={styles.detailGrid}>
            <section className={styles.sectionCard} aria-labelledby="module-title">
              <header className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Şu anki modül</span>
                  <h2 id="module-title">{resumeModule.title}</h2>
                </div>
                <span className={styles.levelBadge}>{moduleCompleted ? "Tamamlandı" : currentLevelLabel}</span>
              </header>
              <div className={styles.lessonList}>
                {moduleLessons.map((lesson) => {
                  const state = getLessonAccessState(
                    catalog,
                    lesson.id,
                    completedLessonIds,
                    resumeLesson.id,
                  );
                  const disabled = state === "locked";
                  return (
                    <button
                      type="button"
                      data-state={state}
                      key={lesson.id}
                      disabled={disabled}
                      onClick={() => openLesson(lesson.id)}
                    >
                      <span aria-hidden="true">
                        {state === "completed" ? "✓" : state === "current" ? "●" : state === "available" ? "›" : "×"}
                      </span>
                      <b>{lesson.title}</b>
                      <small>{disabled ? "Önceki dersi tamamla" : `+${lesson.validation.xpReward} XP`}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={styles.sectionCard} aria-labelledby="activities-title">
              <header className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Çalışma biçimleri</span>
                  <h2 id="activities-title">Bugün ne yapabilirsin?</h2>
                </div>
              </header>
              <div className={styles.activityList}>
                {learningActivities.map((activity, index) => (
                  <span key={activity}>
                    <i>{String(index + 1).padStart(2, "0")}</i>
                    {activity}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </main>

        <aside className={styles.sideColumn} aria-label="İlerleme özeti">
          <section className={styles.summaryCard}>
            <span className={styles.eyebrow}>Genel ilerleme</span>
            <h2>Öğrenim durumun</h2>
            <div
              className={styles.progressRing}
              style={{
                background: `conic-gradient(var(--color-accent) 0 ${publishedProgress}%, var(--color-track) ${publishedProgress}% 100%)`,
              }}
            >
              <div>
                <strong>%{publishedProgress}</strong>
                <span>tamamlandı</span>
              </div>
            </div>
            <dl className={styles.stats}>
              <div><dt>Ders</dt><dd>{completedPublishedLessons}</dd></div>
              <div><dt>Modül</dt><dd>{completedPublishedModuleCount}</dd></div>
              <div><dt>Toplam XP</dt><dd>{totalXp}</dd></div>
            </dl>
          </section>

          <section className={styles.summaryCard}>
            <span className={styles.eyebrow}>Tekrar için hazır</span>
            <h2>Son tamamlananlar</h2>
            <div className={styles.reviewList}>
              {completedReviewLessons.length ? (
                completedReviewLessons.map((lesson, index) => (
                  <button type="button" key={lesson.id} onClick={() => openLesson(lesson.id)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{lesson.title}</b>
                    <i aria-hidden="true">→</i>
                  </button>
                ))
              ) : (
                <p>İlk dersi tamamladığında tekrar listesi burada oluşacak.</p>
              )}
            </div>
          </section>

          <section className={styles.safeCard}>
            <span className={styles.eyebrow}>Otomatik kayıt</span>
            <h2>İlerlemen güvende</h2>
            <p>Derslerin, XP bilgin ve kaldığın yer bu cihazda otomatik olarak saklanıyor.</p>
            <strong>{totalXp} XP kayıtlı</strong>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
