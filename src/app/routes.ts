export const routes = {
  home: "/",
  workspace: "/workspace",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
