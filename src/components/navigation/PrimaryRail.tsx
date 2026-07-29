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

function NavigationIcon({ route }: { route: AppRoute }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    focusable: false,
    "aria-hidden": true,
  };

  if (route === routes.home) {
    return (
      <svg {...common}>
        <path d="m3.5 10.8 8.5-7 8.5 7" />
        <path d="M5.5 9.8v10h13v-10" />
        <path d="M9.5 19.8v-6h5v6" />
      </svg>
    );
  }

  if (route === routes.workspace) {
    return (
      <svg {...common}>
        <path d="m8.5 7-5 5 5 5" />
        <path d="m15.5 7 5 5-5 5" />
        <path d="m13.5 4-3 16" />
      </svg>
    );
  }

  if (route === routes.tasks) {
    return (
      <svg {...common}>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="m8 12 2.3 2.3L16 8.8" />
      </svg>
    );
  }

  if (route === routes.projects) {
    return (
      <svg {...common}>
        <path d="M3.5 7.5h6l1.7 2H20.5v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" />
        <path d="M3.5 7.5V5A1.5 1.5 0 0 1 5 3.5h4.2l1.6 2H19A1.5 1.5 0 0 1 20.5 7v2.5" />
      </svg>
    );
  }

  if (route === routes.progress) {
    return (
      <svg {...common}>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1A1.7 1.7 0 0 0 1.9 13H2V9h-.1A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.2l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.1A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8c.1.4.32.76.6 1 .3.28.68.48 1.1.55H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

export function PrimaryRail({ activeRoute }: PrimaryRailProps) {
  return (
    <nav className={styles.root} aria-label="Ana navigasyon">
      <span className={styles.sectionLabel}>Ana menü</span>
      <div className={styles.list}>
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
              <span className={styles.symbol} aria-hidden="true" data-fallback-symbol={item.symbol}>
                <NavigationIcon route={item.route} />
              </span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
