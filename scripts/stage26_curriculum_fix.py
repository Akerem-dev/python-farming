from pathlib import Path

path = Path("src/features/curriculum/services/curriculumService.ts")
text = path.read_text(encoding="utf-8")
old = '''    const hasObjectModelingChecks = hasClassDefinitionCheck && hasClassCasesCheck;
    if (!hasFunctionTransformationChecks && !hasObjectModelingChecks) {
      throw new Error(`${lesson.id} veri dönüşümü görevi yapısal ve gizli testleri içermiyor.`);
    }'''
new = '''    const hasObjectModelingChecks = hasClassDefinitionCheck && hasClassCasesCheck;
    const hasAdvancedStreamChecks = validation.checks.some(
      (check) =>
        check.kind === "advanced_patterns" &&
        Array.isArray((check as { generators?: unknown[] }).generators) &&
        ((check as { generators?: unknown[] }).generators?.length ?? 0) > 0 &&
        Array.isArray(check.functionCases) &&
        check.functionCases.length > 0,
    );
    if (
      !hasFunctionTransformationChecks &&
      !hasObjectModelingChecks &&
      !hasAdvancedStreamChecks
    ) {
      throw new Error(`${lesson.id} veri dönüşümü görevi yapısal ve gizli testleri içermiyor.`);
    }'''
if old not in text:
    raise RuntimeError("Data transformation compatibility block was not found.")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
