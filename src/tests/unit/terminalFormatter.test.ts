import { describe, expect, it } from "vitest";
import { formatTerminalOutput } from "../../runtime/terminalFormatter";

const health = {
  status: "ready" as const,
  version: "Python 3.12.4",
  executable: "python",
  message: "Hazır",
};

describe("formatTerminalOutput", () => {
  it("shows a ready prompt before the first execution", () => {
    expect(
      formatTerminalOutput({
        status: "ready",
        health,
        output: null,
        errorMessage: null,
      }),
    ).toContain("Kodunu çalıştırmaya hazır");
  });

  it("combines stdout and execution metadata", () => {
    const output = formatTerminalOutput({
      status: "ready",
      health,
      errorMessage: null,
      output: {
        status: "ok",
        diagnostics: [],
        result: {
          stdout: "Merhaba\n",
          stderr: "",
          exitCode: 0,
          durationMs: 18,
          truncated: false,
        },
      },
    });

    expect(output).toContain("Merhaba");
    expect(output).toContain("Çıkış kodu: 0 · 18 ms");
  });

  it("explains when an execution times out", () => {
    const output = formatTerminalOutput({
      status: "ready",
      health,
      errorMessage: null,
      output: {
        status: "timeout",
        diagnostics: [],
        result: {
          stdout: "",
          stderr: "",
          exitCode: null,
          durationMs: 4_000,
          truncated: false,
        },
      },
    });

    expect(output).toContain("Süre sınırı aşıldı");
  });
});
