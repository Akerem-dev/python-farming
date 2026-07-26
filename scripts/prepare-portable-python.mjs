import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
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

function runtimeExecutable(target, directory = runtimeDirectory) {
  return target.includes("windows")
    ? join(directory, "python", "install", "python.exe")
    : join(directory, "python", "install", "bin", "python3");
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

async function existingRuntimeMatches(target, asset) {
  if (!existsSync(manifestPath) || !existsSync(runtimeExecutable(target))) {
    return false;
  }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return manifest.target === target && manifest.asset === asset.name && manifest.digest === asset.digest;
  } catch {
    return false;
  }
}

function validateHostRuntime(target) {
  if (target !== hostTarget()) {
    return null;
  }
  const executable = runtimeExecutable(target);
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
  if (await existingRuntimeMatches(target, asset)) {
    console.log(`Portable Python hazır: ${target} (${asset.name})`);
    return;
  }

  const archivePath = await downloadAsset(asset);
  await rm(runtimeDirectory, { recursive: true, force: true });
  await mkdir(runtimeDirectory, { recursive: true });
  execFileSync("tar", ["-xzf", archivePath, "-C", runtimeDirectory], { stdio: "inherit" });

  const executable = runtimeExecutable(target);
  if (!existsSync(executable)) {
    throw new Error(`Arşiv beklenen Python executable'ını üretmedi: ${executable}`);
  }
  const version = validateHostRuntime(target);
  const manifest = {
    schemaVersion: 1,
    provider: repository,
    releaseTag,
    pythonSeries,
    target,
    asset: asset.name,
    digest: asset.digest,
    archive: basename(archivePath),
    verifiedAt: new Date().toISOString(),
    hostValidatedVersion: version,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Portable Python hazırlandı: ${target} (${asset.name})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
