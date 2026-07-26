import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import styles from "./AppRouter.module.css";
import { routes, type AppRoute } from "./routes";

const WorkspacePage = lazy(async () => {
  const module = await import("../pages/WorkspacePage");
  return { default: module.WorkspacePage };
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

  if (route === routes.settings) {
    return "Ayarlar ve Sistem Tanılama";
  }

  return "Sayfa bulunamadı";
}

export function navigate(route: AppRoute): void {
  window.location.hash = route;
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
    const handleHashChange = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
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
  } else if (route === routes.settings) {
    page = (
      <Suspense fallback={<RouteLoadingState label="Sistem tanılama" />}>
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
