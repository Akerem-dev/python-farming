import { navigate } from "../../app/AppRouter";
import { routes } from "../../app/routes";
import { Button } from "../../components/common/Button";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  return (
    <main className={styles.root}>
      <span>404</span>
      <h1>Bu alan henüz ekilmedi.</h1>
      <p>Aradığın ekran Python Farming’in mevcut rotalarında bulunmuyor.</p>
      <Button variant="primary" onClick={() => navigate(routes.home)}>Ana sayfaya dön</Button>
    </main>
  );
}
