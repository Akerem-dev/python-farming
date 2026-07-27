import type { MouseEvent } from "react";
import { navigate } from "../../app/AppRouter";
import { routes, type AppRoute } from "../../app/routes";
import styles from "./PrimaryRail.module.css";

interface RailItem {
  label: string;
  symbol: string;
  route: AppRoute;
}

const items: RailItem[] = [
  { label: "Ana Sayfa", symbol: "⌂", route: routes.home },
  { label: "Kod Alanı", symbol: "</>", route: routes.workspace },
  { label: "Görevler", symbol: "✓", route: routes.tasks },
  { label: "Projeler", symbol: "□", route: routes.projects },
  { label: "İlerleme", symbol: "◒", route: routes.progress },
  { label: "Ayarlar", symbol: "⚙", route: routes.settings },
];

interface PrimaryRailProps {
  activeRoute: AppRoute;
}

function followRoute(event: MouseEvent<HTMLAnchorElement>, route: AppRoute) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();
  navigate(route);
}

export function PrimaryRail({ activeRoute }: PrimaryRailProps) {
  return (
    <nav className={styles.root} aria-label="Ana navigasyon">
      {items.map((item) => {
        const active = item.route === activeRoute;

        return (
          <a
            className={`${styles.item} ${active ? styles.active : ""}`.trim()}
            href={`#${item.route}`}
            key={item.label}
            onClick={(event) => followRoute(event, item.route)}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.symbol} aria-hidden="true">
              {item.symbol}
            </span>
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
