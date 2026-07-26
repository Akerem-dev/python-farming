import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const repository = "astral-sh/python-build-standalone";
const releaseTag = process.env.PYTHON_FARMING_RUNTIME_RELEASE ?? "20260510";
const pythonSeries = process.env.PYTHON_FARMING_RUNTIME_SERIES ?? "3.13";
const projectRoot = resolve(import.meta.dirname, "..");
const runtimeDirectory = join(projectRoot, "src-tauri", "python-runtime");
const manifestPath = join(runtimeDirectory, "runtime-manifest.json");
const cacheDirectory = join(tmpdir(), "python-farming-runtime-cache");

function hostTarget() {
  const key = `${process.platform}-${process.arch}`;
  const targets = {
    "win32-x64": "x86_64-pc-windows-msvc",
    "linux-x64": "x86_64-unknown-linux-gnu",
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
  };
  const target = targets[key];
  if (!target) {
    throw new Error(`Desteklenmeyen portable Python build platformu: ${key}`);
  }
  return target;
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "python-farming-runtime-preparer",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API isteği başarısız (${response.status}): ${url}`);
  }
  return response.json();
}

async function releaseAssets() {
  const release = await fetchJson(
    `https://api.github.com/repos/${repository}/releases/tags/${releaseTag}`,
  );
  const assets = [];
  for (let page = 1; ; page += 1) {
    const batch = await fetchJson(
      `https://api.github.com/repos/${repository}/releases/${release.id}/assets?per_page=100&page=${page}`,
    );
    assets.push(...batch);
    if (batch.length < 100) {
      return assets;
    }
  }
}

function selectAsset(assets, target) {
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedTag = releaseTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSeries = pythonSeries.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^cpython-${escapedSeries}\\.\\d+\\+${escapedTag}-${escapedTarget}-install_only_stripped\\.tar\\.gz$`,
  );
  const matches = assets.filter((asset) => pattern.test(asset.name));
  if (matches.length !== 1) {
    throw new Error(
      `${target} için tam bir portable Python asset'i bulunamadı. Eşleşme sayısı: ${matches.length}`,
    );
  }
  const asset = matches[0];
  if (typeof asset.digest !== "string" || !asset.digest.startsWith("sha256:")) {
    throw new Error(`${asset.name} GitHub SHA-256 özeti taşımıyor.`);
  }
  return asset;
}

async function sha256(path) {
  const hash = createHash("sha256");
  hash.update(await readFile(path));
  return hash.digest("hex");
}

async function downloadAsset(asset) {
  await mkdir(cacheDirectory, { recursive: true });
  const archivePath = join(cacheDirectory, asset.name);
  const expected = asset.digest.slice("sha256:".length).toLowerCase();
  if (existsSync(archivePath) && (await sha256(archivePath)) === expected) {
    return archivePath;
  }

  const temporaryPath = `${archivePath}.download`;
  await rm(temporaryPath, { force: true });
  const response = await fetch(asset.browser_download_url, {
    headers: githubHeaders(),
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Portable Python indirilemedi (${response.status}): ${asset.name}`);
  }
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(temporaryPath)));
  const actual = await sha256(temporaryPath);
  if (actual !== expected) {
    await rm(temporaryPath, { force: true });
    throw new Error(`Portable Python SHA-256 uyuşmuyor: beklenen ${expected}, bulunan ${actual}`);
  }
  await rename(temporaryPath, archivePath);
  return archivePath;
}

async function discoverRuntimeExecutable(target) {
  const windows = target.includes("windows");
  const directories = windows
    ? [
        join(runtimeDirectory, "python"),
        join(runtimeDirectory, "python", "install"),
        runtimeDirectory,
      ]
    : [
        join(runtimeDirectory, "python", "bin"),
        join(runtimeDirectory, "python", "install", "bin"),
        join(runtimeDirectory, "bin"),
        join(runtimeDirectory, "install", "bin"),
      ];
  const matches = [];
  for (const directory of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      const valid = windows
        ? entry.name.toLowerCase() === "python.exe"
        : /^python3(?:\.\d+)*$/.test(entry.name) || entry.name === "python";
      if (valid) {
        matches.push(join(directory, entry.name));
      }
    }
  }
  matches.sort((left, right) => {
    const leftName = basename(left);
    const rightName = basename(right);
    const leftRank = leftName === "python3" || leftName.toLowerCase() === "python.exe" ? 0 : 1;
    const rightRank = rightName === "python3" || rightName.toLowerCase() === "python.exe" ? 0 : 1;
    return leftRank - rightRank || left.length - right.length || left.localeCompare(right);
  });
  if (matches.length === 0) {
    throw new Error(`Arşiv ${target} için kullanılabilir Python executable'ı üretmedi.`);
  }
  return matches[0];
}

function relativeExecutablePath(executable) {
  const value = relative(runtimeDirectory, executable);
  if (!value || isAbsolute(value) || value.split(sep).includes("..")) {
    throw new Error(`Python executable runtime klasörünün dışında: ${executable}`);
  }
  return value.split(sep).join("/");
}

function validateHostRuntime(target, executable) {
  if (target !== hostTarget()) {
    return null;
  }
  const version = execFileSync(executable, ["-I", "-X", "utf8", "--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  execFileSync(
    executable,
    ["-I", "-X", "utf8", "-c", "import asyncio, json, sqlite3; print('runtime-ok')"],
    { stdio: "inherit" },
  );
  return version;
}

async function main() {
  const target = process.env.PYTHON_FARMING_RUNTIME_TARGET ?? hostTarget();
  const assets = await releaseAssets();
  const asset = selectAsset(assets, target);
  const archivePath = await downloadAsset(asset);

  await rm(runtimeDirectory, { recursive: true, force: true });
  await mkdir(runtimeDirectory, { recursive: true });
  execFileSync("tar", ["-xzf", archivePath, "-C", runtimeDirectory], { stdio: "inherit" });

  const executable = await discoverRuntimeExecutable(target);
  const executableRelativePath = relativeExecutablePath(executable);
  const version = validateHostRuntime(target, executable);
  const manifest = {
    schemaVersion: 1,
    provider: repository,
    releaseTag,
    pythonSeries,
    target,
    asset: asset.name,
    digest: asset.digest,
    archive: basename(archivePath),
    executableRelativePath,
    verifiedAt: new Date().toISOString(),
    hostValidatedVersion: version,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Portable Python hazırlandı: ${target} (${asset.name}, ${executableRelativePath})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
