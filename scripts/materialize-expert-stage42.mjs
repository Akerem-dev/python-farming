import { readFileSync, writeFileSync } from "node:fs";

const curriculumPath = "public/content/curriculum.json";
const homePagePath = "src/pages/HomePage/HomePage.tsx";

const curriculum = JSON.parse(readFileSync(curriculumPath, "utf8"));

if (!curriculum.levels.some((level) => level.id === "expert")) {
  curriculum.levels.push({
    id: "expert",
    title: "Uzman Seviye",
    modules: [
      { id: "algorithms-complexity", number: "01", title: "Algoritmalar ve Karmaşıklık", lessonIds: [] },
      { id: "parallelism-systems", number: "02", title: "Paralellik ve Sistem Programlama", lessonIds: [] },
      { id: "compilers-metaprogramming", number: "03", title: "AST, Derleyiciler ve Metaprogramlama", lessonIds: [] },
      { id: "distributed-resilience", number: "04", title: "Dağıtık Sistemler ve Dayanıklılık", lessonIds: [] },
      { id: "security-observability", number: "05", title: "Güvenlik ve Gözlemlenebilirlik", lessonIds: [] },
      { id: "expert-project", number: "06", title: "Uzmanlık Projesi", lessonIds: [] }
    ]
  });
}

writeFileSync(curriculumPath, `${JSON.stringify(curriculum, null, 2)}\n`, "utf8");

let home = readFileSync(homePagePath, "utf8");

const advancedProgressBlock = `  const advancedRoadmapProgress = Math.round((completedAdvancedModules / 8) * 100);\n`;
const expertProgressBlock = `${advancedProgressBlock}  const expertModules =\n    catalog?.levels.find((level) => level.id === "expert")?.modules ?? [];\n  const completedExpertModules = expertModules.filter((module) =>\n    isModuleCompleted(module, completedLessonIds),\n  ).length;\n  const expertRoadmapProgress = Math.round((completedExpertModules / 6) * 100);\n`;
if (!home.includes("const expertModules =")) {
  if (!home.includes(advancedProgressBlock)) throw new Error("Advanced progress insertion point missing.");
  home = home.replace(advancedProgressBlock, expertProgressBlock);
}

home = home.replace(
  `          : isAdvanced\n            ? completedAdvancedModules\n            : 0,`,
  `          : isAdvanced\n            ? completedAdvancedModules\n            : isExpert\n              ? completedExpertModules\n              : 0,`,
);

home = home.replace(
  `          : isAdvanced\n            ? advancedRoadmapProgress\n            : 0,`,
  `          : isAdvanced\n            ? advancedRoadmapProgress\n            : isExpert\n              ? expertRoadmapProgress\n              : 0,`,
);

home = home.replace(
  `          : resumeLevel?.id === "advanced"\n            ? "İleri Seviye"\n            : "Başlangıç";`,
  `          : resumeLevel?.id === "advanced"\n            ? "İleri Seviye"\n            : resumeLevel?.id === "expert"\n              ? "Uzman Seviye"\n              : "Başlangıç";`,
);

writeFileSync(homePagePath, home, "utf8");
