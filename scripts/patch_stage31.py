from pathlib import Path


def replace(path: str, old: str, new: str):
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:80]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace(
    "src/features/learning/taskValidationTypes.ts",
    '''  | (TaskCheckBase & {
      kind: "capstone_project";
      requiredFiles: string[];
      testFiles: string[];
      minTests: number;
      minAssertions: number;
    })
  | (TaskCheckBase & {
      kind: "advanced_patterns";''',
    '''  | (TaskCheckBase & {
      kind: "capstone_project";
      requiredFiles: string[];
      testFiles: string[];
      minTests: number;
      minAssertions: number;
    })
  | (TaskCheckBase & {
      kind: "advanced_capstone";
      requiredFiles: string[];
      testFiles: string[];
      minTests: number;
      minAssertions: number;
    })
  | (TaskCheckBase & {
      kind: "advanced_patterns";''',
)

replace(
    "src/features/learning/store/taskValidationStore.ts",
    'import { validateCapstoneTask } from "../services/capstoneTaskValidationService";\n',
    'import { validateAdvancedCapstoneTask } from "../services/advancedCapstoneTaskValidationService";\nimport { validateCapstoneTask } from "../services/capstoneTaskValidationService";\n',
)
replace(
    "src/features/learning/store/taskValidationStore.ts",
    '''function requiresCapstoneValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "capstone_project");
}

function requiresAsyncProgrammingValidation''',
    '''function requiresAdvancedCapstoneValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "advanced_capstone");
}

function requiresCapstoneValidation(spec: TaskValidationSpec) {
  return spec.checks.some((check) => check.kind === "capstone_project");
}

function requiresAsyncProgrammingValidation''',
)
replace(
    "src/features/learning/store/taskValidationStore.ts",
    ''': requiresCapstoneValidation(spec)
               ? await validateCapstoneTask({ files, entrypoint, stdin, spec })
               : requiresAsyncProgrammingValidation(spec)''',
    ''': requiresAdvancedCapstoneValidation(spec)
              ? await validateAdvancedCapstoneTask({ files, entrypoint, stdin, spec })
              : requiresCapstoneValidation(spec)
                ? await validateCapstoneTask({ files, entrypoint, stdin, spec })
                : requiresAsyncProgrammingValidation(spec)''',
)

replace(
    "src/pages/HomePage/HomePage.tsx",
    '''import {
  beginnerGraduationLessonId,''',
    '''import {
  advancedGraduationLessonId,
  getAdvancedGraduationLesson,
  getAdvancedGraduationSnapshot,
} from "../../features/mastery/advancedGraduation";
import {
  beginnerGraduationLessonId,''',
)
replace(
    "src/pages/HomePage/HomePage.tsx",
    '''  const intermediateGraduation = useMemo(
    () => getIntermediateGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const beginnerGraduationLesson = getBeginnerGraduationLesson(catalog);
  const intermediateGraduationLesson = getIntermediateGraduationLesson(catalog);''',
    '''  const intermediateGraduation = useMemo(
    () => getIntermediateGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const advancedGraduation = useMemo(
    () => getAdvancedGraduationSnapshot(catalog, completedLessonIds),
    [catalog, completedLessonIds],
  );
  const beginnerGraduationLesson = getBeginnerGraduationLesson(catalog);
  const intermediateGraduationLesson = getIntermediateGraduationLesson(catalog);
  const advancedGraduationLesson = getAdvancedGraduationLesson(catalog);''',
)

start = '''  const levelRows = roadmapLevels.map((level) => {
    const isBeginner = level.id === "beginner";
    const isIntermediate = level.id === "intermediate";
    const isAdvanced = level.id === "advanced";
    return {
      ...level,
      completedModules: isBeginner
        ? completedBeginnerModules
        : isIntermediate
          ? completedIntermediateModules
          : isAdvanced
            ? completedAdvancedModules
            : 0,
      progress: isBeginner
        ? beginnerRoadmapProgress
        : isIntermediate
          ? intermediateRoadmapProgress
          : isAdvanced
            ? advancedRoadmapProgress
            : 0,
      locked: isBeginner
        ? false
        : isIntermediate
          ? !beginnerGraduation.intermediateUnlocked
          : isAdvanced
            ? !intermediateGraduation.advancedUnlocked
            : true,
      unlocked:
        (isIntermediate && beginnerGraduation.intermediateUnlocked) ||
        (isAdvanced && intermediateGraduation.advancedUnlocked),
    };
  });'''
end = '''  const levelRows = roadmapLevels.map((level) => {
    const isBeginner = level.id === "beginner";
    const isIntermediate = level.id === "intermediate";
    const isAdvanced = level.id === "advanced";
    const isExpert = level.id === "expert";
    return {
      ...level,
      completedModules: isBeginner
        ? completedBeginnerModules
        : isIntermediate
          ? completedIntermediateModules
          : isAdvanced
            ? completedAdvancedModules
            : 0,
      progress: isBeginner
        ? beginnerRoadmapProgress
        : isIntermediate
          ? intermediateRoadmapProgress
          : isAdvanced
            ? advancedRoadmapProgress
            : 0,
      locked: isBeginner
        ? false
        : isIntermediate
          ? !beginnerGraduation.intermediateUnlocked
          : isAdvanced
            ? !intermediateGraduation.advancedUnlocked
            : isExpert
              ? !advancedGraduation.expertUnlocked
              : true,
      unlocked:
        (isIntermediate && beginnerGraduation.intermediateUnlocked) ||
        (isAdvanced && intermediateGraduation.advancedUnlocked) ||
        (isExpert && advancedGraduation.expertUnlocked),
    };
  });'''
replace("src/pages/HomePage/HomePage.tsx", start, end)

replace(
    "src/pages/HomePage/HomePage.tsx",
    '''    resumeModule.id === "beginner-graduation"
      ? "Sınav"
      : resumeModule.id === "intermediate-project"
        ? "Bitirme Projesi"''',
    '''    resumeModule.id === "beginner-graduation"
      ? "Sınav"
      : resumeModule.id === "intermediate-project" || resumeModule.id === "advanced-project"
        ? "Bitirme Projesi"''',
)

old_view = '''  const showingIntermediateGraduation = beginnerGraduation.graduated;
  const graduationView = showingIntermediateGraduation
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
        nextLevel: "İleri Seviye",
        readyTitle: "Dokuz modülü üretim kalitesinde tek projede kanıtla",
        readyDescription:
          "Sipariş Yönetim Sistemi bitirme projesini tamamlayarak Orta Seviye rozetini kazan ve İleri Seviye yolunu aç.",
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
        nextLevel: "Orta Seviye",
        readyTitle: "Sekiz modülü tek projede kanıtla",
        readyDescription:
          "Kapsamlı Mağaza Analizörü projesini tamamlayarak rozetini kazan ve Orta Seviye kilidini kaldır.",
      };'''
new_view = '''  const showingAdvancedGraduation = intermediateGraduation.graduated;
  const showingIntermediateGraduation = beginnerGraduation.graduated;
  const graduationView = showingAdvancedGraduation
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
        nextLevel: "Uzman Seviye",
        readyTitle: "Yedi ileri modülü tek üretim platformunda kanıtla",
        readyDescription:
          "Yerel Veri Platformu bitirme projesini tamamlayarak İleri Seviye rozetini kazan ve Uzman Seviye yolunu aç.",
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
          nextLevel: "İleri Seviye",
          readyTitle: "Dokuz modülü üretim kalitesinde tek projede kanıtla",
          readyDescription:
            "Sipariş Yönetim Sistemi bitirme projesini tamamlayarak Orta Seviye rozetini kazan ve İleri Seviye yolunu aç.",
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
          nextLevel: "Orta Seviye",
          readyTitle: "Sekiz modülü tek projede kanıtla",
          readyDescription:
            "Kapsamlı Mağaza Analizörü projesini tamamlayarak rozetini kazan ve Orta Seviye kilidini kaldır.",
        };'''
replace("src/pages/HomePage/HomePage.tsx", old_view, new_view)
