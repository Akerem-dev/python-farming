export const routes = {
  home: "/",
  workspace: "/workspace",
  settings: "/settings",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
