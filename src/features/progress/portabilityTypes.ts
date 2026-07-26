import type { ProgressBackupOverview, ProgressSnapshot } from "./types";

export interface ProgressExportResult {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  exportedAt: number;
  completedLessonCount: number;
  totalXp: number;
}

export interface ProgressMutationResult {
  snapshot: ProgressSnapshot;
  backupOverview: Omit<ProgressBackupOverview, "available">;
}
