import { appConfig } from "../../app/appConfig";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  return (
    <footer className={styles.root}>
      <span className={styles.ready}><i /> Hazır</span>
      <span>Python runtime: sonraki aşama</span>
      <span className={styles.spacer} />
      <span>{appConfig.name} v{appConfig.version}</span>
      <span>UTF-8</span>
      <span>Tema: Dark</span>
    </footer>
  );
}
