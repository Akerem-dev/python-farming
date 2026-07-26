export interface ProgressSnapshot {
  completedLessonIds: string[];
  totalXp: number;
  lastLessonId: string | null;
}

export interface CompleteLessonRequest {
  lessonId: string;
  xpReward: number;
}

export type ProgressBackupIntegrityStatus = "ok" | "corrupt";

export interface ProgressBackupSummary {
  id: string;
  createdAt: number;
  sizeBytes: number;
  integrityStatus: ProgressBackupIntegrityStatus;
  completedLessonCount: number | null;
  totalXp: number | null;
}

export interface ProgressBackupOverview {
  backups: ProgressBackupSummary[];
  maxBackupCount: number;
  maxTotalBytes: number;
  totalBytes: number;
  available: boolean;
}
