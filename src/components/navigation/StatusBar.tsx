import { appConfig } from "../../app/appConfig";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  return (
    <footer className={styles.root} aria-label="Uygulama durumu">
      <span className={styles.ready} role="status" aria-live="polite">
        <i aria-hidden="true" /> Hazır
      </span>
      <span>Python runtime: otomatik algılama</span>
      <span className={styles.spacer} />
      <span>{appConfig.name} v{appConfig.version}</span>
      <span>UTF-8</span>
      <span>Tema: Dark</span>
    </footer>
  );
}
