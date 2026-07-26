import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const app = read("src/app/App.tsx");
const router = read("src/app/AppRouter.tsx");
const shell = read("src/layouts/AppShell.tsx");
const shellStyles = read("src/layouts/AppShell.module.css");
const errorBoundary = read("src/components/system/AppErrorBoundary.tsx");
const firstRunGuide = read("src/components/onboarding/FirstRunGuide.tsx");
const progressBar = read("src/components/common/ProgressBar.tsx");
const primaryRail = read("src/components/navigation/PrimaryRail.tsx");
const curriculumSidebar = read("src/components/navigation/CurriculumSidebar.tsx");
const statusBar = read("src/components/navigation/StatusBar.tsx");
const globalStyles = read("src/styles/globals.css");
const motionStyles = read("src/styles/motion.css");

describe("accessibility and first-run UX contract", () => {
  it("catches render failures and offers an explicit recovery action", () => {
    expect(app).toContain("<AppErrorBoundary>");
    expect(errorBoundary).toContain("getDerivedStateFromError");
    expect(errorBoundary).toContain("componentDidCatch");
    expect(errorBoundary).toContain('role="alert"');
    expect(errorBoundary).toContain('aria-live="assertive"');
    expect(errorBoundary).toContain("window.location.reload()");
    expect(errorBoundary).toContain("İlerleme verilerin yerel SQLite veritabanında duruyor");
  });

  it("lets keyboard users bypass repeated navigation", () => {
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain("Ana içeriğe geç");
    expect(shell).toContain('id="main-content"');
    expect(shell).toContain("tabIndex={-1}");
    expect(shellStyles).toContain(".skipLink:focus-visible");
    expect(shellStyles).toContain("transform: translateY(0)");
  });

  it("announces route changes and moves focus to the page landmark", () => {
    expect(router).toContain("document.title = `${routeLabel} · Python Farming`");
    expect(router).toContain('getElementById("main-content")?.focus()');
    expect(router).toContain('role="status"');
    expect(router).toContain('aria-live="polite"');
    expect(router).toContain('aria-atomic="true"');
    expect(router).toContain("requestAnimationFrame");
    expect(router).toContain("cancelAnimationFrame");
  });

  it("exposes determinate progress values semantically", () => {
    expect(progressBar).toContain('role="progressbar"');
    expect(progressBar).toContain("aria-valuemin={0}");
    expect(progressBar).toContain("aria-valuemax={100}");
    expect(progressBar).toContain("aria-valuenow={normalized}");
    expect(progressBar).toContain('aria-valuetext={`Yüzde ${normalized}`}');
    expect(progressBar).toContain('aria-hidden="true"');
  });

  it("marks current navigation and exposes every primary destination", () => {
    expect(primaryRail).toContain('aria-current={active ? "page" : undefined}');
    expect(primaryRail).toContain("route: routes.tasks");
    expect(primaryRail).toContain("route: routes.projects");
    expect(primaryRail).toContain("route: routes.progress");
    expect(primaryRail).toContain("route: routes.settings");
    expect(primaryRail).not.toContain("disabled={");
    expect(primaryRail).not.toContain("henüz kullanıma açılmadı");
    expect(curriculumSidebar).toContain('aria-label="Python müfredatı"');
    expect(curriculumSidebar).toContain('aria-current={state === "active" ? "step" : undefined}');
    expect(curriculumSidebar).toContain("stateLabels[state]");
  });

  it("shows a practical three-step guide only before any learning progress", () => {
    expect(shell).toContain("completedLessonIds.length === 0");
    expect(shell).toContain("totalXp === 0");
    expect(shell).toContain("activeRoute === routes.home");
    expect(shell).toContain("<FirstRunGuide");
    expect(shell).toContain("selectLesson(firstLesson.id)");
    expect(shell).toContain("navigate(routes.workspace)");
    expect(firstRunGuide).toContain("Üç adımda ilk Python görevini tamamla");
    expect(firstRunGuide).toContain("Görevi oku");
    expect(firstRunGuide).toContain("Kodu çalıştır");
    expect(firstRunGuide).toContain("Kontrol et");
    expect(firstRunGuide).toContain("İlk derse başla");
  });

  it("keeps focus, status and reduced-motion support globally active", () => {
    expect(globalStyles).toContain("button:focus-visible");
    expect(globalStyles).toContain("select:focus-visible");
    expect(globalStyles).toContain("summary:focus-visible");
    expect(statusBar).toContain('aria-label="Uygulama durumu"');
    expect(statusBar).toContain('role="status"');
    expect(statusBar).toContain('aria-live="polite"');
    expect(statusBar).toContain("void checkDiagnostics()");
    expect(statusBar).toContain("Python hazır");
    expect(statusBar).toContain("Python bulunamadı");
    expect(statusBar).toContain("Runtime hatası");
    expect(motionStyles).toContain("prefers-reduced-motion: reduce");
    expect(motionStyles).toContain("animation-duration: 0.01ms");
    expect(motionStyles).toContain("transition-duration: 0.01ms");
  });
});
