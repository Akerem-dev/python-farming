export const routes = {
  home: "/",
  workspace: "/workspace",
  tasks: "/tasks",
  projects: "/projects",
  progress: "/progress",
  settings: "/settings",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
