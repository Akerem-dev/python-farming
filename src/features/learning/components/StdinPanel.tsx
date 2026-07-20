interface StdinPanelProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function StdinPanel({
  value,
  onChange,
  disabled = false,
  className,
}: StdinPanelProps) {
  return (
    <details className={className}>
      <summary>
        <span>Program girdisi</span>
        <small>input() kullanan görevler için</small>
      </summary>
      <label>
        Her satır, programa gönderilecek ayrı bir giriş değeridir.
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={"Kerem\n23"}
          spellCheck={false}
          disabled={disabled}
          aria-label="Programa gönderilecek standart giriş"
        />
      </label>
    </details>
  );
}
