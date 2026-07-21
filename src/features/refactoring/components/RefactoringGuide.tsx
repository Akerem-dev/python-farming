import type { CurriculumRefactoringGuide } from "../../curriculum/types";
import styles from "./RefactoringGuide.module.css";

interface RefactoringGuideProps {
  guide: CurriculumRefactoringGuide;
}

export function RefactoringGuide({ guide }: RefactoringGuideProps) {
  return (
    <section className={styles.guide} aria-label="Refactoring rehberi">
      <header>
        <div>
          <span>Refactoring laboratuvarı</span>
          <strong>Davranışı koru, yapıyı iyileştir</strong>
        </div>
        <em>REFACTOR</em>
      </header>

      <div className={styles.summaryGrid}>
        <article>
          <span>Kod kokusu</span>
          <p>{guide.problem}</p>
        </article>
        <article>
          <span>Hedef yapı</span>
          <p>{guide.goal}</p>
        </article>
      </div>

      <ol>
        {guide.workflow.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
