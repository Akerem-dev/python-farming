import { describe, expect, it } from "vitest";
import { formatTerminalOutput } from "../../runtime/terminalFormatter";

const health = {
  status: "ready" as const,
  version: "Python 3.12.4",
  executable: "python",
  security: {
    policyVersion: 1,
    filesystemScope: "workspace-only" as const,
    networkAccess: "blocked" as const,
    subprocessAccess: "blocked" as const,
    environmentIsolated: true,
    processTreeTermination: true,
    maxWorkspaceBytes: 16 * 1024 * 1024,
    maxWorkspaceFiles: 512,
  },
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

  it("shows program output without execution metadata", () => {
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

    expect(output).toBe("Merhaba");
    expect(output).not.toContain("Çıkış kodu");
    expect(output).not.toContain("18 ms");
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
