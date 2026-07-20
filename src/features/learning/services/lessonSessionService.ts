import { beginnerStarterCode } from "../../../editor/editorStore";

export interface LessonHint {
  id: string;
  title: string;
  body: string;
}

export interface LessonSessionDefinition {
  id: string;
  starterCode: string;
  hints: LessonHint[];
}

export const beginnerVariablesLesson: LessonSessionDefinition = {
  id: "beginner-variables-01",
  starterCode: beginnerStarterCode,
  hints: [
    {
      id: "variable-assignment",
      title: "Değişkene değer atama",
      body: 'Metin değerlerini çift tırnak içinde yazabilirsin: ad = "Ali".',
    },
    {
      id: "integer-value",
      title: "Sayı değerleri",
      body: "Tam sayıları tırnak kullanmadan atamalısın: yas = 20.",
    },
    {
      id: "formatted-string",
      title: "f-string kullanımı",
      body: "Süslü parantez içindeki değişkenler f-string içinde gerçek değerleriyle değiştirilir.",
    },
  ],
};

export function getLessonHint(usedHintCount: number) {
  return beginnerVariablesLesson.hints[usedHintCount] ?? null;
}
