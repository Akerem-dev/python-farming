import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { createProgressBackup } from "../../progress/services/progressService";
import { isTauriEnvironment } from "../../../runtime/runtimeClient";
import type {
  AvailableApplicationUpdate,
  UpdateDownloadProgress,
} from "../types";

let pendingUpdate: Update | null = null;

function releaseNotes(body: string | undefined) {
  const value = body?.trim();
  return value ? value.slice(0, 4_000) : null;
}

async function closePendingUpdate() {
  if (!pendingUpdate) return;
  await pendingUpdate.close();
  pendingUpdate = null;
}

export async function checkForApplicationUpdate(): Promise<
  AvailableApplicationUpdate | null
> {
  if (!isTauriEnvironment()) {
    throw new Error("Güncelleme denetimi yalnız masaüstü uygulamasında kullanılabilir.");
  }

  await closePendingUpdate();
  const update = await check({ timeout: 15_000 });
  if (!update) return null;

  pendingUpdate = update;
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date ?? null,
    notes: releaseNotes(update.body),
  };
}

export async function installPendingApplicationUpdate(
  onProgress: (
    progress: UpdateDownloadProgress,
    phase: "downloading" | "installing",
  ) => void,
) {
  const update = pendingUpdate;
  if (!update) {
    throw new Error("Kurulabilecek bir güncelleme bulunmuyor.");
  }

  await createProgressBackup();

  let downloadedBytes = 0;
  let totalBytes: number | null = null;
  const reportProgress = (event: DownloadEvent) => {
    if (event.event === "Started") {
      totalBytes = event.data.contentLength ?? null;
      onProgress({ downloadedBytes, totalBytes }, "downloading");
      return;
    }

    if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
      onProgress({ downloadedBytes, totalBytes }, "downloading");
      return;
    }

    onProgress({ downloadedBytes, totalBytes }, "installing");
  };

  await update.downloadAndInstall(reportProgress, { timeout: 5 * 60_000 });
  pendingUpdate = null;
  await update.close();
  await relaunch();
}
