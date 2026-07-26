import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "../../../runtime/runtimeClient";
import type {
  CompleteLessonRequest,
  ProgressBackupOverview,
  ProgressRestoreResult,
  ProgressSnapshot,
} from "../types";

const browserStorageKey = "python-farming-progress-v1";
const backupPolicy = {
  maxBackupCount: 5,
  maxTotalBytes: 25 * 1024 * 1024,
} as const;
const emptySnapshot: ProgressSnapshot = {
  completedLessonIds: [],
  totalXp: 0,
  lastLessonId: null,
};

type DesktopBackupOverview = Omit<ProgressBackupOverview, "available">;
type DesktopRestoreResult = Omit<ProgressRestoreResult, "backups"> & {
  backups: DesktopBackupOverview;
};

function readBrowserSnapshot(): ProgressSnapshot {
  try {
    const value = window.localStorage.getItem(browserStorageKey);
    return value ? (JSON.parse(value) as ProgressSnapshot) : emptySnapshot;
  } catch {
    return emptySnapshot;
  }
}

function writeBrowserSnapshot(snapshot: ProgressSnapshot) {
  window.localStorage.setItem(browserStorageKey, JSON.stringify(snapshot));
  return snapshot;
}

function browserBackupOverview(): ProgressBackupOverview {
  return {
    backups: [],
    maxBackupCount: backupPolicy.maxBackupCount,
    maxTotalBytes: backupPolicy.maxTotalBytes,
    totalBytes: 0,
    available: false,
  };
}

function desktopOverview(overview: DesktopBackupOverview): ProgressBackupOverview {
  return { ...overview, available: true };
}

function requireDesktopBackups(action: string) {
  if (!isTauriEnvironment()) {
    throw new Error(`${action} yalnız Tauri masaüstü uygulamasında kullanılabilir.`);
  }
}

export async function loadProgressSnapshot() {
  if (isTauriEnvironment()) {
    return invoke<ProgressSnapshot>("load_progress");
  }
  return readBrowserSnapshot();
}

export async function completeLesson(request: CompleteLessonRequest) {
  if (isTauriEnvironment()) {
    return invoke<ProgressSnapshot>("complete_lesson_progress", { request });
  }

  const current = readBrowserSnapshot();
  const alreadyCompleted = current.completedLessonIds.includes(request.lessonId);
  return writeBrowserSnapshot({
    completedLessonIds: alreadyCompleted
      ? current.completedLessonIds
      : [...current.completedLessonIds, request.lessonId],
    totalXp: alreadyCompleted ? current.totalXp : current.totalXp + request.xpReward,
    lastLessonId: request.lessonId,
  });
}

export async function saveLastLesson(lessonId: string) {
  if (isTauriEnvironment()) {
    return invoke<ProgressSnapshot>("set_last_lesson", { lessonId });
  }

  return writeBrowserSnapshot({ ...readBrowserSnapshot(), lastLessonId: lessonId });
}

export async function listProgressBackups(): Promise<ProgressBackupOverview> {
  if (!isTauriEnvironment()) {
    return browserBackupOverview();
  }

  const overview = await invoke<DesktopBackupOverview>("list_progress_backups");
  return desktopOverview(overview);
}

export async function createProgressBackup(): Promise<ProgressBackupOverview> {
  requireDesktopBackups("İlerleme yedeği oluşturma");
  const overview = await invoke<DesktopBackupOverview>("create_progress_backup");
  return desktopOverview(overview);
}

export async function restoreProgressBackup(backupId: string): Promise<ProgressRestoreResult> {
  requireDesktopBackups("İlerleme yedeği geri yükleme");
  const result = await invoke<DesktopRestoreResult>("restore_progress_backup", {
    request: { backupId },
  });
  return {
    ...result,
    backups: desktopOverview(result.backups),
  };
}

export async function deleteProgressBackup(backupId: string): Promise<ProgressBackupOverview> {
  requireDesktopBackups("İlerleme yedeği silme");
  const overview = await invoke<DesktopBackupOverview>("delete_progress_backup", {
    request: { backupId },
  });
  return desktopOverview(overview);
}
