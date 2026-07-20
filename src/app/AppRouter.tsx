import { lazy, Suspense, useEffect, useState } from "react";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { routes, type AppRoute } from "./routes";

const WorkspacePage = lazy(async () => {
  const module = await import("../pages/WorkspacePage");
  return { default: module.WorkspacePage };
});

function getCurrentRoute(): string {
  const value = window.location.hash.replace(/^#/, "");
  return value || routes.home;
}

export function navigate(route: AppRoute): void {
  window.location.hash = route;
}

function WorkspaceLoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        background: "var(--color-background)",
        color: "var(--color-text-muted)",
      }}
    >
      Çalışma alanı yükleniyor…
    </div>
  );
}

export function AppRouter() {
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (route === routes.home) {
    return <HomePage />;
  }

  if (route === routes.workspace) {
    return (
      <Suspense fallback={<WorkspaceLoadingState />}>
        <WorkspacePage />
      </Suspense>
    );
  }

  return <NotFoundPage />;
}
