import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "../../../runtime/runtimeClient";
import type {
  CompleteLessonRequest,
  ProgressBackupOverview,
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

function requireDesktopBackups() {
  if (!isTauriEnvironment()) {
    throw new Error(
      "İlerleme yedekleri yalnız Tauri masaüstü uygulamasında yönetilebilir.",
    );
  }
}

async function invokeBackupOverview(
  command: string,
  args?: Record<string, unknown>,
): Promise<ProgressBackupOverview> {
  const overview = await invoke<Omit<ProgressBackupOverview, "available">>(
    command,
    args,
  );
  return { ...overview, available: true };
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

  return invokeBackupOverview("list_progress_backups");
}

export async function createProgressBackup(): Promise<ProgressBackupOverview> {
  requireDesktopBackups();
  return invokeBackupOverview("create_progress_backup");
}

export async function restoreProgressBackup(
  backupId: string,
): Promise<ProgressBackupOverview> {
  requireDesktopBackups();
  return invokeBackupOverview("restore_progress_backup", { backupId });
}

export async function deleteProgressBackup(
  backupId: string,
): Promise<ProgressBackupOverview> {
  requireDesktopBackups();
  return invokeBackupOverview("delete_progress_backup", { backupId });
}
