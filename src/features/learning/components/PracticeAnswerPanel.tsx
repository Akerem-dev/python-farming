import type { CurriculumChoiceOption } from "../../curriculum/types";
import styles from "./PracticeAnswerPanel.module.css";

interface PracticeAnswerPanelProps {
  prompt: string;
  options: CurriculumChoiceOption[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PracticeAnswerPanel({
  prompt,
  options,
  selectedOptionId,
  onSelect,
  disabled = false,
  className,
}: PracticeAnswerPanelProps) {
  return (
    <fieldset className={`${styles.panel} ${className ?? ""}`.trim()} disabled={disabled}>
      <legend>Çıktı tahminin</legend>
      <p>{prompt}</p>
      <div>
        {options.map((option) => (
          <label key={option.id} data-selected={selectedOptionId === option.id || undefined}>
            <input
              type="radio"
              name="output-prediction"
              value={option.id}
              checked={selectedOptionId === option.id}
              onChange={() => onSelect(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
