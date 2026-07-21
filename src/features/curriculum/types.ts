import type { TaskValidationSpec } from "../learning/taskValidationTypes";

export type CurriculumLessonMode =
  | "code"
  | "output-prediction"
  | "code-completion"
  | "debugging"
  | "code-ordering"
  | "refactoring"
  | "data-transformation";

export interface CurriculumChoiceOption {
  id: string;
  label: string;
}

export interface CurriculumCodeBlock {
  id: string;
  code: string;
}

export interface CurriculumDebuggingGuide {
  errorType: string;
  symptom: string;
  workflow: string[];
}

export interface CurriculumRefactoringGuide {
  problem: string;
  goal: string;
  workflow: string[];
}

export interface CurriculumDataTransformationGuide {
  sourceShape: string;
  targetShape: string;
  rules: string[];
  workflow: string[];
}

export interface CurriculumCatalog {
  version: number;
  levels: CurriculumLevel[];
  lessons: CurriculumLesson[];
}

export interface CurriculumModulePackageIndex {
  version: number;
  files: string[];
}

export interface CurriculumModulePackage {
  moduleId: string;
  lessons: CurriculumLesson[];
}

export interface CurriculumLevel {
  id: string;
  title: string;
  modules: CurriculumModule[];
}

export interface CurriculumModule {
  id: string;
  number: string;
  title: string;
  lessonIds: string[];
}

export interface CurriculumLesson {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  summary: string;
  levelLabel: string;
  mode?: CurriculumLessonMode;
  choice?: {
    prompt: string;
    options: CurriculumChoiceOption[];
  };
  ordering?: {
    prompt: string;
    blocks: CurriculumCodeBlock[];
  };
  debugging?: CurriculumDebuggingGuide;
  refactoring?: CurriculumRefactoringGuide;
  dataTransformation?: CurriculumDataTransformationGuide;
  task: {
    title: string;
    instructions: string[];
    requirements: string[];
    sampleOutput: string;
    stdinEnabled: boolean;
    stdinPlaceholder: string;
    defaultStdin: string;
  };
  editor: {
    filename: string;
    starterCode: string;
  };
  hints: Array<{
    title: string;
    body: string;
  }>;
  validation: TaskValidationSpec;
}
