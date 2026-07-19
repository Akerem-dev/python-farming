import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.root} aria-label={label ?? `İlerleme yüzde ${normalized}`}>
      <div className={styles.track}>
        <span className={styles.value} style={{ width: `${normalized}%` }} />
      </div>
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
