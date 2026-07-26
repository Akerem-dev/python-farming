import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const routes = read("src/app/routes.ts");
const router = read("src/app/AppRouter.tsx");
const rail = read("src/components/navigation/PrimaryRail.tsx");
const tasksPage = read("src/pages/TasksPage/TasksPage.tsx");
const projectsPage = read("src/pages/ProjectsPage/ProjectsPage.tsx");
const progressPage = read("src/pages/ProgressPage/ProgressPage.tsx");
const settingsPage = read("src/pages/SettingsPage/SettingsPage.tsx");

describe("primary navigation pages", () => {
  it("defines a real route for every primary rail destination", () => {
    expect(routes).toContain('tasks: "/tasks"');
    expect(routes).toContain('projects: "/projects"');
    expect(routes).toContain('progress: "/progress"');
    expect(routes).toContain('settings: "/settings"');
    expect(rail).toContain("route: routes.tasks");
    expect(rail).toContain("route: routes.projects");
    expect(rail).toContain("route: routes.progress");
    expect(rail).toContain("route: routes.settings");
    expect(rail).not.toContain("disabled=");
  });

  it("loads every destination through the application router", () => {
    expect(router).toContain('import("../pages/TasksPage")');
    expect(router).toContain('import("../pages/ProjectsPage")');
    expect(router).toContain('import("../pages/ProgressPage")');
    expect(router).toContain('import("../pages/SettingsPage")');
    expect(router).toContain("route === routes.tasks");
    expect(router).toContain("route === routes.projects");
    expect(router).toContain("route === routes.progress");
    expect(router).toContain("route === routes.settings");
  });

  it("builds task and project views from the published curriculum", () => {
    expect(tasksPage).toContain("getOrderedLessons(catalog)");
    expect(tasksPage).toContain("getLessonAccessState");
    expect(tasksPage).toContain("selectLesson(lessonId)");
    expect(tasksPage).toContain("navigate(routes.workspace)");
    expect(projectsPage).toContain("getOrderedLessons(catalog)");
    expect(projectsPage).toContain("lesson.editor.files?.length");
    expect(projectsPage).toContain("lesson.validation.checks.filter");
    expect(projectsPage).toContain("navigate(routes.workspace)");
  });

  it("derives progress from SQLite-backed progress and curriculum stores", () => {
    expect(progressPage).toContain("useProgressStore");
    expect(progressPage).toContain("completedLessonIds");
    expect(progressPage).toContain("totalXp");
    expect(progressPage).toContain("getModuleProgress");
    expect(progressPage).toContain("getResumeLesson");
  });

  it("keeps the production settings and diagnostics page reachable", () => {
    expect(settingsPage).toContain("export function SettingsPage");
    expect(settingsPage).toContain("activeRoute={routes.settings}");
    expect(settingsPage).toContain('context="Ayarlar / Sistem Tanılama"');
    expect(router).toContain('<SettingsPage />');
  });
});
