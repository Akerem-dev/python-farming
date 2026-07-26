import { navigate } from "../../app/AppRouter";
import { routes, type AppRoute } from "../../app/routes";
import styles from "./PrimaryRail.module.css";

interface RailItem {
  label: string;
  symbol: string;
  route?: AppRoute;
}

const items: RailItem[] = [
  { label: "Ana Sayfa", symbol: "⌂", route: routes.home },
  { label: "Kod Alanı", symbol: "</>", route: routes.workspace },
  { label: "Görevler", symbol: "✓" },
  { label: "Projeler", symbol: "□" },
  { label: "İlerleme", symbol: "◒" },
  { label: "Ayarlar", symbol: "⚙", route: routes.settings },
];

interface PrimaryRailProps {
  activeRoute: AppRoute;
}

export function PrimaryRail({ activeRoute }: PrimaryRailProps) {
  return (
    <nav className={styles.root} aria-label="Ana navigasyon">
      {items.map((item) => {
        const active = item.route === activeRoute;
        const unavailable = !item.route;

        return (
          <button
            className={`${styles.item} ${active ? styles.active : ""}`.trim()}
            key={item.label}
            onClick={() => item.route && navigate(item.route)}
            type="button"
            disabled={unavailable}
            aria-current={active ? "page" : undefined}
            title={unavailable ? `${item.label} bölümü henüz kullanıma açılmadı.` : undefined}
          >
            <span className={styles.symbol} aria-hidden="true">
              {item.symbol}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
