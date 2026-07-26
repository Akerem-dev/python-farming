import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error(`Geçersiz argüman: ${key ?? "<boş>"}`);
  }
  args.set(key.slice(2), value);
}

const root = path.resolve(args.get("root") ?? "src-tauri/target/release/bundle");
const output = path.resolve(args.get("output") ?? "release-manifest.json");
const platform = args.get("platform");
const version = args.get("version");

if (!platform || !version) {
  throw new Error("--platform ve --version zorunludur.");
}

const artifactPatterns = [
  /\.deb$/i,
  /\.AppImage$/i,
  /\.rpm$/i,
  /\.msi$/i,
  /\.exe$/i,
  /\.dmg$/i,
  /\.app\.tar\.gz(?:\.sig)?$/i,
  /\.nsis\.zip(?:\.sig)?$/i,
  /\.msi\.zip(?:\.sig)?$/i,
];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
    } else if (entry.isFile() && artifactPatterns.some((pattern) => pattern.test(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

const files = (await walk(root)).sort((left, right) => left.localeCompare(right));
if (files.length === 0) {
  throw new Error(`Release paketi bulunamadı: ${root}`);
}

const artifacts = [];
for (const absolute of files) {
  const bytes = await fs.readFile(absolute);
  const stat = await fs.stat(absolute);
  artifacts.push({
    path: path.relative(root, absolute).split(path.sep).join("/"),
    sizeBytes: stat.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const manifest = {
  schemaVersion: 1,
  applicationVersion: version,
  platform,
  generatedAt: new Date().toISOString(),
  artifacts,
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Release manifesti yazıldı: ${output} (${artifacts.length} paket)`);
