import type { CurriculumLessonMode } from "../../curriculum/types";
import styles from "./LessonModeBadge.module.css";

const labels: Record<CurriculumLessonMode, string> = {
  code: "Kod görevi",
  "output-prediction": "Çıktıyı tahmin et",
  "code-completion": "Kod tamamlama",
  debugging: "Hata Avcısı",
  "code-ordering": "Kod sıralama",
  refactoring: "Refactoring",
  "data-transformation": "Veri dönüşümü",
  "file-processing": "Dosya laboratuvarı",
};

interface LessonModeBadgeProps {
  mode: CurriculumLessonMode;
}

export function LessonModeBadge({ mode }: LessonModeBadgeProps) {
  return (
    <span className={styles.badge} data-mode={mode}>
      {labels[mode]}
    </span>
  );
}
