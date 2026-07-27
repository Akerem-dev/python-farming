import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

function compactBuildSha(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 12) : null;
}

function resolveBuildSha() {
  const environmentSha = compactBuildSha(
    process.env.PYTHON_FARMING_BUILD_SHA ?? process.env.GITHUB_SHA,
  );
  if (environmentSha) {
    return environmentSha;
  }

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function resolveBuildChannel() {
  const explicitChannel = process.env.PYTHON_FARMING_BUILD_CHANNEL?.trim();
  if (explicitChannel) {
    return explicitChannel;
  }

  return process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true"
    ? "ci"
    : "local";
}

const buildSha = resolveBuildSha();
const buildChannel = resolveBuildChannel();

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __PYTHON_FARMING_BUILD_SHA__: JSON.stringify(buildSha),
    __PYTHON_FARMING_BUILD_CHANNEL__: JSON.stringify(buildChannel),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/python-runtime/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
