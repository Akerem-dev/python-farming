export type TaskCheckVisibility = "visible" | "hidden";

export type TaskCaseValue =
  | string
  | number
  | boolean
  | null
  | TaskCaseValue[]
  | { [key: string]: TaskCaseValue };

export type TaskObjectAction =
  | {
      kind: "call";
      name: string;
      args: TaskCaseValue[];
    }
  | {
      kind: "setattr";
      name: string;
      value: TaskCaseValue;
    };

export type TaskObjectObservation =
  | {
      kind: "attribute";
      name: string;
    }
  | {
      kind: "method";
      name: string;
      args: TaskCaseValue[];
    }
  | {
      kind: "repr";
    };

export interface TaskTestMutant {
  id: string;
  label: string;
  file: string;
  source: string;
}

interface TaskCheckBase {
  id: string;
  label: string;
  visibility: TaskCheckVisibility;
}

export type TaskCheck =
  | (TaskCheckBase & {
      kind: "assignment";
      name: string;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "call";
      name: string;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "call_count";
      name: string;
      min: number;
      max?: number;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "node_count";
      nodeName: string;
      min: number;
      max?: number;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "function_definition";
      name: string;
      minParams: number;
      maxParams?: number;
      minDefaults?: number;
      maxDefaults?: number;
      requireReturn?: boolean;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "function_cases";
      name: string;
      module?: string;
      cases: Array<{
        args: TaskCaseValue[];
        expected: TaskCaseValue;
      }>;
    })
  | (TaskCheckBase & {
      kind: "function_raises";
      name: string;
      module?: string;
      cases: Array<{
        args: TaskCaseValue[];
        exception: string;
        messagePattern?: string;
      }>;
    })
  | (TaskCheckBase & {
      kind: "class_definition";
      name: string;
      minInitParams: number;
      maxInitParams?: number;
      requiredMethods?: string[];
      requiredProperties?: string[];
      requiredSetters?: string[];
      requiredAttributes?: string[];
      requiredBases?: string[];
      requiredClassMethods?: string[];
      requiredStaticMethods?: string[];
      requiredOverrides?: string[];
      requiredSuperCalls?: string[];
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "class_cases";
      name: string;
      module?: string;
      cases: Array<{
        initArgs: TaskCaseValue[];
        actions?: TaskObjectAction[];
        observe: TaskObjectObservation;
        expected?: TaskCaseValue;
        exception?: string;
        messagePattern?: string;
      }>;
    })
  | (TaskCheckBase & {
      kind: "exception_handling";
      requiredTypes: string[];
      minHandlers: number;
      maxHandlers?: number;
      requireElse?: boolean;
      requireFinally?: boolean;
      disallowBareExcept?: boolean;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "exception_class";
      name: string;
      base: string;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "raise_exception";
      name: string;
      min: number;
      max?: number;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "test_suite";
      testFiles: string[];
      minTests: number;
      minAssertions: number;
      minParametrizeCases?: number;
      requireRaises?: string[];
      mutants: TaskTestMutant[];
    })
  | (TaskCheckBase & {
      kind: "file_exists";
      path: string;
    })
  | (TaskCheckBase & {
      kind: "file_content_regex";
      path: string;
      pattern: string;
      flags?: string;
    })
  | (TaskCheckBase & {
      kind: "json_file_equals";
      path: string;
      expected: TaskCaseValue;
    })
  | (TaskCheckBase & {
      kind: "file_unchanged";
      path: string;
    })
  | (TaskCheckBase & {
      kind: "import_statement";
      module: string;
      name?: string;
      file?: string;
    })
  | (TaskCheckBase & {
      kind: "variable_type";
      name: string;
      expectedType: "str" | "int" | "float" | "bool" | "list" | "tuple" | "dict" | "set";
    })
  | (TaskCheckBase & {
      kind: "variable_non_empty";
      name: string;
    })
  | (TaskCheckBase & {
      kind: "variable_positive";
      name: string;
    })
  | (TaskCheckBase & {
      kind: "stdout_regex";
      pattern: string;
      flags?: string;
    });

export interface ChoiceAnswerValidation {
  kind: "choice";
  correctOptionId: string;
}

export interface OrderAnswerValidation {
  kind: "order";
  correctBlockIds: string[];
}

export type TaskAnswerValidation = ChoiceAnswerValidation | OrderAnswerValidation;

export interface TaskValidationSpec {
  id: string;
  title: string;
  xpReward: number;
  timeoutMs: number;
  checks: TaskCheck[];
  answer?: TaskAnswerValidation;
}

export interface TaskCheckResult {
  id: string;
  label: string;
  visibility: TaskCheckVisibility;
  passed: boolean;
  message: string;
}

export interface TaskValidationResult {
  taskId: string;
  passed: boolean;
  score: number;
  checks: TaskCheckResult[];
  stdout: string;
  stderr: string;
  runtimeError: string | null;
  durationMs: number;
}
