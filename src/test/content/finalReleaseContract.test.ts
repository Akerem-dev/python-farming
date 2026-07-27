import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Python Farming 1.1 expert release contract", () => {
  it("keeps every application version source aligned at 1.1.0", () => {
    const packageJson = JSON.parse(read("package.json")) as { version: string };
    const packageLock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version?: string }> };
    const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };
    const cargoToml = read("src-tauri/Cargo.toml");
    const cargoLock = read("src-tauri/Cargo.lock");
    const appConfig = read("src/app/appConfig.ts");

    expect(packageJson.version).toBe("1.1.0");
    expect(packageLock.version).toBe("1.1.0");
    expect(packageLock.packages[""]?.version).toBe("1.1.0");
    expect(tauriConfig.version).toBe("1.1.0");
    expect(cargoToml).toMatch(/\[package\][\s\S]*?version = "1\.1\.0"/);
    expect(cargoLock).toMatch(/\[\[package\]\]\nname = "python-farming"\nversion = "1\.1\.0"/);
    expect(appConfig).toContain('version: "1.1.0"');
  });

  it("publishes the complete six-module expert route honestly", () => {
    const curriculum = JSON.parse(read("public/content/curriculum.json")) as { levels: Array<{ id: string; modules: unknown[] }> };
    const packages = JSON.parse(read("public/content/module-packages.json")) as { files: string[] };
    const expert = curriculum.levels.find((level) => level.id === "expert");
    const readme = read("README.md");
    const notes = read("docs/RELEASE_NOTES_1.1.0.md");
    const qa = read("docs/FINAL_QA_1.1.md");

    expect(expert?.modules).toHaveLength(6);
    expect(packages.files).toHaveLength(32);
    expect(packages.files.slice(-6)).toEqual([
      "/content/modules/algorithms-complexity.json",
      "/content/modules/parallelism-systems.json",
      "/content/modules/compilers-metaprogramming.json",
      "/content/modules/distributed-resilience.json",
      "/content/modules/security-observability.json",
      "/content/modules/expert-project.json",
    ]);
    expect(readme).toContain("6 modüllük Uzman Seviye ürün yolu tamamlandı");
    expect(readme).not.toContain("uzman içerikleri ayrı ürün yolunda geliştirilecektir");
    expect(notes).toContain("Güvenilir Kod Analiz Platformu");
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
