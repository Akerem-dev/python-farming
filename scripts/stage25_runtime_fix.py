from pathlib import Path

path = Path("src/features/learning/services/advancedPatternTaskValidationService.ts")
text = path.read_text(encoding="utf-8")
start = text.index("  const validatorFile: RuntimeSourceFile = {")
end = text.index("  return parseTaskValidationOutput(result.stdout);", start) + len(
    "  return parseTaskValidationOutput(result.stdout);"
)
replacement = '''  const validatorFile: RuntimeSourceFile = {
    path: VALIDATOR_PATH,
    content: VALIDATOR_SOURCE,
  };
  const projectFiles = [validatorFile, ...input.files];
  const response = await runtimeClient.send<ExecuteCodeResult>({
    requestId: createRequestId(),
    protocolVersion: runtimeProtocolVersion,
    kind: "execute_code",
    payload: {
      source: VALIDATOR_SOURCE,
      filename: VALIDATOR_PATH,
      files: projectFiles,
      entrypoint: VALIDATOR_PATH,
      stdin: [
        JSON.stringify({
          files: projectFiles.map((file) => file.path),
          entrypoint: input.entrypoint,
          spec: input.spec,
        }),
      ],
      timeoutMs: input.spec.timeoutMs,
    },
  });

  if (!response.payload) {
    throw new Error("Decorator/context manager doğrulama motoru sonuç döndürmedi.");
  }
  if (response.status !== "ok") {
    const diagnostic = response.diagnostics[0]?.message;
    const runtimeMessage = response.payload.stderr.trim();
    throw new Error(
      diagnostic || runtimeMessage || "İleri seviye doğrulayıcı çalıştırılamadı.",
    );
  }
  return parseTaskValidationOutput(response.payload.stdout);'''
path.write_text(text[:start] + replacement + text[end:], encoding="utf-8")
