import { ProgressBar } from "../common/ProgressBar";
import styles from "./CurriculumSidebar.module.css";

interface CurriculumItem {
  number: string;
  title: string;
  state: "done" | "active" | "locked";
}

const curriculum: CurriculumItem[] = [
  { number: "01", title: "Python’a Giriş", state: "done" },
  { number: "02", title: "Değişkenler ve Veri Tipleri", state: "active" },
  { number: "03", title: "Operatörler", state: "locked" },
  { number: "04", title: "Koşullar", state: "locked" },
  { number: "05", title: "Döngüler", state: "locked" },
  { number: "06", title: "Fonksiyonlar", state: "locked" },
  { number: "07", title: "Listeler ve Tuple", state: "locked" },
  { number: "08", title: "Sözlükler ve Kümeler", state: "locked" },
];

interface CurriculumSidebarProps {
  compact?: boolean;
}

export function CurriculumSidebar({ compact = false }: CurriculumSidebarProps) {
  return (
    <aside className={`${styles.root} ${compact ? styles.compact : ""}`.trim()}>
      <div className={styles.headingRow}>
        <span>Müfredat</span>
        <span className={styles.count}>8 bölüm</span>
      </div>

      <div className={styles.levelLabel}>Başlangıç seviyesi</div>

      <div className={styles.list}>
        {curriculum.map((item) => (
          <div className={`${styles.row} ${styles[item.state]}`} key={item.number}>
            <span className={styles.number}>{item.number}</span>
            <span className={styles.title}>{item.title}</span>
            <span className={styles.state} aria-hidden="true">
              {item.state === "done" ? "✓" : item.state === "active" ? "●" : "○"}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.progressBox}>
        <div className={styles.progressHeader}>
          <span>Genel ilerleme</span>
          <strong>%18</strong>
        </div>
        <ProgressBar value={18} />
        <p>7 / 38 ders tamamlandı</p>
      </div>
    </aside>
  );
}
