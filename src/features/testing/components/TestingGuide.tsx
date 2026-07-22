import type { CurriculumTestingGuide } from "../../curriculum/types";
import styles from "./TestingGuide.module.css";

interface TestingGuideProps {
  guide: CurriculumTestingGuide;
}

export function TestingGuide({ guide }: TestingGuideProps) {
  return (
    <aside className={styles.guide} aria-label="Test laboratuvarı rehberi">
      <header>
        <span>Test Laboratuvarı</span>
        <strong>{guide.labTitle}</strong>
        <p>{guide.objective}</p>
      </header>

      <div className={styles.fileGrid}>
        <section>
          <span>Test edilen kaynaklar</span>
          {guide.sourceFiles.map((file) => (
            <code key={file}>{file}</code>
          ))}
        </section>
        <section>
          <span>Test dosyaları</span>
          {guide.testFiles.map((file) => (
            <code key={file}>{file}</code>
          ))}
        </section>
      </div>

      <section className={styles.principles}>
        <span>Kalite ölçütleri</span>
        <ul>
          {guide.principles.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>

      <section className={styles.workflow}>
        <span>Test döngüsü</span>
        <ol>
          {guide.workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
