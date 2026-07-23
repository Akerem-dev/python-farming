from pathlib import Path

path = Path("src/features/learning/taskValidationTypes.ts")
text = path.read_text(encoding="utf-8")
start_marker = "export interface TaskPatternCase {"
end_marker = "interface TaskCheckBase {"
start = text.index(start_marker)
end = text.index(end_marker, start)
canonical = '''export interface TaskPatternCase {
  args: TaskCaseValue[];
  kwargs?: { [key: string]: TaskCaseValue };
  expected?: TaskCaseValue;
  outputPattern?: string;
}

export interface TaskDecoratorTargetExpectation {
  name: string;
  module?: string;
  file?: string;
  expectedName?: string;
  expectedDoc?: string;
  cases: TaskPatternCase[];
}

export interface TaskContextProbeExpectation {
  name: string;
  module?: string;
  cases: TaskPatternCase[];
}

'''
path.write_text(text[:start] + canonical + text[end:], encoding="utf-8")
