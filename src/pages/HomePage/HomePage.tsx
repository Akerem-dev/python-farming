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
  beginnerGraduationLessonId,
  getBeginnerGraduationLesson,
  getBeginnerGraduationSnapshot,
} from "../../features/mastery/beginnerGraduation";
import { useProgressStore } from "../../features/progress/store/progressStore";
import { AppShell } from "../../layouts/AppShell";
import styles from "./HomePage.module.css";

const roadmapLevels = [
  { id: "beginner", name: "Başlangıç", totalModules: 8 },
  { id: "intermediate", name: "Orta Seviye", totalModules: 10 },
  { id: "advanced", name: "İleri Seviye", totalModules: 8 },
  { id: "expert", name: "Uzman Seviye", totalModules: 6 },
] as const;

const upcomingSystems = [
  "Çıktıyı tahmin et",
  "Kod tamamlama",
  "Hata ayıklama",
  "Mini projeler",
  "Expert Project Lab",
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
  const graduation = useMemo(
    () => getBeginnerGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const graduationLesson = getBeginnerGraduationLesson(catalog);
  const resumeLesson = useMemo(
    () => getResumeLesson(catalog, completedLessonIds, lastLessonId),
    [catalog, completedLessonIds, lastLessonId],
  );
  const resumeModule = modules.find((module) => module.id === resumeLesson?.moduleId) ?? null;
  const moduleLessons = resumeModule ? getModuleLessons(catalog, resumeModule.id) : [];
  const moduleProgress = resumeModule
    ? getModuleProgress(resumeModule, completedLessonIds)
    : { completed: 0, total: 0, percent: 0 };
  const moduleCompleted = resumeModule
    ? isModuleCompleted(resumeModule, completedLessonIds)
    : false;

  const publishedLessonCount = catalog?.lessons.length ?? 0;
  const completedPublishedLessons = completedLessonIds.filter((lessonId) =>
    catalog?.lessons.some((lesson) => lesson.id === lessonId),
  ).length;
  const publishedProgress =
    publishedLessonCount > 0
      ? Math.round((completedPublishedLessons / publishedLessonCount) * 100)
      : 0;
  const completedModuleCount = graduation.completedCoreModules;
  const beginnerRoadmapProgress = Math.round((completedModuleCount / 8) * 100);
  const resumeModuleIndex = resumeModule
    ? modules.findIndex((module) => module.id === resumeModule.id)
    : -1;
  const nextRoadmapModule =
    resumeModuleIndex >= 0 ? modules[resumeModuleIndex + 1] ?? null : modules[0] ?? null;

  const levelRows = roadmapLevels.map((level) => ({
    ...level,
    completedModules: level.id === "beginner" ? completedModuleCount : 0,
    progress: level.id === "beginner" ? beginnerRoadmapProgress : 0,
    locked:
      level.id === "beginner"
        ? false
        : level.id === "intermediate"
          ? !graduation.intermediateUnlocked
          : true,
    unlocked: level.id === "intermediate" && graduation.intermediateUnlocked,
  }));

  const completedReviewLessons = [...(catalog?.lessons ?? [])]
    .filter((lesson) => completedLessonIds.includes(lesson.id))
    .sort((left, right) => right.order - left.order)
    .slice(0, 3);

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

  if (!catalog || !resumeLesson || !resumeModule) {
    const message =
      curriculumStatus === "error"
        ? curriculumError
        : progressStatus === "error"
          ? progressError
          : "İlerleme ve müfredat yükleniyor…";

    return (
      <AppShell activeRoute={routes.home} context="Ana Sayfa / Müfredat">
        <div className={styles.loadingState}>{message}</div>
      </AppShell>
    );
  }

  return (
    <AppShell activeRoute={routes.home} context="Ana Sayfa / Müfredat">
      <div className={styles.page}>
        <section className={styles.mainColumn}>
          <article className={`${styles.panel} ${styles.continuePanel}`}>
            <div>
              <span className={styles.eyebrow}>
                {moduleCompleted ? "Modül tamamlandı" : completedPublishedLessons > 0 ? "Kaldığın yer" : "Başla"}
              </span>
              <h1>
                {resumeModule.number}.{resumeLesson.order} {resumeLesson.title}
              </h1>
              <p>{resumeLesson.summary}</p>
              <div className={styles.continueProgress}>
                <div className={styles.progressCaption}>
                  <span>{resumeModule.title}</span>
                  <strong>{moduleProgress.completed} / {moduleProgress.total} ders</strong>
                </div>
                <ProgressBar value={moduleProgress.percent} label={`%${moduleProgress.percent}`} />
              </div>
            </div>
            <Button variant="primary" onClick={handleContinue}>
              {moduleCompleted ? "Modülü tekrar aç →" : "Derse devam et →"}
            </Button>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Öğrenim yolu</span>
                <h2>Başlangıçtan uzmanlığa tek rota</h2>
              </div>
              <span className={styles.meta}>32 ana modül</span>
            </header>

            <div className={styles.levelGrid}>
              {levelRows.map((level, index) => (
                <div
                  className={`${styles.levelCard} ${level.locked ? styles.levelLocked : ""} ${level.unlocked ? styles.levelUnlocked : ""}`.trim()}
                  key={level.name}
                >
                  <div className={styles.levelIndex}>{String(index + 1).padStart(2, "0")}</div>
                  <strong>{level.name}</strong>
                  <span>
                    {level.completedModules} / {level.totalModules} modül
                    {level.locked ? " · Kilitli" : level.unlocked ? " · Yol açıldı" : ""}
                  </span>
                  <ProgressBar value={level.progress} />
                </div>
              ))}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.graduationPanel}`} data-graduated={graduation.graduated || undefined}>
            <div className={styles.graduationScore}>
              <span>Ustalık puanı</span>
              <strong>{graduation.masteryScore}</strong>
              <small>/ 100</small>
            </div>
            <div className={styles.graduationBody}>
              <span className={styles.eyebrow}>
                {graduation.graduated
                  ? "Başlangıç seviyesi mezuniyeti"
                  : graduation.examUnlocked
                    ? "Final sınavı hazır"
                    : "Mezuniyete giden yol"}
              </span>
              <h2>
                {graduation.graduated
                  ? graduation.badgeName
                  : graduation.examUnlocked
                    ? "Sekiz modülü tek projede kanıtla"
                    : `${graduation.completedCoreLessons} / ${graduation.totalCoreLessons} temel ders tamamlandı`}
              </h2>
              <p>
                {graduation.graduated
                  ? "Mezuniyet rozeti kazanıldı ve Orta Seviye öğrenim yolu açıldı."
                  : graduation.examUnlocked
                    ? "Kapsamlı Mağaza Analizörü projesini tamamlayarak rozetini kazan ve Orta Seviye kilidini kaldır."
                    : "En düşük tamamlanma oranına sahip modüller aşağıda gösteriliyor. Bu konular tamamlandıkça sınav otomatik açılır."}
              </p>
              {!graduation.graduated && !graduation.examUnlocked ? (
                <div className={styles.weakTopics}>
                  {graduation.weakTopics.map((topic) => (
                    <div key={topic.id}>
                      <span>{topic.number}</span>
                      <b>{topic.title}</b>
                      <small>%{topic.percent}</small>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={styles.graduationAction}>
              {graduation.graduated ? (
                <div className={styles.graduationBadge}>
                  <i>◆</i>
                  <span>Orta Seviye</span>
                  <strong>Açıldı</strong>
                </div>
              ) : graduation.examUnlocked && graduationLesson ? (
                <Button variant="primary" onClick={() => openLesson(beginnerGraduationLessonId)}>
                  Mezuniyet sınavına gir →
                </Button>
              ) : (
                <div>
                  <span>Hazırlık</span>
                  <strong>{graduation.completedCoreModules} / {graduation.totalCoreModules} modül</strong>
                </div>
              )}
            </div>
          </article>

          <div className={styles.twoColumns}>
            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Güncel modül</span>
                  <h2>{resumeModule.title}</h2>
                </div>
                <span className={moduleCompleted ? styles.completeBadge : styles.levelBadge}>
                  {moduleCompleted ? "Tamamlandı" : resumeModule.id === "beginner-graduation" ? "Sınav" : "Başlangıç"}
                </span>
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
                  const symbol =
                    state === "completed" ? "✓" : state === "current" ? "●" : state === "available" ? "›" : "×";

                  return (
                    <button
                      type="button"
                      className={styles[state]}
                      key={lesson.id}
                      disabled={disabled}
                      onClick={() => openLesson(lesson.id)}
                    >
                      <span>{symbol}</span>
                      <b>{lesson.title}</b>
                      <small>{state === "locked" ? "Önceki dersi tamamla" : `+${lesson.validation.xpReward} XP`}</small>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <span className={styles.eyebrow}>Yaklaşan sistemler</span>
                  <h2>Python Farming laboratuvarı</h2>
                </div>
              </header>
              <div className={styles.featureList}>
                {upcomingSystems.map((system) => <span key={system}>{system}</span>)}
              </div>
            </article>
          </div>

          {moduleCompleted ? (
            <article className={`${styles.panel} ${styles.moduleCompletePanel}`}>
              <span className={styles.completionMark}>✓</span>
              <div>
                <span className={styles.eyebrow}>Modül başarıyla tamamlandı</span>
                <h2>{resumeModule.title}</h2>
                <p>
                  {moduleProgress.total} dersin tamamı bitti. Bu modülden toplam {moduleLessons.reduce(
                    (sum, lesson) => sum + lesson.validation.xpReward,
                    0,
                  )} XP kazanılabilir.
                </p>
              </div>
              <div className={styles.nextModuleState}>
                <span>Sıradaki modül</span>
                <strong>{nextRoadmapModule?.title ?? (graduation.graduated ? "Orta Seviye" : "Yeni içerik")}</strong>
                <small>
                  {nextRoadmapModule?.lessonIds.length
                    ? "Ön koşullar tamamlandı."
                    : graduation.graduated
                      ? "Orta Seviye yolu mezuniyet rozetiyle açıldı."
                      : "Dersleri hazırlanıyor; yayımlandığında açılacak."}
                </small>
              </div>
            </article>
          ) : null}
        </section>

        <aside className={styles.sideColumn}>
          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Ustalık</span>
                <h2>Yayımlanan içerik</h2>
              </div>
            </header>
            <div
              className={styles.masteryRing}
              style={{
                background: `conic-gradient(var(--color-accent) 0 ${publishedProgress}%, var(--color-track) ${publishedProgress}% 100%)`,
              }}
            >
              <div><strong>{publishedProgress}%</strong><span>İçerik ustalığı</span></div>
            </div>
            <div className={styles.statRows}>
              <span><b>{completedPublishedLessons}</b> tamamlanan ders</span>
              <span><b>{completedModuleCount}</b> tamamlanan ana modül</span>
              <span><b>{totalXp}</b> toplam XP</span>
            </div>
          </article>

          <article className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Tekrar alanı</span>
                <h2>Tamamlanan dersler</h2>
              </div>
            </header>
            <div className={styles.reviewList}>
              {completedReviewLessons.length > 0 ? (
                completedReviewLessons.map((lesson, index) => (
                  <button type="button" key={lesson.id} onClick={() => openLesson(lesson.id)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {lesson.title}
                    <b>→</b>
                  </button>
                ))
              ) : (
                <p className={styles.emptyReview}>İlk dersi tamamladığında tekrar listesi burada oluşacak.</p>
              )}
            </div>
          </article>

          <article className={`${styles.panel} ${styles.stagePanel}`}>
            <span className={styles.eyebrow}>Gerçek ilerleme kaydı</span>
            <h2>{totalXp} XP güvende</h2>
            <p>
              Tamamlanan dersler, mezuniyet rozeti, son açık ders ve XP masaüstü uygulamasının yerel SQLite veritabanından türetiliyor.
            </p>
          </article>
        </aside>
      </div>
    </AppShell>
  );
}
