import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8")) as {
  scripts: Record<string, string>;
};
const tauriConfig = JSON.parse(
  readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf-8"),
) as {
  bundle: { icon: string[] };
};
const cargoToml = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf-8");
const tauriLib = readFileSync(resolve(root, "src-tauri/src/lib.rs"), "utf-8");

const iconPaths = [
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
  "src-tauri/icons/icon.icns",
  "src-tauri/icons/icon.ico",
] as const;

function pngDimensions(path: string) {
  const contents = readFileSync(resolve(root, path));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(contents.subarray(0, 8)).toEqual(pngSignature);
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

describe("application icon pipeline", () => {
  it("generates bundle icons from the single brand master", () => {
    expect(packageJson.scripts["icons:generate"]).toBe(
      "tauri icon src-tauri/icons/app-icon-master.png",
    );
    expect(packageJson.scripts["pretauri:dev"]).toBe("npm run icons:generate");
    expect(packageJson.scripts["pretauri:build"]).toBe("npm run icons:generate");
  });

  it("keeps a sufficiently large square master icon", () => {
    const dimensions = pngDimensions("src-tauri/icons/app-icon-master.png");
    expect(dimensions.width).toBe(dimensions.height);
    expect(dimensions.width).toBeGreaterThanOrEqual(512);
  });

  it("embeds the brand master as the default runtime window icon", () => {
    expect(cargoToml).toContain('tauri = { version = "2", features = ["image-png"] }');
    expect(tauriLib).toContain("let mut context = tauri::generate_context!()");
    expect(tauriLib).toContain("context.set_default_window_icon");
    expect(tauriLib).toContain('"icons/app-icon-master.png"');
    expect(tauriLib).toContain(".run(context)");
  });

  it("provides every icon referenced by the Tauri bundle", () => {
    expect(tauriConfig.bundle.icon).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
    ]);

    for (const path of iconPaths) {
      expect(statSync(resolve(root, path)).size).toBeGreaterThan(0);
    }
  });
});
