export type TaskCheckVisibility = "visible" | "hidden";

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

export interface TaskValidationSpec {
  id: string;
  title: string;
  xpReward: number;
  timeoutMs: number;
  checks: TaskCheck[];
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
