import type { CurriculumDebuggingGuide } from "../../curriculum/types";
import styles from "./DebugGuide.module.css";

interface DebugGuideProps {
  guide: CurriculumDebuggingGuide;
  runtimeHasError: boolean;
  className?: string;
}

export function DebugGuide({ guide, runtimeHasError, className }: DebugGuideProps) {
  return (
    <aside className={`${styles.guide} ${className ?? ""}`.trim()} aria-label="Hata ayıklama rehberi">
      <header>
        <div>
          <span>Hata Avcısı</span>
          <strong>{guide.errorType}</strong>
        </div>
        <i data-active={runtimeHasError || undefined}>
          {runtimeHasError ? "Hata görüldü" : "Henüz çalıştırılmadı"}
        </i>
      </header>

      <p>{guide.symptom}</p>

      <ol>
        {guide.workflow.map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
