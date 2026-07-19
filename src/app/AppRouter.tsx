import { useEffect, useState } from "react";
import { HomePage } from "../pages/HomePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { WorkspacePage } from "../pages/WorkspacePage";
import { routes, type AppRoute } from "./routes";

function getCurrentRoute(): string {
  const value = window.location.hash.replace(/^#/, "");
  return value || routes.home;
}

export function navigate(route: AppRoute): void {
  window.location.hash = route;
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
    return <WorkspacePage />;
  }

  return <NotFoundPage />;
}
