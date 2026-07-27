import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const path = "src/pages/HomePage/HomePage.tsx";
let source = readFileSync(path, "utf-8");

const advancedImport = `import {
  advancedGraduationLessonId,
  getAdvancedGraduationLesson,
  getAdvancedGraduationSnapshot,
} from "../../features/mastery/advancedGraduation";`;
const expertImport = `${advancedImport}
import {
  expertGraduationLessonId,
  getExpertGraduationLesson,
  getExpertGraduationSnapshot,
} from "../../features/mastery/expertGraduation";`;
if (!source.includes("getExpertGraduationSnapshot")) {
  if (!source.includes(advancedImport)) throw new Error("Advanced graduation import anchor not found.");
  source = source.replace(advancedImport, expertImport);
}

const advancedSnapshot = `  const advancedGraduation = useMemo(
    () => getAdvancedGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );`;
const expertSnapshot = `${advancedSnapshot}
  const expertGraduation = useMemo(
    () => getExpertGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );`;
if (!source.includes("const expertGraduation = useMemo")) {
  if (!source.includes(advancedSnapshot)) throw new Error("Advanced snapshot anchor not found.");
  source = source.replace(advancedSnapshot, expertSnapshot);
}

const lessonAnchor = `  const advancedGraduationLesson = getAdvancedGraduationLesson(catalog);`;
if (!source.includes("getExpertGraduationLesson(catalog)")) {
  if (!source.includes(lessonAnchor)) throw new Error("Advanced lesson anchor not found.");
  source = source.replace(
    lessonAnchor,
    `${lessonAnchor}\n  const expertGraduationLesson = getExpertGraduationLesson(catalog);`,
  );
}

source = source.replace(
  `resumeModule.id === "intermediate-project" || resumeModule.id === "advanced-project"`,
  `resumeModule.id === "intermediate-project" ||\n        resumeModule.id === "advanced-project" ||\n        resumeModule.id === "expert-project"`,
);

const blockStart = source.indexOf("  const showingAdvancedGraduation =");
const blockEnd = source.indexOf("\n\n  return (", blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error("Graduation view block not found.");

const graduationBlock = `  const showingExpertGraduation = advancedGraduation.graduated;
  const showingAdvancedGraduation =
    intermediateGraduation.graduated && !showingExpertGraduation;
  const showingIntermediateGraduation =
    beginnerGraduation.graduated && !showingAdvancedGraduation && !showingExpertGraduation;
  const graduationView = showingExpertGraduation
    ? {
        graduated: expertGraduation.graduated,
        unlocked: expertGraduation.projectUnlocked,
        masteryScore: expertGraduation.masteryScore,
        badgeName: expertGraduation.badgeName,
        completedCoreLessons: expertGraduation.completedCoreLessons,
        totalCoreLessons: expertGraduation.totalCoreLessons,
        completedCoreModules: expertGraduation.completedCoreModules,
        totalCoreModules: expertGraduation.totalCoreModules,
        weakTopics: expertGraduation.weakTopics,
        lesson: expertGraduationLesson,
        lessonId: expertGraduationLessonId,
        levelName: "Uzman Seviye",
        readyTitle: "Beş uzman modülü tek güvenilir analiz platformunda kanıtla",
        readyDescription:
          "Güvenilir Kod Analiz Platformu bitirme projesini tamamlayarak Uzman Seviye rozetini ve tam müfredat mezuniyetini kazan.",
        graduatedDescription:
          "Python Farming öğrenim rotasının tamamı başarıyla bitirildi. Başlangıçtan Uzman Seviyeye bütün yayımlanmış modüller ve bitirme projeleri tamamlandı.",
        graduatedBadgeTitle: "Tüm müfredat",
        graduatedBadgeStatus: "Tamamlandı",
      }
    : showingAdvancedGraduation
      ? {
          graduated: advancedGraduation.graduated,
          unlocked: advancedGraduation.projectUnlocked,
          masteryScore: advancedGraduation.masteryScore,
          badgeName: advancedGraduation.badgeName,
          completedCoreLessons: advancedGraduation.completedCoreLessons,
          totalCoreLessons: advancedGraduation.totalCoreLessons,
          completedCoreModules: advancedGraduation.completedCoreModules,
          totalCoreModules: advancedGraduation.totalCoreModules,
          weakTopics: advancedGraduation.weakTopics,
          lesson: advancedGraduationLesson,
          lessonId: advancedGraduationLessonId,
          levelName: "İleri Seviye",
          readyTitle: "Yedi ileri modülü tek üretim platformunda kanıtla",
          readyDescription:
            "Yerel Veri Platformu bitirme projesini tamamlayarak İleri Seviye rozetini kazan ve Uzman Seviye yolunu aç.",
          graduatedDescription:
            "Mezuniyet rozeti kazanıldı ve Uzman Seviye öğrenim yolu açıldı.",
          graduatedBadgeTitle: "Uzman Seviye",
          graduatedBadgeStatus: "Açıldı",
        }
      : showingIntermediateGraduation
        ? {
            graduated: intermediateGraduation.graduated,
            unlocked: intermediateGraduation.projectUnlocked,
            masteryScore: intermediateGraduation.masteryScore,
            badgeName: intermediateGraduation.badgeName,
            completedCoreLessons: intermediateGraduation.completedCoreLessons,
            totalCoreLessons: intermediateGraduation.totalCoreLessons,
            completedCoreModules: intermediateGraduation.completedCoreModules,
            totalCoreModules: intermediateGraduation.totalCoreModules,
            weakTopics: intermediateGraduation.weakTopics,
            lesson: intermediateGraduationLesson,
            lessonId: intermediateGraduationLessonId,
            levelName: "Orta Seviye",
            readyTitle: "Dokuz modülü üretim kalitesinde tek projede kanıtla",
            readyDescription:
              "Sipariş Yönetim Sistemi bitirme projesini tamamlayarak Orta Seviye rozetini kazan ve İleri Seviye yolunu aç.",
            graduatedDescription:
              "Mezuniyet rozeti kazanıldı ve İleri Seviye öğrenim yolu açıldı.",
            graduatedBadgeTitle: "İleri Seviye",
            graduatedBadgeStatus: "Açıldı",
          }
        : {
            graduated: beginnerGraduation.graduated,
            unlocked: beginnerGraduation.examUnlocked,
            masteryScore: beginnerGraduation.masteryScore,
            badgeName: beginnerGraduation.badgeName,
            completedCoreLessons: beginnerGraduation.completedCoreLessons,
            totalCoreLessons: beginnerGraduation.totalCoreLessons,
            completedCoreModules: beginnerGraduation.completedCoreModules,
            totalCoreModules: beginnerGraduation.totalCoreModules,
            weakTopics: beginnerGraduation.weakTopics,
            lesson: beginnerGraduationLesson,
            lessonId: beginnerGraduationLessonId,
            levelName: "Başlangıç",
            readyTitle: "Sekiz modülü tek projede kanıtla",
            readyDescription:
              "Kapsamlı Mağaza Analizörü projesini tamamlayarak rozetini kazan ve Orta Seviye kilidini kaldır.",
            graduatedDescription:
              "Mezuniyet rozeti kazanıldı ve Orta Seviye öğrenim yolu açıldı.",
            graduatedBadgeTitle: "Orta Seviye",
            graduatedBadgeStatus: "Açıldı",
          };`;
source = `${source.slice(0, blockStart)}${graduationBlock}${source.slice(blockEnd)}`;

source = source.replace(
  "? `Mezuniyet rozeti kazanıldı ve ${graduationView.nextLevel} öğrenim yolu açıldı.`",
  "? graduationView.graduatedDescription",
);
source = source.replace(
  "<span>{graduationView.nextLevel}</span>\n                  <strong>Açıldı</strong>",
  "<span>{graduationView.graduatedBadgeTitle}</span>\n                  <strong>{graduationView.graduatedBadgeStatus}</strong>",
);
source = source.replace('  "Expert Project Lab",', '  "Güvenilir Kod Analiz Platformu",');

writeFileSync(path, source, "utf-8");
unlinkSync("scripts/patch-expert-graduation-home.mjs");
unlinkSync(".github/workflows/patch-expert-graduation-home.yml");
