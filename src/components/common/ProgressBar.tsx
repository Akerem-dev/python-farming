import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  value: number;
  label?: string;
  accessibleLabel?: string;
}

export function ProgressBar({
  value,
  label,
  accessibleLabel = "İlerleme",
}: ProgressBarProps) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div
      className={styles.root}
      role="progressbar"
      aria-label={accessibleLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
      aria-valuetext={`Yüzde ${normalized}`}
    >
      <div className={styles.track} aria-hidden="true">
        <span className={styles.value} style={{ width: `${normalized}%` }} />
      </div>
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
