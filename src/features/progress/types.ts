export interface ProgressSnapshot {
  completedLessonIds: string[];
  totalXp: number;
  lastLessonId: string | null;
}

export interface CompleteLessonRequest {
  lessonId: string;
  xpReward: number;
}
