import { describe, expect, it } from "vitest";
import {
  parseTaskValidationOutput,
  splitStdinText,
} from "../../features/learning/services/taskValidationService";
import { variablesIntroductionTask } from "../../features/learning/taskSpecs";

const validResult = {
  taskId: "beginner.variables.introduction",
  passed: true,
  score: 100,
  checks: [
    {
      id: "assign-ad",
      label: "ad değişkeni tanımlandı",
      visibility: "visible",
      passed: true,
      message: "ad değişkeni bulundu.",
    },
  ],
  stdout: "Merhaba, ben Kerem ve 23 yaşındayım.\n",
  stderr: "",
  runtimeError: null,
  durationMs: 2,
};

describe("task validation service", () => {
  it("parses a valid validator response", () => {
    expect(parseTaskValidationOutput(JSON.stringify(validResult))).toEqual(validResult);
  });

  it("rejects an invalid validator response", () => {
    expect(() => parseTaskValidationOutput('{"passed":true}')).toThrow(
      "Görev doğrulama sonucu beklenen biçimde değil.",
    );
  });

  it("turns each stdin line into a separate input value", () => {
    expect(splitStdinText("Kerem\r\n23")).toEqual(["Kerem", "23"]);
    expect(splitStdinText("")).toEqual([]);
  });

  it("keeps visible requirements separate from hidden tests", () => {
    const visible = variablesIntroductionTask.checks.filter(
      (check) => check.visibility === "visible",
    );
    const hidden = variablesIntroductionTask.checks.filter(
      (check) => check.visibility === "hidden",
    );

    expect(visible).toHaveLength(3);
    expect(hidden).toHaveLength(5);
  });
});
