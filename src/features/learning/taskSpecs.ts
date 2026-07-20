import type { TaskValidationSpec } from "./taskValidationTypes";

export const variablesIntroductionTask: TaskValidationSpec = {
  id: "beginner.variables.introduction",
  title: "Kendini tanıtan iki değişken oluştur",
  xpReward: 40,
  timeoutMs: 4_000,
  checks: [
    {
      id: "assign-ad",
      kind: "assignment",
      name: "ad",
      label: "ad değişkeni tanımlandı",
      visibility: "visible",
    },
    {
      id: "assign-yas",
      kind: "assignment",
      name: "yas",
      label: "yas değişkeni tanımlandı",
      visibility: "visible",
    },
    {
      id: "call-print",
      kind: "call",
      name: "print",
      label: "print() kullanıldı",
      visibility: "visible",
    },
    {
      id: "ad-string",
      kind: "variable_type",
      name: "ad",
      expectedType: "str",
      label: "Gizli test 1",
      visibility: "hidden",
    },
    {
      id: "ad-not-empty",
      kind: "variable_non_empty",
      name: "ad",
      label: "Gizli test 2",
      visibility: "hidden",
    },
    {
      id: "yas-integer",
      kind: "variable_type",
      name: "yas",
      expectedType: "int",
      label: "Gizli test 3",
      visibility: "hidden",
    },
    {
      id: "yas-positive",
      kind: "variable_positive",
      name: "yas",
      label: "Gizli test 4",
      visibility: "hidden",
    },
    {
      id: "expected-output",
      kind: "stdout_regex",
      pattern: "^Merhaba,\\s*ben\\s+.+\\s+ve\\s+\\d+\\s+yaşındayım\\.\\s*$",
      flags: "im",
      label: "Gizli test 5",
      visibility: "hidden",
    },
  ],
};
