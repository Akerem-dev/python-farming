import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import styles from "./AppRouter.module.css";
import { routes, type AppRoute } from "./routes";

const appNavigationEvent = "python-farming:navigate";

const WorkspacePage = lazy(async () => {
  const module = await import("../pages/WorkspacePage");
  return { default: module.WorkspacePage };
});

const TasksPage = lazy(async () => {
  const module = await import("../pages/TasksPage");
  return { default: module.TasksPage };
});

const ProjectsPage = lazy(async () => {
  const module = await import("../pages/ProjectsPage");
  return { default: module.ProjectsPage };
});

const ProgressPage = lazy(async () => {
  const module = await import("../pages/ProgressPage");
  return { default: module.ProgressPage };
});

const SettingsPage = lazy(async () => {
  const module = await import("../pages/SettingsPage");
  return { default: module.SettingsPage };
});

function getCurrentRoute(): string {
  const value = window.location.hash.replace(/^#/, "");
  return value || routes.home;
}

function getRouteLabel(route: string) {
  if (route === routes.home) {
    return "Ana Sayfa";
  }

  if (route === routes.workspace) {
    return "Kod Alanı";
  }

  if (route === routes.tasks) {
    return "Görevler";
  }

  if (route === routes.projects) {
    return "Projeler";
  }

  if (route === routes.progress) {
    return "İlerleme";
  }

  if (route === routes.settings) {
    return "Ayarlar";
  }

  return "Sayfa bulunamadı";
}

export function navigate(route: AppRoute): void {
  const nextHash = `#${route}`;

  if (window.location.hash !== nextHash) {
    window.history.pushState(null, "", nextHash);
  }

  window.dispatchEvent(
    new CustomEvent<AppRoute>(appNavigationEvent, {
      detail: route,
    }),
  );
}

function RouteLoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        background: "var(--color-background)",
        color: "var(--color-text-muted)",
      }}
    >
      {label} yükleniyor…
    </div>
  );
}

export function AppRouter() {
  const [route, setRoute] = useState(getCurrentRoute);
  const routeLabel = getRouteLabel(route);

  useEffect(() => {
    const handleLocationChange = () => setRoute(getCurrentRoute());
    const handleApplicationNavigation = (event: Event) => {
      const navigationEvent = event as CustomEvent<AppRoute>;
      setRoute(navigationEvent.detail || getCurrentRoute());
    };

    window.addEventListener("hashchange", handleLocationChange);
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener(appNavigationEvent, handleApplicationNavigation);

    return () => {
      window.removeEventListener("hashchange", handleLocationChange);
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener(appNavigationEvent, handleApplicationNavigation);
    };
  }, []);

  useEffect(() => {
    document.title = `${routeLabel} · Python Farming`;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("main-content")?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [routeLabel]);

  let page: ReactNode;

  if (route === routes.home) {
    page = <HomePage />;
  } else if (route === routes.workspace) {
    page = (
      <Suspense fallback={<RouteLoadingState label="Çalışma alanı" />}>
        <WorkspacePage />
      </Suspense>
    );
  } else if (route === routes.tasks) {
    page = (
      <Suspense fallback={<RouteLoadingState label="Görevler" />}>
        <TasksPage />
      </Suspense>
    );
  } else if (route === routes.projects) {
    page = (
      <Suspense fallback={<RouteLoadingState label="Projeler" />}>
        <ProjectsPage />
      </Suspense>
    );
  } else if (route === routes.progress) {
    page = (
      <Suspense fallback={<RouteLoadingState label="İlerleme" />}>
        <ProgressPage />
      </Suspense>
    );
  } else if (route === routes.settings) {
    page = (
      <Suspense fallback={<RouteLoadingState label="Ayarlar" />}>
        <SettingsPage />
      </Suspense>
    );
  } else {
    page = <NotFoundPage />;
  }

  return (
    <>
      <div
        className={styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {routeLabel} açıldı.
      </div>
      {page}
    </>
  );
}
