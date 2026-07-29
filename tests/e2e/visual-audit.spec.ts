import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const routes = [
  { name: "home", hash: "#/" },
  { name: "workspace", hash: "#/workspace" },
  { name: "tasks", hash: "#/tasks" },
  { name: "projects", hash: "#/projects" },
  { name: "progress", hash: "#/progress" },
  { name: "settings", hash: "#/settings" },
] as const;

const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "compact-1100x760", width: 1100, height: 760 },
] as const;

for (const viewport of viewports) {
  test(`captures ${viewport.name} product screens`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: "reduce" });

    const outputDirectory = join(
      process.cwd(),
      "artifacts",
      "visual-audit",
      viewport.name,
    );
    mkdirSync(outputDirectory, { recursive: true });

    for (const route of routes) {
      await page.goto(`/${route.hash}`);
      await expect(page.locator("#main-content")).toBeVisible();
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            caret-color: transparent !important;
          }
        `,
      });
      await page.evaluate(async () => {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        document.getElementById("main-content")?.scrollTo({ top: 0, left: 0 });
      });
      await page.waitForTimeout(200);
      await page.screenshot({
        path: join(outputDirectory, `${route.name}.png`),
        animations: "disabled",
      });
    }
  });
}
