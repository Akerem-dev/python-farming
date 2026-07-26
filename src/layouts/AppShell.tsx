import type { PropsWithChildren } from "react";
import type { AppRoute } from "../app/routes";
import { CurriculumSidebar } from "../components/navigation/CurriculumSidebar";
import { PrimaryRail } from "../components/navigation/PrimaryRail";
import { StatusBar } from "../components/navigation/StatusBar";
import { TitleBar } from "../components/navigation/TitleBar";
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
          {children}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
