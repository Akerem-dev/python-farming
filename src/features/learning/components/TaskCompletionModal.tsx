import { Button } from "../../../components/common/Button";

interface TaskCompletionModalProps {
  open: boolean;
  taskTitle: string;
  score: number;
  xpReward: number;
  onClose: () => void;
  onReview: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  backdropClassName?: string;
  modalClassName?: string;
  badgeClassName?: string;
  actionsClassName?: string;
}

export function TaskCompletionModal({
  open,
  taskTitle,
  score,
  xpReward,
  onClose,
  onReview,
  onContinue = onClose,
  continueLabel = "Devam et",
  backdropClassName,
  modalClassName,
  badgeClassName,
  actionsClassName,
}: TaskCompletionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className={backdropClassName} role="presentation" onMouseDown={onClose}>
      <section
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-completion-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={badgeClassName} aria-hidden="true">✓</span>
        <p>Görev tamamlandı</p>
        <h2 id="task-completion-title">{taskTitle}</h2>
        <div>
          <span>Başarı</span>
          <strong>%{score}</strong>
        </div>
        <div>
          <span>Kazanılan deneyim</span>
          <strong>+{xpReward} XP</strong>
        </div>
        <div className={actionsClassName}>
          <Button onClick={onReview}>Testleri incele</Button>
          <Button variant="primary" onClick={onContinue}>{continueLabel}</Button>
        </div>
      </section>
    </div>
  );
}
