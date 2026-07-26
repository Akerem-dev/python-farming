import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");
const manifestScript = readFileSync("scripts/create-release-manifest.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("multiplatform release contract", () => {
  it("keeps manual runs as dry-run artifacts instead of fake releases", () => {
    expect(releaseWorkflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(releaseWorkflow).toContain("Build dry-run Tauri bundles");
    expect(releaseWorkflow).toContain("Upload dry-run bundles and manifest");
    expect(releaseWorkflow).not.toContain("v__VERSION__");
  });

  it("publishes GitHub releases only for matching version tags", () => {
    expect(releaseWorkflow).toContain("if: github.ref_type == 'tag'");
    expect(releaseWorkflow).toContain(
      "Tag $GITHUB_REF_NAME does not match application version",
    );
    expect(releaseWorkflow).toContain("tagName: ${{ github.ref_name }}");
  });

  it("builds Windows, Linux and both macOS architectures", () => {
    expect(releaseWorkflow).toContain("x86_64-pc-windows-msvc");
    expect(releaseWorkflow).toContain("x86_64-unknown-linux-gnu");
    expect(releaseWorkflow).toContain("aarch64-apple-darwin");
    expect(releaseWorkflow).toContain("x86_64-apple-darwin");
  });

  it("generates SHA-256 release manifests", () => {
    expect(packageJson.scripts["release:manifest"]).toContain(
      "create-release-manifest.mjs",
    );
    expect(manifestScript).toContain('createHash("sha256")');
    expect(manifestScript).toContain("schemaVersion: 1");
    expect(manifestScript).toContain("applicationVersion: version");
  });
});
