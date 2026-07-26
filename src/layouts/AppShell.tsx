import type { PropsWithChildren } from "react";
import { navigate } from "../app/AppRouter";
import { routes, type AppRoute } from "../app/routes";
import { FirstRunGuide } from "../components/onboarding/FirstRunGuide";
import { CurriculumSidebar } from "../components/navigation/CurriculumSidebar";
import { PrimaryRail } from "../components/navigation/PrimaryRail";
import { StatusBar } from "../components/navigation/StatusBar";
import { TitleBar } from "../components/navigation/TitleBar";
import { useCurriculumStore } from "../features/curriculum/store/curriculumStore";
import { useProgressStore } from "../features/progress/store/progressStore";
import styles from "./AppShell.module.css";

interface AppShellProps {
  activeRoute: AppRoute;
  context: string;
  compactCurriculum?: boolean;
}

export function AppShell({
  activeRoute,
  children,
  compactCurriculum = false,
  context,
}: PropsWithChildren<AppShellProps>) {
  const catalog = useCurriculumStore((state) => state.catalog);
  const selectLesson = useCurriculumStore((state) => state.selectLesson);
  const completedLessonIds = useProgressStore((state) => state.completedLessonIds);
  const totalXp = useProgressStore((state) => state.totalXp);
  const firstLesson = catalog?.lessons[0] ?? null;
  const showFirstRunGuide =
    activeRoute === routes.home &&
    completedLessonIds.length === 0 &&
    totalXp === 0 &&
    firstLesson !== null;

  const startFirstLesson = () => {
    if (!firstLesson) {
      return;
    }

    selectLesson(firstLesson.id);
    navigate(routes.workspace);
  };

  return (
    <div className={styles.root}>
      <a className={styles.skipLink} href="#main-content">
        Ana içeriğe geç
      </a>
      <TitleBar context={context} />
      <div className={styles.body}>
        <PrimaryRail activeRoute={activeRoute} />
        <CurriculumSidebar compact={compactCurriculum} />
        <main
          id="main-content"
          className={styles.content}
          aria-label={context}
          tabIndex={-1}
        >
          {showFirstRunGuide ? (
            <div className={styles.onboardingSlot}>
              <FirstRunGuide lessonTitle={firstLesson.title} onStart={startFirstLesson} />
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
