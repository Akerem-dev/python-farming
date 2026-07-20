import type { TaskValidationSpec } from "../learning/taskValidationTypes";

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
