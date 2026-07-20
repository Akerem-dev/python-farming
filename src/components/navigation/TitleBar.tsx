import { appConfig } from "../../app/appConfig";
import { useProgressStore } from "../../features/progress/store/progressStore";
import styles from "./TitleBar.module.css";

interface TitleBarProps {
  context: string;
}

export function TitleBar({ context }: TitleBarProps) {
  const totalXp = useProgressStore((state) => state.totalXp);

  return (
    <header className={styles.root}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          &lt;/&gt;
        </span>
        <span>{appConfig.name}</span>
      </div>

      <div className={styles.context}>{context}</div>

      <div className={styles.metrics} aria-label="Kullanıcı ilerleme bilgileri">
        <span><strong>7</strong> günlük seri</span>
        <span className={styles.divider} />
        <span><strong>{totalXp.toLocaleString("tr-TR")}</strong> XP</span>
        <span className={styles.mode}>Mod: Öğrenme</span>
      </div>
    </header>
  );
}
