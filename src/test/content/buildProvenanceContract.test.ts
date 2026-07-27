import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("running build provenance contract", () => {
  it("injects a deterministic commit and build channel through Vite", () => {
    const viteConfig = read("vite.config.ts");
    const declarations = read("src/vite-env.d.ts");
    const appConfig = read("src/app/appConfig.ts");

    expect(viteConfig).toContain('execFileSync("git", ["rev-parse", "--short=12", "HEAD"]');
    expect(viteConfig).toContain("PYTHON_FARMING_BUILD_SHA");
    expect(viteConfig).toContain("PYTHON_FARMING_BUILD_CHANNEL");
    expect(viteConfig).toContain("__PYTHON_FARMING_BUILD_SHA__");
    expect(viteConfig).toContain("__PYTHON_FARMING_BUILD_CHANNEL__");
    expect(declarations).toContain("declare const __PYTHON_FARMING_BUILD_SHA__: string");
    expect(declarations).toContain("declare const __PYTHON_FARMING_BUILD_CHANNEL__: string");
    expect(appConfig).toContain("buildSha: __PYTHON_FARMING_BUILD_SHA__");
    expect(appConfig).toContain("buildChannel: __PYTHON_FARMING_BUILD_CHANNEL__");
  });

  it("shows and reports the exact running build identity", () => {
    const statusBar = read("src/components/navigation/StatusBar.tsx");
    const diagnosticsTypes = read("src/features/diagnostics/types.ts");
    const diagnosticsService = read("src/features/diagnostics/services/diagnosticsService.ts");
    const browserJourney = read("tests/e2e/primary-navigation.spec.ts");

    expect(diagnosticsTypes).toContain("buildSha: string");
    expect(diagnosticsTypes).toContain("buildChannel: string");
    expect(diagnosticsService).toContain("Build kanalı:");
    expect(diagnosticsService).toContain("Build commit:");
    expect(statusBar).toContain("Çalışan build:");
    expect(statusBar).toContain("appConfig.buildSha");
    expect(statusBar).toContain("appConfig.buildChannel");
    expect(browserJourney).toContain("Python Farming v1\\.1\\.0");
  });
});
