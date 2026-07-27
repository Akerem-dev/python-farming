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
      <div className={styles.brand} aria-label={appConfig.name}>
        <img
          className={styles.logo}
          src="/assets/brand/logo-mark.png"
          alt=""
          aria-hidden="true"
        />
        <span className={styles.brandText}>{appConfig.name}</span>
      </div>

      <div className={styles.context}>
        <span>Bulunduğun yer</span>
        <strong>{context}</strong>
      </div>

      <div className={styles.metrics} aria-label="Kullanıcı ilerleme bilgileri">
        <span className={styles.metric}>
          <small>Seri</small>
          <strong>7 gün</strong>
        </span>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.metric}>
          <small>Toplam</small>
          <strong>{totalXp.toLocaleString("tr-TR")} XP</strong>
        </span>
        <span className={styles.mode}>Öğrenme modu</span>
      </div>
    </header>
  );
}
