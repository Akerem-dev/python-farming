import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function pathOf(path: string) {
  return resolve(process.cwd(), path);
}

function read(path: string) {
  return readFileSync(pathOf(path), "utf-8");
}

const packageJson = JSON.parse(read("package.json")) as {
  version: string;
  scripts: Record<string, string>;
  engines: Record<string, string>;
  dependencies: Record<string, string>;
};
const packageLock = JSON.parse(read("package-lock.json")) as {
  version: string;
  lockfileVersion: number;
  packages: Record<string, { version?: string }>;
};
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  version: string;
  bundle: { createUpdaterArtifacts?: boolean };
  plugins?: { updater?: { pubkey?: string; endpoints?: string[] } };
};
const cargoToml = read("src-tauri/Cargo.toml");
const cargoLock = read("src-tauri/Cargo.lock");
const readme = read("README.md");
const ciWorkflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/release.yml");
const releaseChecklist = read("docs/RELEASE_CHECKLIST.md");

describe("release readiness contract", () => {
  it("keeps JavaScript, Tauri and Rust versions aligned", () => {
    const cargoVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];
    expect(packageJson.version).toBe("0.1.0");
    expect(tauriConfig.version).toBe(packageJson.version);
    expect(cargoVersion).toBe(packageJson.version);
    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages[""]?.version).toBe(packageJson.version);
  });

  it("commits locked official updater dependencies", () => {
    expect(packageJson.dependencies["@tauri-apps/plugin-updater"]).toBe("2.10.1");
    expect(packageJson.dependencies["@tauri-apps/plugin-process"]).toBe("2.3.1");
    expect(cargoToml).toContain("tauri-plugin-updater = \"2.10.1\"");
    expect(cargoToml).toContain("tauri-plugin-process = \"2.3.1\"");
    expect(existsSync(pathOf("src-tauri/updater.pub"))).toBe(true);
  });

  it("uses locked dependencies and a real unsigned smoke installer in CI", () => {
    expect(packageLock.lockfileVersion).toBe(3);
    expect(cargoLock).toMatch(/^version = 3$/m);
    expect(ciWorkflow).toContain("run: npm ci");
    expect(ciWorkflow).toContain("cargo test --all-targets --locked");
    expect(ciWorkflow).toContain("npm run tauri:build -- --bundles deb --no-sign");
    expect(ciWorkflow).toContain("portable-runtime-ok");
  });

  it("configures HTTPS signed updater artifacts", () => {
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauriConfig.plugins?.updater?.pubkey).toBe(read("src-tauri/updater.pub").trim());
    expect(tauriConfig.plugins?.updater?.endpoints).toEqual([
      "https://github.com/Akerem-dev/python-farming/releases/latest/download/latest.json",
    ]);
  });

  it("separates preview builds from production tags and requires signing secrets", () => {
    expect(releaseWorkflow).toContain("tauri-apps/tauri-action@v1");
    expect(releaseWorkflow).toContain("Require updater signing key");
    expect(releaseWorkflow).toContain("Require production platform signing identities");
    expect(releaseWorkflow).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(releaseWorkflow).toContain("WINDOWS_CERTIFICATE");
    expect(releaseWorkflow).toContain("APPLE_SIGNING_IDENTITY");
    expect(releaseWorkflow).toContain("Get-AuthenticodeSignature");
    expect(releaseWorkflow).toContain("xcrun stapler validate");
    expect(releaseWorkflow).toContain("Verify updater artifacts and signatures");
    expect(releaseWorkflow).toContain("releaseDraft: ${{ needs.preflight.outputs.production != 'true' }}");
    expect(releaseWorkflow).toContain("prerelease: ${{ needs.preflight.outputs.production != 'true' }}");
  });

  it("builds all supported desktop targets", () => {
    for (const target of [
      "aarch64-apple-darwin",
      "x86_64-apple-darwin",
      "x86_64-unknown-linux-gnu",
      "x86_64-pc-windows-msvc",
    ]) {
      expect(releaseWorkflow).toContain(target);
    }
  });

  it("documents the 40-stage product and key custody rules", () => {
    expect(readme).toContain("40 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");
    expect(readme).toContain("imzalı uygulama içi güncelleme");
    expect(releaseChecklist).toContain("Private updater key kaybedilirse");
    expect(releaseChecklist).toContain("İndirmeden önce yerel SQLite ilerleme yedeği");
    expect(releaseChecklist).toContain("WINDOWS_CERTIFICATE");
    expect(releaseChecklist).toContain("APPLE_TEAM_ID");
  });
});
