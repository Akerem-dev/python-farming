import type { CurriculumCodeBlock } from "../../curriculum/types";
import type { OrderMoveDirection } from "../store/taskValidationStore";
import styles from "./CodeOrderingPanel.module.css";

interface CodeOrderingPanelProps {
  prompt: string;
  blocks: CurriculumCodeBlock[];
  orderedBlockIds: string[];
  onMove: (blockId: string, direction: OrderMoveDirection) => void;
  disabled?: boolean;
}

export function CodeOrderingPanel({
  prompt,
  blocks,
  orderedBlockIds,
  onMove,
  disabled = false,
}: CodeOrderingPanelProps) {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return (
    <section className={styles.panel} aria-label="Kod bloklarını sıralama alanı">
      <header>
        <span>Kod sıralama</span>
        <p>{prompt}</p>
      </header>

      <ol>
        {orderedBlockIds.map((blockId, index) => {
          const block = blockMap.get(blockId);
          if (!block) {
            return null;
          }

          return (
            <li key={blockId}>
              <span>{index + 1}</span>
              <pre>{block.code}</pre>
              <div>
                <button
                  type="button"
                  onClick={() => onMove(blockId, "up")}
                  disabled={disabled || index === 0}
                  aria-label={`${index + 1}. bloğu yukarı taşı`}
                  title="Yukarı taşı"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(blockId, "down")}
                  disabled={disabled || index === orderedBlockIds.length - 1}
                  aria-label={`${index + 1}. bloğu aşağı taşı`}
                  title="Aşağı taşı"
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
