interface StdinPanelProps {
  value: string;
  onChange: (value: string) => void;
  enabled?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function StdinPanel({
  value,
  onChange,
  enabled = true,
  placeholder = "Kerem\n23",
  disabled = false,
  className,
}: StdinPanelProps) {
  if (!enabled) {
    return null;
  }

  return (
    <details className={className} open>
      <summary>
        <span>Program girdisi</span>
        <small>input() kullanan görevler için</small>
      </summary>
      <label>
        Her satır, programa gönderilecek ayrı bir giriş değeridir.
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          aria-label="Programa gönderilecek standart giriş"
        />
      </label>
    </details>
  );
}
