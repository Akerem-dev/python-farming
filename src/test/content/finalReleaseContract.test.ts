import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Python Farming 1.0 final release contract", () => {
  it("keeps every application version source aligned at 1.0.0", () => {
    const packageJson = JSON.parse(read("package.json")) as { version: string };
    const packageLock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version?: string }> };
    const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };
    const cargoToml = read("src-tauri/Cargo.toml");
    const cargoLock = read("src-tauri/Cargo.lock");
    const appConfig = read("src/app/appConfig.ts");

    expect(packageJson.version).toBe("1.0.0");
    expect(packageLock.version).toBe("1.0.0");
    expect(packageLock.packages[""]?.version).toBe("1.0.0");
    expect(tauriConfig.version).toBe("1.0.0");
    expect(cargoToml).toMatch(/\[package\][\s\S]*?version = "1\.0\.0"/);
    expect(cargoLock).toMatch(/\[\[package\]\]\nname = "python-farming"\nversion = "1\.0\.0"/);
    expect(appConfig).toContain('version: "1.0.0"');
  });

  it("publishes honest completion, release notes and final QA boundaries", () => {
    const readme = read("README.md");
    const checklist = read("docs/RELEASE_CHECKLIST.md");
    const notes = read("docs/RELEASE_NOTES_1.0.0.md");
    const qa = read("docs/FINAL_QA_1.0.md");

    expect(readme).toContain("41 ana geliştirme ve ürün sağlamlaştırma aşaması tamamlandı");
    expect(readme).toContain("1.0.0");
    expect(readme).toContain("Windows Authenticode");
    expect(checklist).toContain("Dry-run");
    expect(checklist).toContain("v1.0.0");
    expect(notes).toContain("Bilinen dağıtım sınırlamaları");
    expect(qa).toContain("işaretlenmemiş maddeler");
    expect(qa).toContain("imzalı installer desteği varmış gibi beyan edilmemelidir");
  });

  it("keeps release publication tag-gated and dry runs non-publishing", () => {
    const workflow = read(".github/workflows/release.yml");
    expect(workflow).toContain("Build dry-run Tauri bundles");
    expect(workflow).toContain("tagName: $" + "{{ github.ref_name }}");
    expect(workflow).toContain("releaseDraft: true");
    expect(workflow).toContain("prerelease: false");
    expect(workflow).not.toContain("v__VERSION__");
    expect(workflow).toContain("release-manifests/");
  });
});
