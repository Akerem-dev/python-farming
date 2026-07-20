import { describe, expect, it } from "vitest";
import { validateOrderAnswer } from "../../features/learning/services/orderValidationService";
import type { TaskValidationSpec } from "../../features/learning/taskValidationTypes";

const orderingSpec: TaskValidationSpec = {
  id: "beginner.loops.ordering",
  title: "Döngü bloklarını sırala",
  xpReward: 50,
  timeoutMs: 1000,
  checks: [],
  answer: {
    kind: "order",
    correctBlockIds: ["header", "loop", "body", "done"],
  },
};

describe("code ordering validation", () => {
  it("accepts the exact published block order", () => {
    const result = validateOrderAnswer(orderingSpec, ["header", "loop", "body", "done"]);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects a complete but incorrectly ordered answer", () => {
    const result = validateOrderAnswer(orderingSpec, ["loop", "header", "body", "done"]);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(50);
    expect(result.checks.find((check) => check.visibility === "hidden")?.passed).toBe(false);
  });

  it("rejects missing or repeated blocks", () => {
    const result = validateOrderAnswer(orderingSpec, ["header", "loop", "loop", "done"]);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.checks[0]?.passed).toBe(false);
  });
});
