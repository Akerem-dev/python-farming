import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

const packageJson = JSON.parse(read("package.json")) as {
  version: string;
  scripts: Record<string, string>;
  engines: Record<string, string>;
};
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  version: string;
};
const cargoToml = read("src-tauri/Cargo.toml");
const readme = read("README.md");
const releaseWorkflow = read(".github/workflows/release.yml");

describe("release readiness contract", () => {
  it("keeps JavaScript, Tauri and Rust versions aligned", () => {
    const cargoVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];

    expect(packageJson.version).toBe("0.1.0");
    expect(tauriConfig.version).toBe(packageJson.version);
    expect(cargoVersion).toBe(packageJson.version);
  });

  it("provides one-command frontend and Rust verification", () => {
    expect(packageJson.scripts["verify:frontend"]).toContain("typecheck");
    expect(packageJson.scripts["verify:frontend"]).toContain("npm test");
    expect(packageJson.scripts["verify:frontend"]).toContain("npm run build");
    expect(packageJson.scripts["verify:rust"]).toContain("cargo fmt");
    expect(packageJson.scripts["verify:rust"]).toContain("cargo test --all-targets --locked");
    expect(packageJson.scripts.verify).toContain("verify:frontend");
    expect(packageJson.scripts.verify).toContain("verify:rust");
    expect(packageJson.engines.node).toBe(">=20.19.0");
    expect(packageJson.engines.npm).toBe(">=10.0.0");
  });

  it("documents the real completed product and clean install", () => {
    expect(readme).toContain("31/31 ana geliştirme aşaması tamamlandı");
    expect(readme).toContain("npm ci");
    expect(readme).toContain("npm run verify");
    expect(readme).toContain("docs/RELEASE_CHECKLIST.md");
    expect(readme).not.toContain("Aşama 3 — Yerel Python çalışma motoru");
  });

  it("uses the current official Tauri draft release pipeline", () => {
    expect(releaseWorkflow).toContain("actions/checkout@v7");
    expect(releaseWorkflow).toContain("actions/setup-node@v6");
    expect(releaseWorkflow).toContain("tauri-apps/tauri-action@v1");
    expect(releaseWorkflow).toContain("npm ci");
    expect(releaseWorkflow).toContain("releaseDraft: true");
    expect(releaseWorkflow).toContain("prerelease: true");
    expect(releaseWorkflow).toContain("aarch64-apple-darwin");
    expect(releaseWorkflow).toContain("x86_64-apple-darwin");
    expect(releaseWorkflow).toContain("ubuntu-22.04");
    expect(releaseWorkflow).toContain("windows-latest");
    expect(releaseWorkflow).toContain("APPLE_SIGNING_IDENTITY");
  });
});
