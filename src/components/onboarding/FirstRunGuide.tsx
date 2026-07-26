import { Button } from "../common/Button";
import styles from "./FirstRunGuide.module.css";

interface FirstRunGuideProps {
  lessonTitle: string;
  onStart: () => void;
}

const steps = [
  {
    number: "01",
    title: "Görevi oku",
    description: "Beklenen çıktıyı ve küçük gereksinimleri sırayla incele.",
  },
  {
    number: "02",
    title: "Kodu çalıştır",
    description: "Editörde dene; terminal çıktısı ve hata mesajı sana yol göstersin.",
  },
  {
    number: "03",
    title: "Kontrol et",
    description: "Görev doğrulamasını geç, XP kazan ve sıradaki dersin kilidini aç.",
  },
] as const;

export function FirstRunGuide({ lessonTitle, onStart }: FirstRunGuideProps) {
  return (
    <section className={styles.root} aria-labelledby="first-run-guide-title">
      <div className={styles.intro}>
        <span className={styles.eyebrow}>İlk kez mi buradasın?</span>
        <h1 id="first-run-guide-title">Üç adımda ilk Python görevini tamamla</h1>
        <p>
          Önceden kod bilmen gerekmiyor. Her görev açıklama, başlangıç kodu, ipucu,
          gerçek terminal çıktısı ve otomatik kontrol sunar.
        </p>
        <Button variant="primary" onClick={onStart} aria-describedby="first-lesson-name">
          İlk derse başla →
        </Button>
        <small id="first-lesson-name">Açılacak ders: {lessonTitle}</small>
      </div>

      <ol className={styles.steps} aria-label="İlk görev adımları">
        {steps.map((step) => (
          <li key={step.number}>
            <span aria-hidden="true">{step.number}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
