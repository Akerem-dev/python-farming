import type { CurriculumGraduationGuide } from "../../curriculum/types";
import styles from "./GraduationGuide.module.css";

interface GraduationGuideProps {
  guide: CurriculumGraduationGuide;
}

export function GraduationGuide({ guide }: GraduationGuideProps) {
  return (
    <aside className={styles.panel} aria-label="Başlangıç mezuniyet sınavı rehberi">
      <div className={styles.header}>
        <div>
          <span>Başlangıç Mezuniyet Sınavı</span>
          <strong>8 modül · tek kapsamlı teslim</strong>
        </div>
        <div className={styles.badgePreview} aria-label={`Kazanılacak rozet: ${guide.badgeName}`}>
          <i aria-hidden="true">◆</i>
          <div>
            <small>Kazanılacak rozet</small>
            <b>{guide.badgeName}</b>
          </div>
        </div>
      </div>

      <div className={styles.topicSection}>
        <span>Sınav kapsamı</span>
        <div className={styles.topics}>
          {guide.topics.map((topic) => (
            <b key={topic}>{topic}</b>
          ))}
        </div>
      </div>

      <div className={styles.criteriaSection}>
        <span>Mezuniyet ölçütleri</span>
        <ol>
          {guide.criteria.map((criterion, index) => (
            <li key={criterion}>
              <i>{String(index + 1).padStart(2, "0")}</i>
              <p>{criterion}</p>
            </li>
          ))}
        </ol>
      </div>

      <footer>
        <span>Başarılı teslim sonrası</span>
        <strong>{guide.nextLevel} yolu açılır →</strong>
      </footer>
    </aside>
  );
}
