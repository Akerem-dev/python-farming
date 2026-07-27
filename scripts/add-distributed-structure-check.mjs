import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";

const modulePath = "public/content/modules/distributed-resilience.json";
const testPath = "src/test/content/distributedResilienceContent.test.ts";
const scriptPath = "scripts/add-distributed-structure-check.mjs";
const workflowPath = ".github/workflows/add-distributed-structure-check.yml";
const diagnosticPath = "frontend-failure.txt";

const modulePackage = JSON.parse(readFileSync(modulePath, "utf-8"));
const finalLesson = modulePackage.lessons.find(
  (lesson) => lesson.id === "expert.distributed.final",
);
if (!finalLesson) throw new Error("Final distributed lesson not found.");

if (!finalLesson.validation.checks.some((check) => check.id === "orchestrator-loop")) {
  const reportIndex = finalLesson.validation.checks.findIndex(
    (check) => check.id === "report-cases",
  );
  if (reportIndex < 0) throw new Error("Hidden report cases not found.");
  finalLesson.validation.checks.splice(reportIndex, 0, {
    id: "orchestrator-loop",
    kind: "node_count",
    nodeName: "For",
    min: 1,
    file: "dayanikli_sistem/orchestrator.py",
    label: "Olay akışı yapısal olarak döngüyle işleniyor",
    visibility: "visible",
  });
}
writeFileSync(modulePath, `${JSON.stringify(modulePackage, null, 2)}\n`, "utf-8");

let testSource = readFileSync(testPath, "utf-8");
const anchor = `        expect.objectContaining({\n          kind: "function_cases",\n          name: "dayaniklilik_raporu",`;
if (!testSource.includes("nodeName: \"For\"")) {
  testSource = testSource.replace(
    anchor,
    `        expect.objectContaining({\n          kind: "node_count",\n          nodeName: "For",\n          file: "dayanikli_sistem/orchestrator.py",\n        }),\n${anchor}`,
  );
}
writeFileSync(testPath, testSource, "utf-8");

if (existsSync(diagnosticPath)) unlinkSync(diagnosticPath);
unlinkSync(scriptPath);
unlinkSync(workflowPath);
