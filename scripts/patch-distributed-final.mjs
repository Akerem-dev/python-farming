import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const modulePath = "public/content/modules/distributed-resilience.json";
const testPath = "src/test/content/distributedResilienceContent.test.ts";
const workflowPath = ".github/workflows/patch-distributed-final.yml";
const scriptPath = "scripts/patch-distributed-final.mjs";

const modulePackage = JSON.parse(readFileSync(modulePath, "utf-8"));
const finalLesson = modulePackage.lessons.find(
  (lesson) => lesson.id === "expert.distributed.final",
);
if (!finalLesson) throw new Error("Final distributed lesson not found.");

finalLesson.validation.checks = finalLesson.validation.checks.flatMap((check) => {
  if (check.id === "retry-class") {
    return [{
      id: "retry-class",
      kind: "file_content_regex",
      path: "dayanikli_sistem/retry.py",
      pattern: "class\\s+RetryPolicy\\s*:[\\s\\S]*def\\s+calistir\\s*\\(",
      flags: "s",
      label: "RetryPolicy ve calistir() tanımlandı",
      visibility: "visible",
    }];
  }
  if (check.id === "registry-class") {
    return [
      {
        id: "registry-class",
        kind: "file_content_regex",
        path: "dayanikli_sistem/idempotency.py",
        pattern: "class\\s+IdempotencyRegistry\\s*:[\\s\\S]*def\\s+icerir\\s*\\([\\s\\S]*def\\s+ekle\\s*\\(",
        flags: "s",
        label: "IdempotencyRegistry sözleşmesi tanımlandı",
        visibility: "visible",
      },
      {
        id: "registry-set",
        kind: "call",
        name: "set",
        file: "dayanikli_sistem/idempotency.py",
        label: "Idempotency kimlikleri set ile tutuluyor",
        visibility: "visible",
      },
    ];
  }
  if (check.id === "breaker-class") {
    return [{
      id: "breaker-class",
      kind: "file_content_regex",
      path: "dayanikli_sistem/breaker.py",
      pattern: "class\\s+CircuitBreaker\\s*:[\\s\\S]*def\\s+izin_ver\\s*\\([\\s\\S]*def\\s+basari\\s*\\([\\s\\S]*def\\s+hata\\s*\\(",
      flags: "s",
      label: "CircuitBreaker durum sözleşmesi tanımlandı",
      visibility: "visible",
    }];
  }
  return [check];
});

writeFileSync(modulePath, `${JSON.stringify(modulePackage, null, 2)}\n`, "utf-8");

let testSource = readFileSync(testPath, "utf-8");
testSource = testSource.replace(
  'kind: "class_definition",\n          name: "RetryPolicy",',
  'kind: "file_content_regex",\n          path: "dayanikli_sistem/retry.py",',
);
testSource = testSource.replace(
  'kind: "class_definition",\n          name: "CircuitBreaker",',
  'kind: "file_content_regex",\n          path: "dayanikli_sistem/breaker.py",',
);
writeFileSync(testPath, testSource, "utf-8");

unlinkSync(scriptPath);
unlinkSync(workflowPath);
