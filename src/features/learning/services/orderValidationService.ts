import type {
  TaskValidationResult,
  TaskValidationSpec,
} from "../taskValidationTypes";

export function validateOrderAnswer(
  spec: TaskValidationSpec,
  orderedBlockIds: string[],
): TaskValidationResult {
  if (!spec.answer || spec.answer.kind !== "order") {
    throw new Error("Bu görev kod sıralama doğrulaması içermiyor.");
  }

  const expected = spec.answer.correctBlockIds;
  const hasAllBlocks =
    orderedBlockIds.length === expected.length &&
    new Set(orderedBlockIds).size === expected.length &&
    expected.every((blockId) => orderedBlockIds.includes(blockId));
  const isCorrect =
    hasAllBlocks && expected.every((blockId, index) => orderedBlockIds[index] === blockId);

  const checks = [
    {
      id: "all-blocks-present",
      label: "Bütün kod blokları kullanıldı",
      visibility: "visible" as const,
      passed: hasAllBlocks,
      message: hasAllBlocks
        ? "Bütün kod blokları sıralamada yer alıyor."
        : "Eksik veya tekrarlanan kod bloğu var.",
    },
    {
      id: "block-order-correct",
      label: "Gizli sıra kontrolü",
      visibility: "hidden" as const,
      passed: isCorrect,
      message: isCorrect
        ? "Kod bloklarının sırası doğru."
        : "Kod blokları çalışan program sırasıyla eşleşmedi.",
    },
  ];
  const passedCount = checks.filter((check) => check.passed).length;

  return {
    taskId: spec.id,
    passed: hasAllBlocks && isCorrect,
    score: Math.round((passedCount / checks.length) * 100),
    checks,
    stdout: "",
    stderr: "",
    runtimeError: null,
    durationMs: 0,
  };
}
