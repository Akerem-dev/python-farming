export type TaskCheckVisibility = "visible" | "hidden";

export type TaskCaseValue =
  | string
  | number
  | boolean
  | null
  | TaskCaseValue[]
  | { [key: string]: TaskCaseValue };

interface TaskCheckBase {
  id: string;
  label: string;
  visibility: TaskCheckVisibility;
}

export type TaskCheck =
  | (TaskCheckBase & {
      kind: "assignment";
      name: string;
    })
  | (TaskCheckBase & {
      kind: "call";
      name: string;
    })
  | (TaskCheckBase & {
      kind: "call_count";
      name: string;
      min: number;
      max?: number;
    })
  | (TaskCheckBase & {
      kind: "node_count";
      nodeName: string;
      min: number;
      max?: number;
    })
  | (TaskCheckBase & {
      kind: "function_definition";
      name: string;
      minParams: number;
      maxParams?: number;
      minDefaults?: number;
      maxDefaults?: number;
      requireReturn?: boolean;
    })
  | (TaskCheckBase & {
      kind: "function_cases";
      name: string;
      cases: Array<{
        args: TaskCaseValue[];
        expected: TaskCaseValue;
      }>;
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
