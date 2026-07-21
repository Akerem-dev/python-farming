import type { CurriculumFileSystemGuide } from "../../curriculum/types";
import styles from "./FileSystemGuide.module.css";

interface FileSystemGuideProps {
  guide: CurriculumFileSystemGuide;
}

function FileRows({
  files,
  emptyLabel,
}: {
  files: Array<{ path: string; description: string }>;
  emptyLabel: string;
}) {
  if (files.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }

  return (
    <div className={styles.fileRows}>
      {files.map((file) => (
        <div key={file.path}>
          <code>{file.path}</code>
          <span>{file.description}</span>
        </div>
      ))}
    </div>
  );
}

export function FileSystemGuide({ guide }: FileSystemGuideProps) {
  return (
    <section className={styles.root} aria-label="Dosya sistemi laboratuvarı">
      <header>
        <div>
          <span>Dosya Sistemi Laboratuvarı</span>
          <h3>{guide.projectTitle}</h3>
        </div>
        <code>{guide.workingDirectory}</code>
      </header>

      <div className={styles.fileGrid}>
        <article>
          <strong>Giriş dosyaları</strong>
          <FileRows files={guide.inputFiles} emptyLabel="Harici giriş dosyası yok." />
        </article>
        <article>
          <strong>Üretilecek dosyalar</strong>
          <FileRows files={guide.outputFiles} emptyLabel="Yeni dosya üretilmeyecek." />
        </article>
      </div>

      <div className={styles.detailGrid}>
        <article>
          <strong>Kurallar</strong>
          <ul>
            {guide.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </article>
        <article>
          <strong>İşlem akışı</strong>
          <ol>
            {guide.workflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      </div>
    </section>
  );
}
