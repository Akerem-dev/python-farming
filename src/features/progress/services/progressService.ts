import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "../../../runtime/runtimeClient";
import type { CompleteLessonRequest, ProgressSnapshot } from "../types";

const browserStorageKey = "python-farming-progress-v1";
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
