import type { CurriculumDataTransformationGuide } from "../../curriculum/types";
import styles from "./DataTransformationGuide.module.css";

interface DataTransformationGuideProps {
  guide: CurriculumDataTransformationGuide;
}

export function DataTransformationGuide({ guide }: DataTransformationGuideProps) {
  return (
    <aside className={styles.panel} aria-label="Veri dönüştürme rehberi">
      <div className={styles.header}>
        <span>Veri Dönüştürme Laboratuvarı</span>
        <strong>Kaynak → Hedef</strong>
      </div>

      <div className={styles.shapes}>
        <div>
          <span>Kaynak veri</span>
          <code>{guide.sourceShape}</code>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>Hedef veri</span>
          <code>{guide.targetShape}</code>
        </div>
      </div>

      <div className={styles.rules}>
        <span>Dönüşüm kuralları</span>
        <ul>
          {guide.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <ol className={styles.workflow}>
        {guide.workflow.map((step, index) => (
          <li key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
